import { useState, useEffect, useRef } from "react";
import ChatClient from "../../../services/core/ChatClient";
import { queryDB, executeDB } from "../../../services/storage/sqliteService";
import { ChatMessage } from "../types";

interface UseMessageLogicProps {
  activeChat: string | null;
  activeChatRef: React.MutableRefObject<string | null>;
  loadSessions: () => void;
}

export const useMessageLogic = ({
  activeChat,
  activeChatRef,
  loadSessions,
}: UseMessageLogicProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (activeChat) {
      loadHistory(activeChat);
    } else {
      setMessages([]);
    }
  }, [activeChat]);

  const loadHistory = async (sid: string, beforeTimestamp?: number, maintainCount?: number) => {
    let query = `SELECT m.*, 
              md.status as mediaStatus, 
              md.filename as mediaFilename, 
              md.file_size as mediaTotalSize, 
              md.size as mediaCurrentSize,
              md.download_progress as mediaProgress,
              md.mime_type as mediaMime,
              md.thumbnail
       FROM messages m
       LEFT JOIN media md ON m.id = md.message_id
       WHERE m.sid = ? `;
    const params: any[] = [sid];

    if (beforeTimestamp) {
      query += ` AND m.timestamp < ? `;
      params.push(beforeTimestamp);
    }

    const limit = maintainCount ? maintainCount : 30;
    query += ` ORDER BY m.timestamp DESC LIMIT ?`;
    params.push(limit);

    const rows = await queryDB(query, params);
    const formatted = rows.map((r: any) => ({
      ...r,
      replyTo: r.reply_to ? JSON.parse(r.reply_to) : undefined,
    }));
    
    if (!beforeTimestamp && !maintainCount) {
      setMessages(formatted.reverse());
    } else if (maintainCount) {
      setMessages((prev) => {
        // preserve optimistic messages if they exist by mapping existing tempIds or just replacing what's in DB
        // since we are replacing the view, we just replace it.
        return formatted.reverse();
      });
    } else {
      setMessages((prev) => {
        if (formatted.length === 0) return prev;
        return [...formatted.reverse(), ...prev];
      });
    }
  };

  const loadMoreHistory = () => {
    if (activeChatRef.current && messagesRef.current.length > 0) {
      const earliest = messagesRef.current[0].timestamp;
      loadHistory(activeChatRef.current, earliest);
    }
  };

  useEffect(() => {
    const client = ChatClient;

    const onMsg = async (msg: ChatMessage) => {
      if (msg.sid === activeChatRef.current) {
        setMessages((prev) => [...prev, msg]);
        await executeDB("UPDATE messages SET is_read = 1 WHERE id = ?", [
          msg.id,
        ]);
      }
      loadSessions();
    };

    const onDownloadProgress = ({ messageId, progress }: any) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, mediaProgress: progress, mediaStatus: "downloading" }
            : m,
        ),
      );
    };

    const onFileDownloaded = ({ messageId }: any) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, mediaStatus: "downloaded", mediaProgress: 1 }
            : m,
        ),
      );
    };

    const onMessageStatus = ({ sid }: { sid: string }) => {
      if (sid === activeChatRef.current) {
        loadHistory(sid, undefined, Math.max(30, messagesRef.current.length));
      }
    };

    client.on("message_status", ({ sid }) => {
      if (sid === activeChatRef.current) {
        loadHistory(sid, undefined, Math.max(30, messagesRef.current.length));
      }
    });

    const onMessageUpdated = ({ sid, id, text, type }: any) => {
      if (sid === activeChatRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, text, type: type || m.type } : m,
          ),
        );
      }
      loadSessions();
    };

    const onMessageDeleted = ({ sid, id }: any) => {
      if (sid === activeChatRef.current) {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }
      loadSessions(); // Update last message in sidebar
    };

    const handleRateLimit = () => {
      setIsRateLimited(true);
      setTimeout(() => setIsRateLimited(false), 1000);
    };
    client.on("message", onMsg);
    client.on("download_progress", onDownloadProgress);
    client.on("file_downloaded", onFileDownloaded);
    client.on("message_status", onMessageStatus);
    client.on("message_updated", onMessageUpdated);
    client.on("rate_limit_exceeded", handleRateLimit);

    return () => {
      client.off("message", onMsg);
      client.off("download_progress", onDownloadProgress);
      client.off("file_downloaded", onFileDownloaded);
      client.off("message_status", onMessageStatus);
      client.off("message_updated", onMessageUpdated);
      client.off("message_deleted", onMessageDeleted);
      client.off("rate_limit_exceeded", handleRateLimit);
    };
  }, [loadSessions, activeChatRef]);

  const handleSend = async (text: string) => {
    if (!text.trim() || !activeChat) return;
    const currentInput = text;
    const currentReplyTo = replyingTo;

    setReplyingTo(null);

    const replyContext =
      currentReplyTo && currentReplyTo.id
        ? {
            id: currentReplyTo.id,
            text: currentReplyTo.text,
            sender:
              currentReplyTo.sender === "me"
                ? "Me"
                : currentReplyTo.sender || "Other",
            type: currentReplyTo.type,
            mediaFilename: currentReplyTo.mediaFilename,
            thumbnail: currentReplyTo.thumbnail,
          }
        : undefined;

    const msgType = "text";

    const tempId = crypto.randomUUID();
    const optimisticMsg: ChatMessage = {
      id: tempId,
      sid: activeChat,
      text: currentInput,
      sender: "me",
      timestamp: Date.now(),
      type: msgType,
      status: 0, // optimistic / queued
      replyTo: replyContext,
    };

    // Render immediately for zero perceived latency
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      await ChatClient.sendMessage(
        activeChat,
        currentInput,
        replyContext,
        msgType,
        tempId // Pass tempId so we can replace it later if the backend supports passing IDs
      );
    } catch (e: any) {
      console.error("[useMessageLogic] sendMessage failed:", e);
      ChatClient.emit("notification", {
        type: "error",
        message:
          e?.message === "Session not found"
            ? "Session is unavailable. Please reopen chat or reconnect."
            : "Failed to send message.",
      });
      // Optionally remove or mark as failed
      setMessages((prev) => prev.map(m => m.id === tempId ? { ...m, status: 3 } : m));
      return;
    }

    // Load sessions to update sidebar preview
    loadSessions();
  };

  const handleFile = async (file: File) => {
    if (!activeChat) return;

    let fileToSend = file;
    if (file.type.startsWith("image/") && file.type !== "image/gif") {
      try {
        const { compressImage } = await import("../../../utils/imageUtils");
        console.log(
          `[useMessageLogic] Compressing image: ${file.name} (${file.size} bytes)`,
        );
        fileToSend = await compressImage(file);
      } catch (e) {
        console.error("Image compression failed, sending original", e);
      }
    } else if (
      file.size > 1024 * 1024 &&
      !file.type.startsWith("video/") &&
      !file.type.startsWith("audio/")
    ) {
      try {
        const { CompressionService } = await import(
          "../../../services/media/CompressionService"
        );
        console.log(
          `[useMessageLogic] Gzipping file: ${file.name} (${file.size} bytes)`,
        );
        const compressedBlob = await CompressionService.compressBlob(file);

        if (compressedBlob.size < file.size) {
          fileToSend = new File([compressedBlob], file.name, {
            type: file.type,
            lastModified: file.lastModified,
          });
          (fileToSend as any).compressed = true;
        }
      } catch (e) {
        console.error("File compression failed", e);
      }
    }

    const tempId = crypto.randomUUID();
    const tempMsg: ChatMessage = {
      id: tempId,
      sid: activeChat,
      sender: "me",
      text: fileToSend.name,
      type: fileToSend.type.startsWith("image")
        ? "image"
        : fileToSend.type.startsWith("video")
        ? "video"
        : "file",
      timestamp: Date.now(),
      mediaTotalSize: fileToSend.size,
      tempUrl: URL.createObjectURL(fileToSend),
      mediaStatus: "uploading",
      status: 1,
    };

    setMessages((prev) => [...prev, tempMsg]);

    ChatClient.sendFile(activeChat, fileToSend, {
      name: fileToSend.name,
      size: fileToSend.size,
      type: fileToSend.type,
      compressed: (fileToSend as any).compressed,
    } as any).catch((err) => {
      console.error("Failed to send file", err);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 3 } : m)),
      );
    });
    loadSessions();
  };

  return {
    state: {
      messages,
      replyingTo,
      isRateLimited,
    },
    actions: {
      setMessages,
      setReplyingTo,
      handleSend,
      handleFile,
      loadMoreHistory,
    },
  };
};
