import React, { useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { Capacitor } from "@capacitor/core";
import { StorageService } from "../../../../services/storage/StorageService";
import ChatClient from "../../../../services/core/ChatClient";
import { MessageBubble } from "./MessageBubble";
import { PortShareModal } from "./PortShareModal";
import { MediaModal } from "./MediaModal";
import { FileUploadPreview } from "../overlays/FileUploadPreview";
import { GifPicker } from "../../../../components/GifPicker";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import {
  Send,
  Mic,
  Monitor,
  Plus,
  Image as ImageIcon,
  Camera as CameraIcon,
  FileText,
  Globe,
  Phone,
  ArrowLeft,
  X,
  Video,
  Smile,
  Search,
  Edit2,
  Trash2,
  Lightbulb,
  Wand2,
  MoreVertical,
} from "lucide-react";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { ChatMessage, SessionData } from "../../types";
import { Avatar } from "../../../../components/ui/Avatar";
import { useTheme } from "../../../../theme/ThemeContext";
import {
  ChatContainer,
  ChatHeader,
  BackButton,
  HeaderInfo,
  HeaderName,
  HeaderStatus,
  HeaderActions,
  MessageList,
  MessageListInner,
  InputContainer,
  InputWrapper,
  ChatInput,
  SendButton,
  AttachmentButton,
  AttachmentMenu,
  MenuItem,
  MenuIcon,
  MenuLabel,
  ReplyPreview,
  ReplyContent,
  ReplySender,
  ReplyText,
} from "./Chat.styles";
import { IconButton } from "../../../../components/ui/IconButton";
import { localAIService } from "../../../../services/ai/localAI.service";
import { useAIStatus } from "../../hooks/useAIStatus";
import { avatarCacheService } from "../../../../services/storage/AvatarCacheService";
import { UserProfileModal } from "../overlays/UserProfileModal";
import { setSessionAlias, updateSessionNotes } from "../../../../services/storage/sqliteService";

interface ChatWindowProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  activeChat: string | null;
  session?: SessionData;
  onFileSelect: (file: File, caption?: string) => void;
  onStartCall: (mode: "Audio" | "Video" | "Screen") => void;
  peerOnline?: boolean;
  onBack?: () => void;
  replyingTo?: ChatMessage | null;
  setReplyingTo?: (msg: ChatMessage | null) => void;
  onLoadMore?: () => void;
  isRateLimited?: boolean;
  isLoadingHistory?: boolean;
  firstItemIndex?: number;
}

interface PendingAttachment {
  id: string;
  file: File;
  name: string;
  description: string;
  previewUrl: string | null;
  mediaType: "image" | "video" | "file";
}

