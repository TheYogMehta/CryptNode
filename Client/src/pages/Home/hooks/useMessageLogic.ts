import { useState, useEffect, useRef, type RefObject } from "react";
import ChatClient from "../../../services/core/ChatClient";
import { queryDB, executeDB } from "../../../services/storage/sqliteService";
import { getMessageTypeForUpload } from "../../../utils/mediaType";
import { ChatMessage } from "../types";

interface UseMessageLogicProps {
  activeChat: string | null;
  activeChatRef: RefObject<string | null>;
  loadSessions: () => void;
}

const getMessageMediaScore = (message: ChatMessage) => {
  let score = 0;
  if (message.mediaStatus === "downloaded") score += 1_000_000;
  else if (message.mediaStatus === "downloading") score += 100_000;
  else if (message.mediaStatus === "pending") score += 10_000;

  score += Number(message.mediaCurrentSize || 0);
  score += Math.round(Number(message.mediaProgress || 0) * 100);
  if (message.thumbnail) score += 10;
  if (message.mediaFilename) score += 1;
  return score;
};

const mergeDuplicateMessage = (
  current: ChatMessage,
  incoming: ChatMessage,
): ChatMessage => {
  const preferred =
    getMessageMediaScore(incoming) >= getMessageMediaScore(current)
      ? incoming
      : current;

  return {
    ...current,
    ...incoming,
    text: incoming.text ?? current.text,
    type: incoming.type || current.type,
    replyTo: incoming.replyTo ?? current.replyTo,
    thumbnail: preferred.thumbnail || current.thumbnail || incoming.thumbnail,
    mediaStatus:
      preferred.mediaStatus || current.mediaStatus || incoming.mediaStatus,
    mediaFilename:
      preferred.mediaFilename ||
      current.mediaFilename ||
      incoming.mediaFilename,
    mediaOriginalName:
      preferred.mediaOriginalName ||
      current.mediaOriginalName ||
      incoming.mediaOriginalName,
    mediaTotalSize:
      Math.max(
        Number(current.mediaTotalSize || 0),
        Number(incoming.mediaTotalSize || 0),
      ) ||
      current.mediaTotalSize ||
      incoming.mediaTotalSize,
    mediaCurrentSize:
      Math.max(
        Number(current.mediaCurrentSize || 0),
        Number(incoming.mediaCurrentSize || 0),
      ) ||
      current.mediaCurrentSize ||
      incoming.mediaCurrentSize,
    mediaProgress:
      Math.max(
        Number(current.mediaProgress || 0),
        Number(incoming.mediaProgress || 0),
      ) ||
      current.mediaProgress ||
      incoming.mediaProgress,
    mediaMime: preferred.mediaMime || current.mediaMime || incoming.mediaMime,
  };
};

const dedupeMessages = (items: ChatMessage[]): ChatMessage[] => {
  const deduped: ChatMessage[] = [];
  const indexById = new Map<string, number>();

  for (const item of items) {
    const key = item.id;
    if (!key) {
      deduped.push(item);
      continue;
    }

    const existingIndex = indexById.get(key);
    if (existingIndex === undefined) {
      indexById.set(key, deduped.length);
      deduped.push(item);
      continue;
    }

    deduped[existingIndex] = mergeDuplicateMessage(
      deduped[existingIndex],
      item,
    );
  }

  return deduped;
};

