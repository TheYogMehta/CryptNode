import React, { useEffect, useState, useRef } from "react";
import { ChatMessage } from "../../types";
import ChatClient from "../../../../services/ChatClient";
import { StorageService } from "../../../../utils/Storage";
import {
  Download,
  Save,
  Play,
  Pause,
  FileIcon,
  Loader2,
  Reply,
  Smile,
  Plus,
  Globe,
  Check,
  CheckCheck,
  Copy,
  Edit2,
  Trash2,
  X,
} from "lucide-react";
import { EmojiPicker } from "../../../../components/EmojiPicker";
import { LinkPreview } from "../../../../components/LinkPreview";
import { UnsafeLinkModal } from "./UnsafeLinkModal";
import { queryDB } from "../../../../services/sqliteService";
import { Reaction } from "../../types";
import {
  isTrustedUrl,
  addTrustedDomain,
} from "../../../../utils/trustedDomains";
import {
  BubbleWrapper,
  Bubble,
  ReplyButton,
  ReplyContext,
  MediaContainer,
  DownloadOverlay,
  MediaActionBtn,
  AudioContainer,
  AudioControls,
  PlayPauseBtn,
  WaveformContainer,
  WaveformBar,
  SpeedButton,
  AudioTimeInfo,
  FileAttachment,
  FileInfo,
  FileName,
  FileStatus,
  ContextMenuContainer,
  ContextMenuItem,
  ReactionBar,
  ReactionButton,
  MoreReactionsButton,
  ReactionBubble,
  EditInputContainer,
  EditInput,
  EditActionButtons,
  EditButton,
} from "./Chat.styles";