export const ChatWindowDefault = ({
  messages,
  onSend,
  activeChat,
  session,
  onFileSelect,
  onStartCall,
  peerOnline,
  onBack,
  replyingTo,
  setReplyingTo,
  onLoadMore,
  isRateLimited,
  isLoadingHistory,
  firstItemIndex = 0,
}: ChatWindowProps) => {
  const { messageLayout } = useTheme();
  const isAndroidPlatform = Capacitor.getPlatform() === "android";
  const canScreenShare = ChatClient.canScreenShare;
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isLoaded: isAiLoaded, isInstalled: isAiInstalled } = useAIStatus();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [input, setInput] = useState("");
  const [isAtBottom, setIsAtBottom] = useState(true);

  const [showMenu, setShowMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPortModal, setShowPortModal] = useState(false);
  const [port, setPort] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAiSuggestions, setShowAiSuggestions] = useState(true);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [selectedMedia, setSelectedMedia] = useState<{
    url: string;
    type: "image" | "video";
    description?: string;
    meta?: any;
  } | null>(null);

  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);

  const headerName =
    session?.alias_name ||
    session?.peer_name ||
    (session?.peerEmail ? session.peerEmail.split("@")[0] : undefined) ||
    (session?.isOwnDevice ? `Saved Messages (${activeChat?.slice(0, 4) || ""})` : undefined) ||
    (activeChat ? `Peer ${activeChat.slice(0, 6)}` : "Chat");
  const avatarToUse = session?.alias_avatar || session?.peer_avatar;
  const [resolvedAvatar, setResolvedAvatar] = useState<string | undefined>(
    undefined,
  );

  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isInitializingModel, setIsInitializingModel] = useState(false);
  const [summaryElapsedMs, setSummaryElapsedMs] = useState<number | null>(null);

  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        optionsMenuRef.current &&
        !optionsMenuRef.current.contains(event.target as Node)
      ) {
        setShowOptionsMenu(false);
      }
    };
    if (showOptionsMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showOptionsMenu]);



  const handleSummarize = async () => {
    if (isSummarizing || isInitializingModel || messages.length === 0) return;
    setSummaryElapsedMs(null);
    setShowSummary(true);
    const startTime = Date.now();
    try {
      if (!localAIService.isLoaded) {
        setIsInitializingModel(true);
        await localAIService.init();
        setIsInitializingModel(false);
      }
      setIsSummarizing(true);
      const result = await localAIService.summarize(messages, 5);
      setSummary(result);
      setSummaryElapsedMs(Date.now() - startTime);
    } catch (e) {
      console.error("Summarization failed", e);
      setSummary("Failed to generate summary.");
    } finally {
      setIsInitializingModel(false);
      setIsSummarizing(false);
    }
  };

  useEffect(() => {
    let active = true;

    const fetch = () => {
      avatarCacheService.getAvatar(avatarToUse).then((src) => {
        if (active) setResolvedAvatar(src || undefined);
      });
    };

    fetch();

    const unsub = avatarCacheService.onBust((cleanUrl) => {
      const myClean = (avatarToUse || "").replace(/\.jpg$/, "");
      if (myClean && cleanUrl === myClean) fetch();
    });

    return () => {
      active = false;
      unsub();
    };
  }, [avatarToUse]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  const prevLengthRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevLengthRef.current && virtuosoRef.current) {
      const lastMessage = messages[messages.length - 1];
      // Force scroll ONLY if I sent the message OR if I was already at the bottom
      if (lastMessage.sender === "me" || isAtBottom) {
        const index = messages.length - 1;
        const scrollToBottom = () => {
          virtuosoRef.current?.scrollToIndex({
            index,
            align: "end",
            behavior: "smooth",
          });
        };
        scrollToBottom();
        // One follow-up for layout shifts
        setTimeout(scrollToBottom, 100);
      }
    }
    prevLengthRef.current = messages.length;
  }, [messages.length, isAtBottom]);

  useEffect(() => {
    return () => {
      for (const item of pendingAttachmentsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const createPendingAttachment = (file: File): PendingAttachment => {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    return {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      description: "",
      previewUrl: isImage || isVideo ? URL.createObjectURL(file) : null,
      mediaType: isImage ? "image" : isVideo ? "video" : "file",
    };
  };

  const addFilesToPending = (files: File[]) => {
    if (!files.length) return;
    setPendingAttachments((prev) => [
      ...prev,
      ...files.map(createPendingAttachment),
    ]);
    setShowMenu(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && activeChat) {
      const filesArr = Array.from(e.target.files);
      const mediaFiles = filesArr.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
      const docFiles = filesArr.filter((f) => !f.type.startsWith("image/") && !f.type.startsWith("video/"));

      if (mediaFiles.length > 0) {
        setSelectedFiles((prev) => [...prev, ...mediaFiles]);
      }
      if (docFiles.length > 0) {
        addFilesToPending(docFiles);
      }
    }
    e.target.value = "";
  };

  const handlePreviewSend = (
    processedFiles: { file: File; caption: string }[],
  ) => {
    // Process files one by one (or add to pending if we want to support that flow, but user wants send)
    // For now, let's treat them as "sent" immediately like the old flow, but with captions.

    // We can re-use addFilesToPending if we want them to queue up,
    // OR just send immediately.
    // The previous flow was: onFileSelect -> send immediately.
    // Let's stick to that but handle caption.

    processedFiles.forEach(({ file, caption }) => {
      onFileSelect(file, caption.trim() || undefined);
    });
    setSelectedFiles([]);
  };

  const handleCamera = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        correctOrientation: true,
      });

      if (image.webPath) {
        // Fetch to blob to make it a File object for consistent handling
        const response = await fetch(image.webPath);
        const blob = await response.blob();
        const file = new File([blob], `photo_${Date.now()}.jpeg`, {
          type: "image/jpeg",
        });
        setSelectedFiles((prev) => [...prev, file]);
        setShowMenu(false);
      }
    } catch (e) {
      console.error("Camera error:", e);
    }
  };

  const attachments = [
    {
      label: "Document",
      icon: <FileText size={24} />,
      color: "#7f5af0",
      onClick: () => fileInputRef.current?.click(),
    },
    {
      label: "Camera",
      icon: <CameraIcon size={24} />,
      color: "#ff8906",
      onClick: handleCamera,
    },
    {
      label: "Gallery",
      icon: <ImageIcon size={24} />,
      color: "#e53170",
      onClick: () => fileInputRef.current?.click(),
    },

  ];

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [pendingAudio, setPendingAudio] = useState<{
    url: string;
    blob: Blob;
  } | null>(null);

  const handleRecord = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          console.log(`[ChatWindow] Audio chunk: ${event.data.size} bytes`);
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });
          console.log(
            `[ChatWindow] Recording stopped. Total size: ${audioBlob.size} bytes`,
          );

          const url = URL.createObjectURL(audioBlob);
          setPendingAudio({ url, blob: audioBlob });

          stream.getTracks().forEach((track) => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Could not access microphone.");
      }
    } else {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    }
  };

  const handleMediaClick = (
    url: string,
    type: "image" | "video",
    description?: string,
    meta?: any
  ) => {
    setSelectedMedia({ url, type, description, meta });
    setMediaModalOpen(true);
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setInput((prev) => prev + emojiData.emoji);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData && e.clipboardData.items) {
      const items = e.clipboardData.items;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
          const file = items[i].getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        const mediaFiles = files.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
        const docFiles = files.filter((f) => !f.type.startsWith("image/") && !f.type.startsWith("video/"));

        if (mediaFiles.length > 0) {
          setSelectedFiles((prev) => [...prev, ...mediaFiles]);
        }
        if (docFiles.length > 0) {
          addFilesToPending(docFiles);
        }
      }
    }
  };

  const handleRenamePendingAttachment = (id: string) => {
    const item = pendingAttachments.find((a) => a.id === id);
    if (!item) return;
    const renamed = window.prompt("Rename file", item.name);
    if (!renamed) return;
    const safeName = renamed.trim();
    if (!safeName) return;
    setPendingAttachments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, name: safeName } : a)),
    );
  };

  const handleRemovePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const handlePendingAttachmentDescription = (
    id: string,
    description: string,
  ) => {
    setPendingAttachments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, description } : a)),
    );
  };

  const handleSendMessage = async () => {
    if (!input.trim() && pendingAttachments.length === 0) return;

    if (input.trim()) {
      onSend(input);
    }

    for (const item of pendingAttachments) {
      let fileToSend = item.file;
      if (item.name !== item.file.name) {
        fileToSend = new File([item.file], item.name, {
          type: item.file.type,
          lastModified: item.file.lastModified,
        });
      }
      await Promise.resolve(onFileSelect(fileToSend, item.description.trim() || undefined));
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }

    setPendingAttachments([]);
    setInput("");
    setShowEmojiPicker(false);
    setShowGifPicker(false);
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredMessages = useMemo(() => {
    if (!normalizedSearch) return messages;

    return messages.filter((msg) => {
      const fields = [
        msg.text || "",
        msg.media?.name || "",
        msg.mediaFilename || "",
        msg.replyTo?.text || "",
        msg.type || "",
      ];
      return fields.some((v) => v.toLowerCase().includes(normalizedSearch));
    });
  }, [messages, normalizedSearch]);


  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [isGeneratingReplies, setIsGeneratingReplies] = useState(false);

  const generateQuickReplies = async () => {
    if (isGeneratingReplies) return;

    setIsGeneratingReplies(true);
    try {
      if (!localAIService.isLoaded) await localAIService.init();
      const items = await localAIService.quickReplies(input, 3);
      setQuickReplies(items);
    } catch (e) {
      console.error("Failed to generate replies", e);
    } finally {
      setIsGeneratingReplies(false);
    }
  };

  useEffect(() => {
    if (quickReplies.length > 0 && input.trim().length === 0) {
    }
  }, [input]);

  return (
    <ChatContainer>
      <ChatHeader>
        {onBack && (
          <BackButton onClick={onBack}>
            <ArrowLeft size={24} />
          </BackButton>
        )}

        <div
          onClick={() => setShowProfileModal(true)}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowProfileModal(true);
          }}
          style={{ cursor: "pointer", display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}
        >
          <Avatar
            src={resolvedAvatar}
            name={headerName}
            size="md"
            status={session?.isOwnDevice ? undefined : (peerOnline ? "online" : "offline")}
          />
          <HeaderInfo>
            <HeaderName>{headerName}</HeaderName>
            {session?.alias_name && session.alias_name !== (session.peer_name || (session.peerEmail ? session.peerEmail.split("@")[0] : "")) && (
              <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', marginTop: '-2px', marginBottom: '2px' }}>
                {session.peer_name || (session.peerEmail ? session.peerEmail.split("@")[0] : "User")}
              </div>
            )}
            {!session?.isOwnDevice && (
              <HeaderStatus isOnline={peerOnline}>
                {peerOnline ? "Online" : "Offline"}
              </HeaderStatus>
            )}
          </HeaderInfo>
        </div>

        <HeaderActions>
          <IconButton
            variant="ghost"
            size="md"
            onClick={() => onStartCall("Audio")}
            title="Start Call"
          >
            <Phone size={20} />
          </IconButton>
          <IconButton
            variant={showSearch ? "primary" : "ghost"}
            size="md"
            onClick={() => {
              setShowSearch((prev) => {
                const next = !prev;
                if (!next) setSearchQuery("");
                return next;
              });
            }}
            title="Search"
          >
            <Search size={20} />
          </IconButton>
          {isAiInstalled && !isAndroidPlatform && (
            <div style={{ position: "relative" }} ref={optionsMenuRef}>
              <IconButton
                variant="ghost"
                size="md"
                onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                title="More Options"
              >
                <MoreVertical size={20} />
              </IconButton>

              {showOptionsMenu && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: "8px",
                    backgroundColor: "rgba(20, 20, 30, 0.95)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "8px",
                    padding: "8px",
                    zIndex: 200,
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    minWidth: "180px",
                    backdropFilter: "blur(10px)",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                  }}
                >
                  <button
                    onClick={() => {
                      handleSummarize();
                      setShowOptionsMenu(false);
                    }}
                    disabled={isSummarizing || localAIService.isLoading}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 12px",
                      background: "transparent",
                      border: "none",
                      color:
                        isSummarizing || localAIService.isLoading
                          ? "rgba(255,255,255,0.5)"
                          : "#ccc",
                      cursor:
                        isSummarizing || localAIService.isLoading
                          ? "not-allowed"
                          : "pointer",
                      borderRadius: "4px",
                      textAlign: "left",
                      fontSize: "14px",
                      transition: "background 0.2s",
                    }}
                    onMouseOver={(e) => {
                      if (!isSummarizing && !localAIService.isLoading)
                        e.currentTarget.style.background =
                          "rgba(255,255,255,0.1)";
                    }}
                    onMouseOut={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <FileText
                      size={18}
                      color={
                        isSummarizing || localAIService.isLoading
                          ? "#eda515"
                          : undefined
                      }
                    />{" "}
                    {isSummarizing || localAIService.isLoading
                      ? "Loading AI..."
                      : "Summarize Chat"}
                  </button>
                </div>
              )}
            </div>
          )}
        </HeaderActions>
      </ChatHeader>

      {showSummary && (
        <div
          style={{
            position: "absolute",
            top: "70px",
            right: "20px",
            width: "300px",
            backgroundColor: "rgba(20, 20, 30, 0.95)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "12px",
            padding: "16px",
            zIndex: 100,
            backdropFilter: "blur(10px)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: 600,
                color: "#fff",
              }}
            >
              {" "}
              ✨ Chat Summary
            </h3>
            <IconButton
              variant="ghost"
              size="sm"
              onClick={() => setShowSummary(false)}
            >
              <X size={16} />
            </IconButton>
          </div>
          {isInitializingModel ? (
            <div
              style={{
                color: "rgba(255,255,255,0.7)",
                fontSize: "13px",
                textAlign: "center",
                padding: "20px",
              }}
            >
              ⚙️ Initialising model...
            </div>
          ) : isSummarizing ? (
            <div
              style={{
                color: "rgba(255,255,255,0.7)",
                fontSize: "13px",
                textAlign: "center",
                padding: "20px",
              }}
            >
              ✨ Generating...
            </div>
          ) : (
            <div
              style={{
                color: "rgba(255,255,255,0.9)",
                fontSize: "13px",
                whiteSpace: "pre-wrap",
                lineHeight: "1.5",
                maxHeight: "400px",
                overflowY: "auto",
              }}
            >
              {summary}
              {summaryElapsedMs !== null && (
                <div
                  style={{
                    marginTop: "10px",
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.35)",
                    textAlign: "right",
                  }}
                >
                  Generated in {(summaryElapsedMs / 1000).toFixed(1)}s
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {showSearch && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(0,0,0,0.2)",
          }}
        >
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages, files, links..."
            style={{
              width: "100%",
              height: "38px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "#e5e7eb",
              padding: "0 12px",
              outline: "none",
            }}
          />
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        multiple
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      <MessageList>
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: "100%" }}
          data={filteredMessages}
          firstItemIndex={firstItemIndex}
          initialTopMostItemIndex={filteredMessages.length > 0 ? filteredMessages.length - 1 : 0}
          followOutput={(isAtBottom) => isAtBottom ? "smooth" : false}
          alignToBottom
          atBottomStateChange={(bottom) => setIsAtBottom(bottom)}
          atTopStateChange={(atTop: boolean) => {
            if (atTop && onLoadMore && !isLoadingHistory) onLoadMore();
          }}
          startReached={() => {
            if (onLoadMore && !isLoadingHistory) onLoadMore();
          }}
          components={{
            Header: () => isLoadingHistory ? (
              <div style={{ textAlign: 'center', padding: '12px 0', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
                 Loading older messages...
              </div>
            ) : null,
            List: MessageListInner,
          }}
          itemContent={(index: number, msg: ChatMessage) => (
            <div style={{ marginBottom: 4 }}>
              <MessageBubble
                key={msg.id || index}
                msg={msg}
                onReply={setReplyingTo}
                onMediaClick={handleMediaClick}
                messageLayout={messageLayout}
                senderName={
                  msg.sender === "me"
                    ? "You"
                    : session?.alias_name ||
                    session?.peer_name ||
                    (session?.peerEmail
                      ? session.peerEmail.split("@")[0]
                      : undefined) ||
                    "User"
                }
                senderAvatar={msg.sender === "me" ? undefined : resolvedAvatar}
              />
            </div>
          )}
        />
        {filteredMessages.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "rgba(255,255,255,0.6)",
              padding: "24px 12px",
              fontSize: "0.9rem",
            }}
          >
            {normalizedSearch ? "No messages match your search." : "No messages yet."}
          </div>
        )}
      </MessageList>

      {replyingTo && (
        <ReplyPreview>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flex: 1,
              minWidth: 0,
            }}
          >
            {replyingTo.thumbnail && (
              <img
                src={
                  replyingTo.thumbnail.startsWith("data:")
                    ? replyingTo.thumbnail
                    : `data:image/jpeg;base64,${replyingTo.thumbnail}`
                }
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "4px",
                  objectFit: "cover",
                }}
              />
            )}
            <ReplyContent>
              <ReplySender>
                Replying to {replyingTo.sender === "me" ? "Me" : "Other"}
              </ReplySender>
              <ReplyText>
                {replyingTo.type === "text"
                  ? replyingTo.text
                  : `[${replyingTo.type}] ${replyingTo.text || ""}`}
              </ReplyText>
            </ReplyContent>
          </div>
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => setReplyingTo?.(null)}
          >
            <X size={16} />
          </IconButton>
        </ReplyPreview>
      )}

      {showMenu && (
        <AttachmentMenu>
          {attachments.map((item, i) => (
            <MenuItem key={i} onClick={item.onClick}>
              <MenuIcon color={item.color}>{item.icon}</MenuIcon>
              <MenuLabel>{item.label}</MenuLabel>
            </MenuItem>
          ))}
        </AttachmentMenu>
      )}

      {pendingAttachments.length > 0 && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            padding: "10px 12px 6px",
            display: "flex",
            gap: "10px",
            overflowX: "auto",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          {pendingAttachments.map((item) => (
            <div
              key={item.id}
              style={{
                minWidth: "220px",
                maxWidth: "220px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)",
                padding: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "6px",
                  marginBottom: "8px",
                }}
              >
                <button
                  onClick={() => handleRenamePendingAttachment(item.id)}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "#d1d5db",
                    border: "none",
                    borderRadius: "6px",
                    width: "26px",
                    height: "26px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                  title="Rename"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleRemovePendingAttachment(item.id)}
                  style={{
                    background: "rgba(239,68,68,0.18)",
                    color: "#fca5a5",
                    border: "none",
                    borderRadius: "6px",
                    width: "26px",
                    height: "26px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div
                style={{
                  height: "130px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  background: "rgba(0,0,0,0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "8px",
                }}
              >
                {item.mediaType === "image" && item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : item.mediaType === "video" && item.previewUrl ? (
                  <video
                    src={item.previewUrl}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                    muted
                  />
                ) : (
                  <FileText size={28} color="#94a3b8" />
                )}
              </div>

              <div
                style={{
                  color: "#e5e7eb",
                  fontSize: "12px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginBottom: "6px",
                }}
                title={item.name}
              >
                {item.name}
              </div>

              <input
                value={item.description}
                onChange={(e) =>
                  handlePendingAttachmentDescription(item.id, e.target.value)
                }
                placeholder="Add description..."
                style={{
                  width: "100%",
                  height: "30px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#e5e7eb",
                  padding: "0 8px",
                  fontSize: "12px",
                  outline: "none",
                }}
              />
            </div>
          ))}
        </div>
      )}

      {pendingAudio && (
        <div
          style={{
            padding: "10px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "rgba(20, 20, 25, 0.95)",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            zIndex: 10,
          }}
        >
          <audio
            src={pendingAudio.url}
            controls
            style={{ flex: 1, height: "40px" }}
          />
          <IconButton
            variant="ghost"
            onClick={() => {
              const file = new File(
                [pendingAudio.blob],
                `voice-note-${Date.now()}.webm`,
                { type: "audio/webm" },
              );
              onFileSelect(file);
              setPendingAudio(null);
            }}
            title="Send voice note"
          >
            <Send size={20} />
          </IconButton>
          <IconButton
            variant="ghost"
            onClick={() => setPendingAudio(null)}
            title="Delete voice note"
            style={{ color: "#ef4444" }}
          >
            <Trash2 size={20} />
          </IconButton>
        </div>
      )}

      {session?.isConnected === false ? (
        <InputContainer
          style={{
            justifyContent: "center",
            padding: "16px",
            color: "rgba(255,255,255,0.5)",
            fontSize: "14px",
            fontStyle: "italic",
          }}
        >
          You cannot send messages to this user because you are not connected.
        </InputContainer>
      ) : (
        <InputContainer>
          {!showAiSuggestions && !input.trim() && !isAndroidPlatform && (
            <div style={{ padding: "0 8px 8px 8px" }}>
              <button
                type="button"
                onClick={async () => {
                  setShowAiSuggestions(true);
                  if (!localAIService.isLoaded) await localAIService.init();
                }}
                disabled={localAIService.isLoading}
                style={{
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 14,
                  color: localAIService.isLoading
                    ? "rgba(255,255,255,0.5)"
                    : "#fff",
                  background: "rgba(255,255,255,0.06)",
                  padding: "5px 10px",
                  fontSize: 12,
                  cursor: localAIService.isLoading
                    ? "not-allowed"
                    : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Lightbulb size={16} />
                {localAIService.isLoading ? "Loading AI..." : "Catch Up"}
              </button>
            </div>
          )}
          {isAiInstalled &&
            !isAndroidPlatform &&
            showAiSuggestions &&
            quickReplies.length > 0 &&
            !isRecording && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  padding: "0 8px 8px 8px",
                }}
              >
                {quickReplies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => setInput(reply)}
                    style={{
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 14,
                      color: "#fff",
                      background: "rgba(255,255,255,0.06)",
                      padding: "5px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {reply}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setShowAiSuggestions(false);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "rgba(255,255,255,0.65)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Hide
                </button>
                <button
                  onClick={handleSummarize}
                  disabled={isSummarizing || localAIService.isLoading}
                  title="Summarize Chat"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor:
                      isSummarizing || localAIService.isLoading
                        ? "not-allowed"
                        : "pointer",
                    color:
                      isSummarizing || localAIService.isLoading
                        ? "rgba(255,255,255,0.5)"
                        : "#ccc",
                    marginRight: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <FileText
                    size={18}
                    color={
                      isSummarizing || localAIService.isLoading
                        ? "#eda515"
                        : undefined
                    }
                  />
                  <span style={{ fontSize: 12 }}>
                    {isSummarizing || localAIService.isLoading
                      ? "Loading..."
                      : "Summarize Chat"}
                  </span>
                </button>
              </div>
            )}

          <AttachmentButton
            active={showMenu}
            onClick={() => setShowMenu(!showMenu)}
          >
            <Plus size={24} />
          </AttachmentButton>

          <InputWrapper isRateLimited={isRateLimited}>
            <ChatInput
              ref={textareaRef}
              rows={1}
              value={isRecording ? "Recording..." : input}
              readOnly={isRecording}
              onPaste={handlePaste}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Allow Undo/Redo to work by stopping propagation if needed
                if (
                  (e.ctrlKey || e.metaKey) &&
                  (e.key === "z" ||
                    e.key === "Z" ||
                    e.key === "y" ||
                    e.key === "Y")
                ) {
                  e.stopPropagation();
                  return;
                }

                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() || pendingAttachments.length > 0) {
                    handleSendMessage();
                  }
                }
              }}
              placeholder={isRecording ? "" : "Message..."}
            />
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowGifPicker(!showGifPicker);
                      setShowEmojiPicker(false);
                    }}
                    title="GIF"
                    style={{
                      color: "#f59e0b",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    GIF
                  </IconButton>
                  {isAiInstalled && !isAndroidPlatform && (
                    <IconButton
                      variant="ghost"
                      size="sm"
                      disabled={localAIService.isLoading}
                      onClick={async () => {
                        if (!input.trim()) return;
                        if (!localAIService.isLoaded)
                          await localAIService.init();
                        const rewritten = await localAIService.smartCompose(
                          input,
                        );
                        if (rewritten) setInput(rewritten);
                      }}
                      title="Rephrase"
                      style={{
                        color: localAIService.isLoading
                          ? "rgba(139,92,246,0.5)"
                          : "#8b5cf6",
                      }}
                    >
                      <Wand2 size={16} />
                    </IconButton>
                  )}
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowEmojiPicker(!showEmojiPicker);
                      setShowGifPicker(false);
                    }}
                    title="Emoji"
                    style={{ color: "#fbbf24" }}
                  >
                    <Smile size={24} />
                  </IconButton>

          </InputWrapper>

          <SendButton
            isRecording={isRecording}
            isChangingState={input.trim().length > 0 || pendingAttachments.length > 0}
            onClick={input.trim().length > 0 || pendingAttachments.length > 0 ? handleSendMessage : handleRecord}
          >
            {input.trim().length > 0 || pendingAttachments.length > 0 ? (
              <Send size={20} />
            ) : (
              <Mic size={20} />
            )}
          </SendButton>
        </InputContainer>
      )}
      {showEmojiPicker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "transparent",
          }}
          onClick={() => setShowEmojiPicker(false)}
        >
          <div
            style={{
              position: "absolute",
              bottom: "80px",
              right: "20px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <EmojiPicker
              onEmojiClick={onEmojiClick}
              theme={Theme.DARK}
              width={320}
              height={400}
            />
          </div>
        </div>
      )}

      {showGifPicker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
            background: "transparent",
          }}
          onClick={() => setShowGifPicker(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <GifPicker
              onSelect={(url) => {
                onSend(url);
                setShowGifPicker(false);
              }}
              onClose={() => setShowGifPicker(false)}
            />
          </div>
        </div>
      )}

      <PortShareModal
        isOpen={showPortModal}
        onClose={() => setShowPortModal(false)}
        port={port}
        setPort={setPort}
        onConfirm={() => {
          setShowPortModal(false);
          setShowMenu(false);
        }}
      />

      <MediaModal
        isOpen={mediaModalOpen}
        onClose={() => setMediaModalOpen(false)}
        media={selectedMedia}
      />

      {selectedFiles.length > 0 && (
        <FileUploadPreview
          files={selectedFiles}
          onClose={() => setSelectedFiles([])}
          onSend={handlePreviewSend}
          onAddMore={() => fileInputRef.current?.click()}
        />
      )}

      {showProfileModal && session && (
        <UserProfileModal
          session={session}
          onClose={() => setShowProfileModal(false)}
          onSave={async (aliasName, notes) => {
             await setSessionAlias(session.sid, aliasName, session.alias_avatar || "");
             await updateSessionNotes(session.sid, notes);
             ChatClient.sessionService.updateSessionNotes(session.sid, notes);
             ChatClient.sessionService.emit("session_updated");
          }}
          onGoToMessage={(msgId) => {
            setShowProfileModal(false);
            const index = messages.findIndex(m => m.id === msgId);
            if (index >= 0 && virtuosoRef.current) {
               virtuosoRef.current.scrollToIndex({ index, align: 'center', behavior: 'smooth' });
            }
          }}
        />
      )}
    </ChatContainer>
  );
};