export const useMessageLogic = ({
  activeChat,
  activeChatRef,
  loadSessions,
}: UseMessageLogicProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [firstItemIndex, setFirstItemIndex] = useState(0);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (activeChat) {
      setMessages([]);
      setFirstItemIndex(0);
      setReplyingTo(null);
      loadHistory(activeChat);
    } else {
      setMessages([]);
      setFirstItemIndex(0);
      setReplyingTo(null);
    }
  }, [activeChat]);

  const loadHistory = async (
    sid: string,
    beforeTimestamp?: number,
    maintainCount?: number,
  ) => {
    setIsLoadingHistory(true);
    let query = `SELECT m.*, 
              md.status as mediaStatus, 
              md.filename as mediaFilename, 
              md.original_name as mediaOriginalName,
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
    const formatted = dedupeMessages(
      rows.map((r: any) => ({
        ...r,
        replyTo: r.reply_to ? JSON.parse(r.reply_to) : undefined,
      })),
    );

    if (!beforeTimestamp && !maintainCount) {
      // First load: Query total messages for this session
      try {
        const countRows = await queryDB(
          "SELECT COUNT(*) as count FROM messages WHERE sid = ?",
          [sid],
        );
        const totalRows = countRows[0]?.count || 0;
        setFirstItemIndex(Math.max(0, totalRows - formatted.length));
      } catch (e) {
        setFirstItemIndex(0);
        console.error("Failed to get total count", e);
      }
      setMessages(formatted.reverse());
    } else if (maintainCount) {
      setMessages((prev) => {
        return formatted.reverse();
      });
    } else {
      setFirstItemIndex((prev) => Math.max(0, prev - formatted.length));
      setMessages((prev) => {
        if (formatted.length === 0) return prev;
        return dedupeMessages([...formatted.reverse(), ...prev]);
      });
    }
    setIsLoadingHistory(false);
  };

  const loadMoreHistory = () => {
    if (activeChatRef.current && messagesRef.current.length > 0) {
      const earliest = messagesRef.current[0].timestamp;
      loadHistory(activeChatRef.current, earliest);
    }
  };

  useEffect(() => {
    const client = ChatClient;

    let messageBuffer: ChatMessage[] = [];
    let flushTimeout: NodeJS.Timeout | null = null;

    const flushMessages = () => {
      if (messageBuffer.length === 0) return;
      const toAdd = [...messageBuffer];
      messageBuffer = [];
      setMessages((prev) => dedupeMessages([...prev, ...toAdd]));

      if (activeChatRef.current) {
        const ids = toAdd.map((m) => m.id);
        const chunkSize = 500;
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize);
          const placeholders = chunk.map(() => "?").join(",");
          executeDB(
            `UPDATE messages SET is_read = 1 WHERE id IN (${placeholders})`,
            chunk,
          ).catch((e) => console.error("Batch update read status failed", e));
        }
      }
    };

    const onMsg = async (msg: ChatMessage) => {
      if (msg.sid === activeChatRef.current) {
        messageBuffer.push(msg);
        if (!flushTimeout) {
          flushTimeout = setTimeout(() => {
            flushTimeout = null;
            flushMessages();
          }, 100);
        }
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

    const onFileDownloaded = ({ messageId, filename }: any) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                mediaStatus: "downloaded",
                mediaProgress: 1,
                mediaFilename: filename || m.mediaFilename,
              }
            : m,
        ),
      );
    };

    const onMessageStatus = ({ sid }: { sid: string }) => {
      if (sid === activeChatRef.current) {
        loadHistory(sid, undefined, Math.max(30, messagesRef.current.length));
      }
    };

    const onMessageMetadataUpdated = (data: any) => {
      const {
        sid,
        messageId,
        mediaOriginalName,
        mediaTotalSize,
        mediaMime,
        thumbnail,
      } = data;
      if (sid === activeChatRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  mediaOriginalName: mediaOriginalName || m.mediaOriginalName,
                  mediaTotalSize: mediaTotalSize || m.mediaTotalSize,
                  mediaMime: mediaMime || m.mediaMime,
                  thumbnail: thumbnail || m.thumbnail,
                }
              : m,
          ),
        );
      }
    };

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

    const onMessagesSynced = ({ sid }: { sid: string }) => {
      if (sid === activeChatRef.current) {
        loadHistory(sid, undefined, Math.max(30, messagesRef.current.length));
      }
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
    client.on("message_deleted", onMessageDeleted);
    client.on("message_metadata_updated", onMessageMetadataUpdated);
    client.on("messages_synced", onMessagesSynced);
    client.on("rate_limit_exceeded", handleRateLimit);

    return () => {
      if (flushTimeout) clearTimeout(flushTimeout);
      client.off("message", onMsg);
      client.off("download_progress", onDownloadProgress);
      client.off("file_downloaded", onFileDownloaded);
      client.off("message_status", onMessageStatus);
      client.off("message_updated", onMessageUpdated);
      client.off("message_deleted", onMessageDeleted);
      client.off("message_metadata_updated", onMessageMetadataUpdated);
      client.off("messages_synced", onMessagesSynced);
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
      status: 1, // optimistic / sent
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
        tempId, // Pass tempId so we can replace it later if the backend supports passing IDs
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
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 3 } : m)),
      );
      return;
    }

    // Load sessions to update sidebar preview
    loadSessions();
  };

  const handleFile = async (file: File, caption?: string) => {
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
      text: caption || fileToSend.name,
      type: getMessageTypeForUpload(fileToSend),
      timestamp: Date.now(),
      mediaTotalSize: fileToSend.size,
      tempUrl: URL.createObjectURL(fileToSend),
      mediaStatus: "uploading",
      status: 1,
    };

    setMessages((prev) => [...prev, tempMsg]);

    ChatClient.sendFile(
      activeChat,
      fileToSend,
      {
        name: fileToSend.name,
        size: fileToSend.size,
        type: fileToSend.type,
        caption: caption || "",
        compressed: (fileToSend as any).compressed,
      } as any,
      tempId,
    ).catch((err) => {
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
      firstItemIndex,
      replyingTo,
      isRateLimited,
      isLoadingHistory,
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