const AudioPlayer = ({
  src,
  onDownload,
  isDownloaded,
  isDownloading,
  progress,
  isMe,
  onSave,
}: any) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [waveform] = useState(() =>
    Array.from({ length: 40 }, () => Math.random() * 0.8 + 0.2),
  );

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const formatTime = (time: number) => {
    if (!Number.isFinite(time)) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? "0" : ""}${sec}`;
  };

  const handleSpeed = () => {
    setSpeed((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1));
  };

  return (
    <AudioContainer isMe={isMe}>
      {src ? (
        <audio
          ref={audioRef}
          src={src}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d)) setDuration(d);
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onEnded={() => setIsPlaying(false)}
          style={{ display: "none" }}
        />
      ) : null}

      <AudioControls isMe={isMe}>
        <PlayPauseBtn
          isMe={isMe}
          onClick={isDownloaded ? togglePlay : onDownload}
        >
          {!isDownloaded ? (
            isDownloading ? (
              <span style={{ fontSize: "10px", fontWeight: "bold" }}>
                {Math.round(progress * 100)}%
              </span>
            ) : (
              <Download size={20} />
            )
          ) : isPlaying ? (
            <Pause size={20} fill="currentColor" />
          ) : (
            <Play size={20} fill="currentColor" />
          )}
        </PlayPauseBtn>

        <WaveformContainer>
          {waveform.map((h, i) => (
            <WaveformBar
              key={i}
              height={h}
              isMe={isMe}
              active={i / waveform.length < currentTime / duration}
            />
          ))}
        </WaveformContainer>

        {isDownloaded && (
          <SpeedButton onClick={handleSpeed}>{speed}x</SpeedButton>
        )}
      </AudioControls>

      <AudioTimeInfo>
        <span>{isDownloaded ? formatTime(currentTime) : "0:00"}</span>
        <span>
          {isDownloaded
            ? formatTime(duration)
            : isDownloading
              ? "Downloading..."
              : "Voice Note"}
        </span>
      </AudioTimeInfo>

      {isDownloaded && !isMe && (
        <div
          style={{ position: "absolute", top: 4, right: 4 }}
          onClick={onSave}
        >
          <Save size={14} style={{ opacity: 0.5, cursor: "pointer" }} />
        </div>
      )}
    </AudioContainer>
  );
};

export const MessageBubble = ({
  msg,
  onReply,
  onMediaClick,
}: {
  msg: ChatMessage;
  onReply?: (msg: ChatMessage | null) => void;
  onMediaClick?: (
    url: string,
    type: "image" | "video",
    description?: string,
  ) => void;
}) => {
  const isMe = msg.sender === "me";
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchMoveX = useRef(0);
  const prevMsgId = useRef<string>(msg.id);

  const [isDecrypted, setIsDecrypted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRequestingDownload, setIsRequestingDownload] = useState(false);

  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [unsafeLink, setUnsafeLink] = useState<{
    url: string;
    type: "unsafe" | "unknown";
    isLoading?: boolean;
  } | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text || "");
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleClickOutside = () =>
      setContextMenu({ visible: false, x: 0, y: 0 });
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
  };



  const handleCopy = async () => {
    const text = msg.text || "";
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.warn("Clipboard API failed, trying fallback", err);
      // Fallback for non-secure contexts or permission issues
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed"; // Avoid scrolling
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand("copy");
      } catch (e) {
        console.error("Fallback copy failed", e);
        alert("Failed to copy text");
      }
      document.body.removeChild(textArea);
    }
    setContextMenu({ visible: false, x: 0, y: 0 });
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditText(msg.text || "");
    setContextMenu({ visible: false, x: 0, y: 0 });
  };

  const handleSaveEdit = () => {
    if (msg.sid && msg.id && editText && editText.trim() !== "") {
      ChatClient.editMessage(msg.sid, msg.id, editText);
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText(msg.text || "");
  };

  const handleDelete = () => {
    if (msg.sid && msg.id) {
      ChatClient.deleteMessage(msg.sid, msg.id);
      setContextMenu({ visible: false, x: 0, y: 0 });
    }
  };

  useEffect(() => {
    loadReactions();

    const onUpdate = (e: any) => {
      loadReactions();
    };

    ChatClient.on(`reaction_update:${msg.id}`, onUpdate);
    return () => {
      ChatClient.off(`reaction_update:${msg.id}`, onUpdate);
    };
  }, [msg.id]);

  const loadReactions = async () => {
    try {
      const rows = await queryDB(
        "SELECT * FROM reactions WHERE message_id = ?",
        [msg.id],
      );
      setReactions(rows);
    } catch (e) {
      console.error("Failed to load reactions", e);
    }
  };

  const handleReaction = (emojiData: any) => {
    if (msg.sid && msg.id) {
      ChatClient.sendReaction(msg.sid, msg.id, emojiData.emoji, "add");
      setShowPicker(false);
    }
  };

  const toggleReaction = (emoji: string) => {
    const myReaction = reactions.find(
      (r) => r.emoji === emoji && r.senderEmail === "me",
    );
    if (myReaction && msg.sid && msg.id) {
      ChatClient.sendReaction(msg.sid, msg.id, emoji, "remove");
    } else if (msg.sid && msg.id) {
      ChatClient.sendReaction(msg.sid, msg.id, emoji, "add");
    }
  };

  const handleLinkClick = async (e: React.MouseEvent, url: string) => {
    // If trusted, let the browser handle the click natively (avoids popup blockers)
    if (isTrustedUrl(url)) {
      return;
    }

    e.preventDefault();
    // continue with safety check...

    console.log("Link not trusted (or not in local list), checking safety...");
    setUnsafeLink({ url, type: "unknown", isLoading: true });

    try {
      const status = await ChatClient.checkLinkSafety(url);
      console.log("Safety status:", status);

      if (status === "SAFE") {
        setUnsafeLink({ url, type: "unknown", isLoading: false });
      } else if (status === "UNSAFE") {
        setUnsafeLink({ url, type: "unsafe", isLoading: false });
      } else {
        setUnsafeLink({ url, type: "unknown", isLoading: false });
      }
    } catch (e) {
      console.error("Failed to check link safety", e);
      setUnsafeLink({ url, type: "unknown", isLoading: false });
    }
  };

  useEffect(() => {
    if (prevMsgId.current !== msg.id) {
      setImageSrc(null);
      setIsDecrypted(false);
      prevMsgId.current = msg.id;
    }

    if (msg.mediaStatus === "downloaded" && msg.mediaFilename && !imageSrc) {
      setIsLoading(true);
      setIsRequestingDownload(false);
      StorageService.getFileSrc(msg.mediaFilename, msg.mediaMime).then(
        (src) => {
          setImageSrc(src);
          setIsDecrypted(true);
          setIsLoading(false);
        },
      );
    } else if (msg.mediaStatus === "downloading") {
      setIsRequestingDownload(false);
    }
  }, [msg.id, msg.mediaStatus, msg.mediaFilename, msg.mediaMime, imageSrc]);

  const handleDownload = () => {
    if (isDownloading) return;
    console.log(`[MessageBubble] Download clicked for ${msg.id}`);
    if (msg.sid && msg.id) {
      setIsRequestingDownload(true);
      ChatClient.requestDownload(msg.sid, msg.id);
      setTimeout(() => {
        setIsRequestingDownload((d) => {
          if (d) console.log("Resetting stuck download state");
          return false;
        });
      }, 5000);
    }
  };

  const handleSave = async () => {
    if (msg.mediaFilename && msg.text) {
      try {
        const savedPath = await StorageService.saveToDownloads(
          msg.mediaFilename,
          msg.text,
        );
        alert(`Saved to: ${savedPath}`);
      } catch (e) {
        console.error("Save failed:", e);
        alert("Failed to save file.");
      }
    } else if (imageSrc) {
      const a = document.createElement("a");
      a.href = imageSrc;
      a.download = msg.text || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const isDownloading =
    msg.mediaStatus === "downloading" || isRequestingDownload;
  const isDownloaded = msg.mediaStatus === "downloaded";

  const renderMediaContent = () => {
    let processedThumbnail = msg.thumbnail;
    if (
      processedThumbnail &&
      !processedThumbnail.startsWith("data:") &&
      !processedThumbnail.startsWith("http")
    ) {
      processedThumbnail = `data:image/jpeg;base64,${processedThumbnail}`;
    }
    const thumbnailSrc =
      msg.tempUrl || processedThumbnail || (msg.media && msg.media.url) || null;

    if (msg.type === "image") {
      if (imageSrc || (msg.mediaStatus === "uploading" && msg.tempUrl)) {
        return (
          <MediaContainer>
            <img
              src={imageSrc || msg.tempUrl}
              alt="attachment"
              onClick={(e) => {
                e.stopPropagation();
                if (onMediaClick) {
                  onMediaClick(
                    imageSrc || msg.tempUrl || "",
                    "image",
                    msg.text,
                  );
                } else {
                  window.open(imageSrc || msg.tempUrl, "_blank");
                }
              }}
              onError={(e) => {
                console.error(
                  `[MessageBubble] Image load failed. ID=${msg.id}`,
                );
                e.currentTarget.style.display = "none";
              }}
              style={{
                cursor: "pointer",
                opacity: msg.mediaStatus === "uploading" ? 0.7 : 1,
              }}
            />
            <MediaActionBtn
              onClick={(e) => {
                e.stopPropagation();
                handleSave();
              }}
            >
              <Save size={16} />
            </MediaActionBtn>
            {msg.mediaStatus === "uploading" && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(0,0,0,0.3)",
                  borderRadius: "12px",
                }}
              >
                <Loader2 className="animate-spin" size={24} color="white" />
                <span
                  style={{
                    color: "white",
                    fontSize: "0.75rem",
                    marginTop: "4px",
                    fontWeight: 500,
                  }}
                >
                  Uploading...
                </span>
              </div>
            )}
          </MediaContainer>
        );
      }

      return (
        <MediaContainer onClick={!isDownloaded ? handleDownload : undefined}>
          {thumbnailSrc && (
            <img
              src={thumbnailSrc}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: "blur(10px)",
                transform: "scale(1.1)",
                opacity: 0.6,
              }}
            />
          )}
          <DownloadOverlay>
            {isDownloading ? (
              <div style={{ fontWeight: "bold" }}>
                {isRequestingDownload
                  ? "0%"
                  : `${Math.round((msg.mediaProgress || 0) * 100)}%`}
              </div>
            ) : isLoading ? (
              <Loader2 className="animate-spin" size={24} color="white" />
            ) : (
              <>
                <Download size={32} />
                <span style={{ fontSize: "12px", fontWeight: "500" }}>
                  Download
                </span>
              </>
            )}
          </DownloadOverlay>
        </MediaContainer>
      );
    }

    if (msg.type === "audio") {
      return (
        <AudioPlayer
          src={imageSrc}
          onDownload={handleDownload}
          isDownloaded={isDownloaded}
          isDownloading={isDownloading}
          progress={msg.mediaProgress || 0}
          isMe={isMe}
          onSave={handleSave}
        />
      );
    }

    if (msg.type === "video") {
      if (isDownloaded && imageSrc) {
        return (
          <MediaContainer>
            <video
              src={imageSrc}
              controls={false}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMediaClick?.(imageSrc || "", "video", msg.text);
              }}
              style={{
                maxWidth: "100%",
                borderRadius: "12px",
                cursor: "pointer",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  background: "rgba(0,0,0,0.5)",
                  borderRadius: "50%",
                  padding: "12px",
                  backdropFilter: "blur(4px)",
                }}
              >
                <Play size={24} fill="white" color="white" />
              </div>
            </div>
          </MediaContainer>
        );
      }
      return (
        <MediaContainer>
          {isDownloading ? (
            <div style={{ color: "white" }}>
              {isRequestingDownload
                ? "0%"
                : `${Math.round((msg.mediaProgress || 0) * 100)}%`}
            </div>
          ) : (
            <button
              onClick={handleDownload}
              style={{
                padding: "8px 16px",
                borderRadius: "20px",
                border: "none",
                backgroundColor: "rgba(255,255,255,0.2)",
                color: "white",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Download size={16} /> <span>Video</span>
            </button>
          )}
        </MediaContainer>
      );
    }

    if (msg.type === "file") {
      return (
        <FileAttachment>
          <div
            style={{
              padding: "10px",
              backgroundColor: "rgba(255,255,255,0.1)",
              borderRadius: "8px",
            }}
          >
            <FileIcon size={24} />
          </div>
          <FileInfo>
            <FileName>{msg.text || "File"}</FileName>
            <FileStatus>
              {isDownloaded ? "Downloaded" : "Attachment"}
            </FileStatus>
          </FileInfo>
          {isDownloaded ? (
            <button
              onClick={handleSave}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                opacity: 0.8,
              }}
            >
              <Save size={20} />
            </button>
          ) : (
            !isDownloading && (
              <button
                onClick={handleDownload}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  opacity: 0.8,
                }}
              >
                <Download size={20} />
              </button>
            )
          )}
          {isDownloading && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 12,
                right: 12,
                height: "3px",
                backgroundColor: "rgba(255,255,255,0.1)",
              }}
            >
              <div
                style={{
                  width: `${(msg.mediaProgress || 0) * 100}%`,
                  height: "100%",
                  backgroundColor: "#4ade80",
                }}
              />
            </div>
          )}
        </FileAttachment>
      );
    }

    if (msg.type === "gif") {
      return (
        <MediaContainer>
          <img
            src={msg.text}
            alt="gif"
            onClick={(e) => {
              e.stopPropagation();
              if (onMediaClick) {
                onMediaClick(msg.text || "", "image", "GIF");
              } else {
                window.open(msg.text, "_blank");
              }
            }}
            style={{
              width: "100%",
              height: "auto",
              borderRadius: "8px",
              cursor: "pointer",
              minHeight: "100px",
            }}
          />
        </MediaContainer>
      );
    }

    return null;
  };

  const isEditable =
    isMe && Date.now() - msg.timestamp < 15 * 60 * 1000 && msg.type !== "deleted"; // 15 mins
  const isDeletable =
    isMe && Date.now() - msg.timestamp < 24 * 60 * 60 * 1000 && msg.type !== "deleted"; // 24 hours

  // ...

  const onTouchStart = (e: React.TouchEvent) => {
    // Capture coordinates synchronously!
    const touch = e.touches[0];
    const clientX = touch.clientX;
    const clientY = touch.clientY;

    touchStartX.current = clientX;
    // Store Y for potential vertical scroll detection if needed, but not used for swipe

    setIsSwiping(true);

    // Context Menu Long Press Logic
    pressTimer.current = setTimeout(() => {
      setContextMenu({
        visible: true,
        x: clientX,
        y: clientY,
      });
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 500);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchMoveX.current = e.touches[0].clientX;
    const diff = touchMoveX.current - touchStartX.current;

    // If moving, cancel long press (increased threshold to 30px)
    if (Math.abs(diff) > 30) {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    }

    if (!isSwiping) return;
    if (diff > 0) {
      setSwipeOffset(Math.min(diff, 60));
    }
  };

  const onTouchEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);

    if (swipeOffset >= 50 && onReply) {
      onReply(msg);
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    }
    setSwipeOffset(0);
    setIsSwiping(false);
  };

  const urlMatch = msg.text?.match(/(https?:\/\/[^\s]+)/);
  const firstUrl = urlMatch ? urlMatch[0] : null;

  const groupedReactions = reactions.reduce((acc: any, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {});

  const isValidDate = (d: any) => d instanceof Date && !isNaN(d.getTime());
  const safeDate = new Date(msg.timestamp);
  const timeString = isValidDate(safeDate)
    ? safeDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    : "";

  return (
    <BubbleWrapper
      isMe={isMe}
      hasReactions={Object.keys(groupedReactions).length > 0}
      onContextMenu={handleContextMenu}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "60px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: swipeOffset / 50,
          transform: `translateX(${swipeOffset - 60}px)`,
          color: "#6366f1",
        }}
      >
        <Reply size={20} />
      </div>

      <Bubble
        isMe={isMe}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping
            ? "none"
            : "transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28)",
        }}
      >
        <ReplyButton
          isMe={isMe}
          onClick={(e) => {
            e.stopPropagation();
            onReply?.(msg);
          }}
        >
          <Reply size={16} />
        </ReplyButton>

        {msg.replyTo && (
          <ReplyContext>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: "bold", marginBottom: "2px" }}>
                {msg.replyTo.sender}
              </div>
              <div
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  opacity: 0.8,
                }}
              >
                {msg.replyTo.type === "text"
                  ? msg.replyTo.text
                  : `[${msg.replyTo.type}] ${msg.replyTo.text || ""}`}
              </div>
            </div>
            {msg.replyTo.thumbnail && (
              <img
                src={
                  msg.replyTo.thumbnail.startsWith("data:")
                    ? msg.replyTo.thumbnail
                    : `data:image/jpeg;base64,${msg.replyTo.thumbnail}`
                }
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "4px",
                  objectFit: "cover",
                }}
              />
            )}
          </ReplyContext>
        )}

        {msg.type === "system" ? (
          <div
            style={{
              fontSize: "0.85rem",
              color: "rgba(255, 255, 255, 0.6)",
              textAlign: "center",
              fontStyle: "italic",
              padding: "4px 0",
            }}
          >
            {msg.text}
          </div>
        ) : msg.type === "live share port" ? (
          <div style={{ padding: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Globe size={24} />
              <div>
                <b style={{ display: "block" }}>Dev Port Shared</b>
                <code style={{ fontSize: "0.8rem", opacity: 0.8 }}>
                  Port: {msg.shared?.port}
                </code>
              </div>
            </div>
            <button
              onClick={() =>
                window.open(`http://localhost:${msg.shared?.port}`)
              }
              style={{
                marginTop: "12px",
                width: "100%",
                padding: "8px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "white",
                color: "black",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              Open Port
            </button>
          </div>
        ) : (
          <>
            {isEditing ? (
              <EditInputContainer onClick={(e) => e.stopPropagation()}>
                <EditInput
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveEdit();
                    } else if (e.key === "Escape") {
                      handleCancelEdit();
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <EditActionButtons>
                  <EditButton variant="secondary" onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}>
                    <X size={14} /> Cancel
                  </EditButton>
                  <EditButton variant="primary" onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}>
                    <Check size={14} /> Save
                  </EditButton>
                </EditActionButtons>
              </EditInputContainer>
            ) : (
              <>
                {renderMediaContent() || (
                  <div
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "break-word" }}
                  >
                    {msg.text &&
                      msg.text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                        part.match(/https?:\/\//) ? (
                          <a
                            key={i}
                            href={part}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => handleLinkClick(e, part)}
                            style={{ color: "#60a5fa", cursor: "pointer" }}
                          >
                            {part}
                          </a>
                        ) : (
                          part
                        ),
                      )}
                    {/* Link Previews */}
                    {firstUrl && !msg.mediaFilename && (
                      <div style={{ marginTop: "8px", maxWidth: "400px" }}>
                        {isTrustedUrl(firstUrl) &&
                          /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(
                            new URL(firstUrl).pathname,
                          ) ? (
                          <MediaContainer>
                            <img
                              src={firstUrl}
                              alt="preview"
                              style={{
                                width: "100%",
                                height: "auto",
                                maxHeight: "300px",
                                borderRadius: "8px",
                                cursor: "zoom-in",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onMediaClick?.(firstUrl, "image", msg.text);
                              }}
                            />
                          </MediaContainer>
                        ) : (
                          <LinkPreview url={firstUrl} />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* WhatsApp-style Reaction Floating Badge */}
        {Object.keys(groupedReactions).length > 0 && (
          <ReactionBubble
            isMe={isMe}
            onClick={(e) => {
              e.stopPropagation();
              // Optionally confirm removal or just show who reacted
            }}
          >
            {Object.entries(groupedReactions)
              .sort((a: any, b: any) => b[1] - a[1]) // Sort by count desc
              .slice(0, 3) // Show top 3
              .map(([emoji, count]) => (
                <span key={emoji as string} style={{ lineHeight: 1 }}>{emoji as string}</span>
              ))}
            {(Object.values(groupedReactions) as number[]).reduce((a, b) => a + b, 0) > 1 && (
              <span style={{ marginLeft: 2 }}>
                {(Object.values(groupedReactions) as number[]).reduce((a, b) => a + b, 0)}
              </span>
            )}
          </ReactionBubble>
        )}

        <div
          style={{
            fontSize: "0.65rem",
            opacity: 0.6,
            textAlign: "right",
            marginTop: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "4px",
          }}
        >
          {timeString}
          {isMe && (
            <span style={{ display: "flex" }}>
              {msg.status === 2 ? (
                <CheckCheck size={14} strokeWidth={2.5} />
              ) : (
                <Check size={14} strokeWidth={2.5} />
              )}
            </span>
          )}
        </div>
      </Bubble>

      {contextMenu.visible && (
        <React.Fragment>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              right: 0,
              zIndex: 999,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu({ visible: false, x: 0, y: 0 });
            }}
          />
          <ContextMenuContainer
            x={Math.min(contextMenu.x, window.innerWidth - 360)} // Shift left to fit wider ReactionBar (~300px)
            y={Math.max(70, Math.min(contextMenu.y, window.innerHeight - 300))} // Ensure at least 70px from top for ReactionBar
          >
            <ReactionBar>
              {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                <ReactionButton
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReaction({ emoji });
                    setContextMenu({ visible: false, x: 0, y: 0 });
                  }}
                >
                  {emoji}
                </ReactionButton>
              ))}
              <MoreReactionsButton
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPicker(true);
                  setContextMenu({ visible: false, x: 0, y: 0 });
                }}
              >
                <Plus size={16} />
              </MoreReactionsButton>
            </ReactionBar>

            <ContextMenuItem onClick={(e) => { e.stopPropagation(); if (onReply) { onReply(msg); setContextMenu({ visible: false, x: 0, y: 0 }); } }}>
              <Reply size={18} /> Reply
            </ContextMenuItem>

            <ContextMenuItem onClick={(e) => { e.stopPropagation(); handleCopy(); }}>
              <Copy size={18} /> Copy
            </ContextMenuItem>

            {isEditable && (
              <ContextMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(); }}>
                <Edit2 size={18} /> Edit
              </ContextMenuItem>
            )}

            {isDeletable && (
              <ContextMenuItem variant="danger" onClick={(e) => { e.stopPropagation(); handleDelete(); }}>
                <Trash2 size={18} /> Delete
              </ContextMenuItem>
            )}
          </ContextMenuContainer>
        </React.Fragment>
      )}

      {showPicker && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
          onClick={(e) => {
            e.stopPropagation();
            setShowPicker(false);
          }}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <EmojiPicker
              onEmojiClick={(emoji: any) => {
                handleReaction(emoji);
                setShowPicker(false);
              }}
              onClose={() => setShowPicker(false)}
            />
          </div>
        </div>
      )}
    </BubbleWrapper>
  );
};
