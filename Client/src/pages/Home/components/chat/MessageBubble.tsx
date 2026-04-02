import React, { useEffect, useState, useRef } from "react";
import { useRecentEmojis } from "../../../../hooks/useRecentEmojis";
import { ChatMessage } from "../../types";
import ChatClient from "../../../../services/core/ChatClient";
import { StorageService } from "../../../../services/storage/StorageService";
import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";
import {
  Reply,
  Plus,
  Globe,
  Check,
  CheckCheck,
  Copy,
  Edit2,
  Trash2,
  X,
  Mic,
  Pause,
  Play,
  Download,
  Sparkles,
  Plus as PlusIcon,
} from "lucide-react";
import { EmojiPicker } from "../../../../components/EmojiPicker";
import { Avatar } from "../../../../components/ui/Avatar";
import { UnsafeLinkModal } from "./UnsafeLinkModal";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

import { AudioBubble } from "./bubbles/AudioBubble";
import { ImageBubble } from "./bubbles/ImageBubble";
import { VideoBubble } from "./bubbles/VideoBubble";
import { FileBubble } from "./bubbles/FileBubble";
import { localAIService } from "../../../../services/ai/localAI.service";
import { useAIStatus } from "../../hooks/useAIStatus";

import { queryDB } from "../../../../services/storage/sqliteService";
import { Reaction } from "../../types";
import {
  isTrustedUrl,
  DEFAULT_TRUSTED_DOMAINS,
} from "../../../../utils/trustedDomains";
import {
  BubbleWrapper,
  Bubble,
  ReplyButton,
  ReplyContext,
  MediaContainer,
  ReactionBar,
  ReactionButton,
  MoreReactionsButton,
  ReactionBubble,
  HoverReactionBar,
  HoverReactionButton,
  HoverMoreReactionsButton,
  EditInputContainer,
  EditInput,
  EditActionButtons,
  EditButton,
} from "./Chat.styles";

// ─── GifBubble ────────────────────────────────────────────────────────────────
// Renders tenor/giphy GIFs without layout shift by reserving an aspect-ratio
// box with a shimmer skeleton, then fading in the media once it loads.
const GifBubble: React.FC<{
  media: { resolvedUrl: string; type: "image" | "video"; sourceUrl?: string };
  onLoad?: () => void;
  onError?: () => void;
}> = ({ media, onLoad, onError }) => {
  const [loaded, setLoaded] = useState(false);

  const handleLoad = () => { setLoaded(true); onLoad?.(); };
  const handleError = () => { onError?.(); };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "280px",
        marginBottom: "8px",
        borderRadius: "10px",
        overflow: "hidden",
        background: "#1a1a2e",
        aspectRatio: "4 / 3",
      }}
    >
      {/* Shimmer skeleton shown while loading */}
      {!loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, #1e1e2e 25%, #2a2a3e 50%, #1e1e2e 75%)",
            backgroundSize: "200% 100%",
            animation: "gifShimmer 1.4s ease-in-out infinite",
            borderRadius: "10px",
          }}
        />
      )}

      {/* Actual media */}
      {media.type === "video" ? (
        <video
          src={media.resolvedUrl}
          autoPlay
          loop
          muted
          playsInline
          onLoadedData={handleLoad}
          onError={handleError}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "10px",
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
        />
      ) : (
        <img
          src={media.resolvedUrl}
          alt="GIF"
          onLoad={handleLoad}
          onError={handleError}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "10px",
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
        />
      )}

      {/* GIF badge */}
      {loaded && (
        <div
          style={{
            position: "absolute",
            bottom: "6px",
            left: "6px",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
            color: "#fff",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            padding: "2px 5px",
            borderRadius: "4px",
            lineHeight: 1.4,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          GIF
        </div>
      )}

      {/* Keyframes injected once */}
      <style>{`
        @keyframes gifShimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
};
// ──────────────────────────────────────────────────────────────────────────────

export const MessageBubble = React.memo(
  ({
    msg,
    onReply,
    onMediaClick,
    messageLayout = "bubble",
    senderName,
    senderAvatar,
  }: {
    msg: ChatMessage;
    onReply?: (msg: ChatMessage | null) => void;
    onMediaClick?: (
      url: string,
      type: "image" | "video",
      description?: string,
      meta?: any,
    ) => void;
    messageLayout?: "bubble" | "modern";
    senderName?: string;
    senderAvatar?: string;
  }) => {
    const isMe = msg.sender === "me";
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [swipeOffset, setSwipeOffset] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const touchStartX = useRef(0);
    const touchMoveX = useRef(0);
    const prevMsgId = useRef<string>(msg.id);

    const [isLoading, setIsLoading] = useState(false);
    const [isRequestingDownload, setIsRequestingDownload] = useState(false);
    const [inlineMedia, setInlineMedia] = useState<
      Array<{ sourceUrl: string; resolvedUrl: string; type: "image" | "video"; isGif?: boolean }>
    >([]);
    // Tracks per-GIF load outcome so GIF-only messages can hide the URL on success
    // and fall back to showing the raw URL on error.
    const [gifLoadStates, setGifLoadStates] = useState<Record<string, "loaded" | "error">>({});

    const [reactions, setReactions] = useState<Reaction[]>([]);
    const [showPicker, setShowPicker] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const { recentEmojis, trackEmoji } = useRecentEmojis();

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{
      mouseX: number;
      mouseY: number;
    } | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(msg.text || "");
    const [pendingExternalUrl, setPendingExternalUrl] = useState<string | null>(
      null,
    );
    const pressTimer = useRef<NodeJS.Timeout | null>(null);
    const inlineObjectUrlsRef = useRef<string[]>([]);
    const urlRegex = () => /https?:\/\/[^\s<>()]+/gi;


    const { isInstalled: isAiInstalled } = useAIStatus(false);
    const isAndroidPlatform = Capacitor.getPlatform() === "android";
    const [msgSummaryOpen, setMsgSummaryOpen] = useState(false);
    const [msgSummary, setMsgSummary] = useState("");
    const [isSummarizingMsg, setIsSummarizingMsg] = useState(false);
    const [isInitializingForMsg, setIsInitializingForMsg] = useState(false);

    const handleMediaClickWrapper = (url: string, type: "image" | "video", description?: string) => {
      onMediaClick?.(url, type, description, {
        sender: msg.sender,
        senderName: senderName,
        timestamp: msg.timestamp,
      });
    };

    const normalizeUrlToken = (value: string): string =>
      value.replace(/[),.;!?]+$/g, "");

    const extractUrlsFromText = (text: string): string[] => {
      const matches = Array.from(text.matchAll(urlRegex())).map((m) =>
        normalizeUrlToken(m[0]),
      );
      return Array.from(new Set(matches.filter(Boolean)));
    };

    const renderTextWithLinks = (text: string) => {
      const nodes: React.ReactNode[] = [];
      let lastIndex = 0;
      let i = 0;

      for (const match of text.matchAll(urlRegex())) {
        const raw = match[0];
        const matchIndex = match.index ?? 0;
        const clean = normalizeUrlToken(raw);
        const suffix = raw.slice(clean.length);

        if (matchIndex > lastIndex) {
          nodes.push(text.slice(lastIndex, matchIndex));
        }

        nodes.push(
          <a
            key={`url-${i}-${clean}`}
            href={clean}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => handleMessageLinkClick(e, clean)}
            style={{ color: "#60a5fa", cursor: "pointer" }}
          >
            {clean}
          </a>,
        );

        if (suffix) nodes.push(suffix);
        lastIndex = matchIndex + raw.length;
        i += 1;
      }

      if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex));
      }

      return nodes.length ? nodes : text;
    };

    useEffect(() => {
      // MUI handles clickaway
    }, []);

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu(
        contextMenu === null
          ? {
            mouseX: e.clientX,
            mouseY: e.clientY,
          }
          : null,
      );
    };

    const handleCopy = async () => {
      const text = msg.text || "";
      let base64Image: string | undefined = undefined;

      try {
        if (msg.type === "image" && imageSrc) {
          try {
            const res = await fetch(imageSrc);
            const blob = await res.blob();
            base64Image = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            console.error("Failed to fetch image for clipboard", e);
          }
        }

        const payload: any = {};
        if (text) {
          payload.string = text;
        } else if (!base64Image) {
          payload.string = ""; // Fallback
        }
        
        if (base64Image) {
          payload.image = base64Image;
        }

        await Clipboard.write(payload);
      } catch (err) {
        console.error("Clipboard copy failed", err);
        alert("Failed to copy to clipboard");
      }
      setContextMenu(null);
    };

    const handleEdit = () => {
      setIsEditing(true);
      setEditText(msg.text || "");
      setContextMenu(null);
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
        setContextMenu(null);
      }
    };

    const handleSummarizeMsg = async () => {
      setContextMenu(null);
      setMsgSummary("");
      setMsgSummaryOpen(true);
      const text = msg.text || "";
      try {
        if (!localAIService.isLoaded) {
          setIsInitializingForMsg(true);
          await localAIService.init();
          setIsInitializingForMsg(false);
        }
        setIsSummarizingMsg(true);
        const result = await localAIService.summarizeSingleMessage(text);
        setMsgSummary(result);
      } catch (e) {
        console.error("Message summarization failed", e);
        setMsgSummary("Failed to summarize message.");
      } finally {
        setIsInitializingForMsg(false);
        setIsSummarizingMsg(false);
      }
    };

    useEffect(() => {
      loadReactions();

      const onUpdate = () => {
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
        const mapped: Reaction[] = rows.map((r: any) => ({
          id: r.id,
          messageId: r.message_id,
          senderEmail: r.sender_email,
          emoji: r.emoji,
          timestamp: r.timestamp,
        }));
        setReactions(mapped);
      } catch (e) {
        console.error("Failed to load reactions", e);
      }
    };

    const handleReaction = (emojiData: any) => {
      if (msg.sid && msg.id) {
        ChatClient.sendReaction(msg.sid, msg.id, emojiData.emoji, "add");
        setShowPicker(false);
        // Force a local update for immediate feedback
        loadReactions();
      }
    };

    const openExternalUrl = async (url: string) => {
      if (!/^https?:\/\//i.test(url)) return;

      try {
        if (window.electron?.openExternal) {
          const ok = await window.electron.openExternal(url);
          if (ok) return;
        }

        if (Capacitor.getPlatform() === "android") {
          const browserOpen = (window as any)?.Capacitor?.Plugins?.Browser
            ?.open;
          if (typeof browserOpen === "function") {
            await browserOpen({ url });
            return;
          }
        }

        window.open(url, "_blank", "noopener,noreferrer");
      } catch (e) {
        console.error("Failed to open external URL:", e);
        window.open(url, "_blank", "noopener,noreferrer");
      }
    };

    const handleMessageLinkClick = (e: React.MouseEvent, url: string) => {
      e.preventDefault();
      const matchedInline = inlineMedia.find((m) => m.sourceUrl === url);
      if (matchedInline) {
        if (matchedInline.type === "image") {
          onMediaClick?.(matchedInline.resolvedUrl, "image", msg.text, {
            sender: msg.sender,
            senderName: senderName,
            timestamp: msg.timestamp,
          });
        }
        return;
      }

      if (isTrustedUrl(url)) {
        openExternalUrl(url);
        return;
      }

      setPendingExternalUrl(url);
    };

    useEffect(() => {
      if (prevMsgId.current !== msg.id) {
        setImageSrc(null);
        for (const objUrl of inlineObjectUrlsRef.current) {
          URL.revokeObjectURL(objUrl);
        }
        inlineObjectUrlsRef.current = [];
        setInlineMedia([]);
        setGifLoadStates({});
        prevMsgId.current = msg.id;
      }

      if (msg.mediaStatus === "downloaded" && msg.mediaFilename && !imageSrc) {
        setIsLoading(true);
        setIsRequestingDownload(false);
        StorageService.getFileSrc(msg.mediaFilename, msg.mediaMime).then(
          (src) => {
            setImageSrc(src);
            setIsLoading(false);
          },
        );
      } else if (msg.mediaStatus === "downloading") {
        setIsRequestingDownload(false);
      }
    }, [msg.id, msg.mediaStatus, msg.mediaFilename, msg.mediaMime, imageSrc]);

    useEffect(() => {
      let active = true;
      for (const objUrl of inlineObjectUrlsRef.current) {
        URL.revokeObjectURL(objUrl);
      }
      inlineObjectUrlsRef.current = [];
      setInlineMedia([]);

      const isGifUrl = (url: string): boolean => {
        try {
          const { pathname, hostname } = new URL(url);
          const path = pathname.toLowerCase();
          // Tenor media served as mp4, giphy .gif, discord CDN .gif
          if (hostname.includes("tenor.com") && /\.mp4$/i.test(path)) return true;
          if (/\.gif$/i.test(path)) return true;
          return false;
        } catch {
          return false;
        }
      };

      const mediaTypeFromUrl = (url: string): "image" | "video" | null => {
        try {
          const pathname = new URL(url).pathname.toLowerCase();
          if (/\.(jpeg|jpg|png|webp|svg|bmp|avif|gif)$/i.test(pathname)) {
            return "image";
          }
          if (/\.(mp4|webm|mov|m4v)$/i.test(pathname)) {
            return "video";
          }
          return null;
        } catch {
          return null;
        }
      };

      const isAllowedMediaUrl = (url: string): boolean => {
        try {
          const hostname = new URL(url).hostname.toLowerCase();
          return DEFAULT_TRUSTED_DOMAINS.some((domain) =>
            hostname.endsWith(domain),
          );
        } catch {
          return false;
        }
      };

      const loadInlineMedia = async () => {
        const text = msg.text || "";
        if (!text || msg.mediaFilename) return;

        const candidates = extractUrlsFromText(text)
          .map((url) => ({ url, type: mediaTypeFromUrl(url) }))
          .filter(
            (entry): entry is { url: string; type: "image" | "video" } =>
              !!entry.type && isAllowedMediaUrl(entry.url),
          );

        if (!candidates.length) return;

        const loaded: Array<{
          sourceUrl: string;
          resolvedUrl: string;
          type: "image" | "video";
          isGif?: boolean;
        }> = [];

        for (const candidate of candidates) {
          const fetchAsBlobUrl = async (): Promise<string | null> => {
            try {
              const res = await fetch(candidate.url, {
                method: "GET",
                mode: "cors",
              });
              if (res.ok) {
                const blob = await res.blob();
                if (blob.size > 0) {
                  const objectUrl = URL.createObjectURL(blob);
                  inlineObjectUrlsRef.current.push(objectUrl);
                  return objectUrl;
                }
              }
            } catch (_e) {
              // Try no-cors fallback below.
            }

            try {
              const res = await fetch(candidate.url, {
                method: "GET",
                mode: "no-cors",
              });
              const blob = await res.blob();
              if (blob.size > 0) {
                const objectUrl = URL.createObjectURL(blob);
                inlineObjectUrlsRef.current.push(objectUrl);
                return objectUrl;
              }
            } catch (_e) {
              // Fetch-only mode: if both fail, skip embed.
            }

            return null;
          };

          try {
            const objectUrl = await fetchAsBlobUrl();
            if (!objectUrl) continue;
            loaded.push({
              sourceUrl: candidate.url,
              resolvedUrl: objectUrl,
              type: candidate.type,
              isGif: isGifUrl(candidate.url),
            });
          } catch (_e) {
            // Fetch-only mode: if fetch/CORS fails, skip inline embed.
          }
        }

        if (active) setInlineMedia(loaded);
      };

      loadInlineMedia();

      return () => {
        active = false;
      };
    }, [msg.id, msg.text, msg.mediaFilename]);

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
        msg.tempUrl ||
        processedThumbnail ||
        (msg.media && msg.media.url) ||
        null;

      if (msg.type === "image") {
        return (
          <>
            <ImageBubble
              src={imageSrc}
              thumbnailSrc={thumbnailSrc}
              text={msg.text || null}
              mediaStatus={msg.mediaStatus || ""}
              isDownloaded={isDownloaded}
              isDownloading={isDownloading}
              isRequestingDownload={isRequestingDownload}
              progress={msg.mediaProgress || 0}
              isLoading={isLoading}
              onDownload={handleDownload}
              onSave={handleSave}
              onMediaClick={handleMediaClickWrapper}
            />
            {msg.text && (
              <div style={{ marginTop: '8px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                {renderTextWithLinks(msg.text || "")}
              </div>
            )}
          </>
        );
      }

      if (msg.type === "audio") {
        return (
          <>
            <AudioBubble
              src={imageSrc}
              onDownload={handleDownload}
              isDownloaded={isDownloaded}
              isDownloading={isDownloading}
              progress={msg.mediaProgress || 0}
              isMe={isMe}
              onSave={handleSave}
            />
            {msg.text && (
              <div style={{ marginTop: '8px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                {renderTextWithLinks(msg.text || "")}
              </div>
            )}
          </>
        );
      }

      if (msg.type === "video") {
        return (
          <>
            <VideoBubble
              src={imageSrc}
              isDownloaded={isDownloaded}
              isDownloading={isDownloading}
              isRequestingDownload={isRequestingDownload}
              progress={msg.mediaProgress || 0}
              onDownload={handleDownload}
              onMediaClick={handleMediaClickWrapper}
              text={msg.text || null}
            />
            {msg.text && (
              <div style={{ marginTop: '8px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                {renderTextWithLinks(msg.text || "")}
              </div>
            )}
          </>
        );
      }

      if (msg.type === "file") {
        const fileNameToDisplay = msg.mediaOriginalName || msg.mediaFilename || msg.text || "File";
        // If the text is the same as the file name, don't show it twice.
        const shouldShowCaption = msg.text && msg.text !== fileNameToDisplay;
        return (
          <>
            <FileBubble
              text={fileNameToDisplay}
              isDownloaded={isDownloaded}
              isDownloading={isDownloading}
              progress={msg.mediaProgress || 0}
              onDownload={handleDownload}
              onSave={handleSave}
            />
            {shouldShowCaption && (
              <div style={{ marginTop: '8px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                {renderTextWithLinks(msg.text || "")}
              </div>
            )}
          </>
        );
      }

      return null;
    };

    const isEditable =
      isMe &&
      Date.now() - msg.timestamp < 15 * 60 * 1000 &&
      msg.type !== "deleted"; // 15 mins
    const isDeletable = msg.type !== "deleted";

    const onTouchStart = (e: React.TouchEvent) => {
      const touch = e.touches[0];
      const clientX = touch.clientX;
      const clientY = touch.clientY;

      touchStartX.current = clientX;

      setIsSwiping(true);

      pressTimer.current = setTimeout(() => {
        setContextMenu({
          mouseX: clientX,
          mouseY: clientY,
        });
        if (window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate(50);
        }
      }, 500);
    };

    const onTouchMove = (e: React.TouchEvent) => {
      touchMoveX.current = e.touches[0].clientX;
      const diff = touchMoveX.current - touchStartX.current;

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

    const groupedReactions = Object.entries(
      reactions.reduce(
        (acc: Record<string, { count: number; mine: boolean }>, r) => {
          if (!acc[r.emoji]) {
            acc[r.emoji] = { count: 0, mine: false };
          }
          acc[r.emoji].count += 1;
          if (r.senderEmail === "me") {
            acc[r.emoji].mine = true;
          }
          return acc;
        },
        {},
      ),
    ).sort((a, b) => b[1].count - a[1].count);

    const isValidDate = (d: any) => d instanceof Date && !isNaN(d.getTime());
    const safeDate = new Date(msg.timestamp);
    const timeString = isValidDate(safeDate)
      ? safeDate.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
      : "";
    const isModernLayout = messageLayout === "modern" && msg.type !== "system";

    const bubbleNode = (
      <Bubble
        isMe={isModernLayout ? false : isMe}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping
            ? "none"
            : "transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28)",
          ...(isModernLayout
            ? {
              background: "none",
              backgroundColor: "transparent",
              boxShadow: "none",
              borderRadius: "0",
              padding: "2px 0",
              color: "#d1d5db",
              maxWidth: "100%",
              fontSize: "0.95rem",
              lineHeight: "1.5",
            }
            : {}),
        }}
      >
        {!isModernLayout && (
          <ReplyButton
            isMe={isMe}
            onClick={(e) => {
              e.stopPropagation();
              onReply?.(msg);
            }}
          >
            <Reply size={16} />
          </ReplyButton>
        )}

        <HoverReactionBar
          isMe={isModernLayout ? false : isMe}
          style={{
            opacity: isHovered ? 1 : 0,
            visibility: isHovered ? "visible" : "hidden",
            transform: isHovered ? "translateY(0)" : "translateY(10px)",
          }}
        >
          {recentEmojis.map((emoji) => (
            <HoverReactionButton
              key={emoji}
              onClick={(e) => {
                e.stopPropagation();
                handleReaction({ emoji });
                trackEmoji(emoji);
              }}
            >
              {emoji}
            </HoverReactionButton>
          ))}
          <HoverMoreReactionsButton
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              setShowPicker(true);
            }}
          >
            <PlusIcon size={14} />
          </HoverMoreReactionsButton>
        </HoverReactionBar>

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
                  <EditButton
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelEdit();
                    }}
                  >
                    <X size={14} /> Cancel
                  </EditButton>
                  <EditButton
                    variant="primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveEdit();
                    }}
                  >
                    <Check size={14} /> Save
                  </EditButton>
                </EditActionButtons>
              </EditInputContainer>
            ) : (
              <>
                {renderMediaContent() || (() => {
                  // Detect GIF-only message: the entire text is a single GIF URL.
                  // In that case suppress the raw URL and show only the GIF.
                  const singleGif =
                    inlineMedia.length === 1 &&
                    inlineMedia[0].isGif &&
                    (msg.text || "").trim() === (inlineMedia[0].sourceUrl || "");

                  return (
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "break-word",
                      }}
                    >
                      {inlineMedia.map((media, idx) => {
                        if (!media.isGif) {
                          return (
                            <MediaContainer
                              style={{ marginBottom: "8px" }}
                              key={`${media.sourceUrl}-${idx}`}
                            >
                              {media.type === "image" ? (
                                <img
                                  src={media.resolvedUrl}
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
                                    onMediaClick?.(
                                      media.resolvedUrl,
                                      "image",
                                      msg.text,
                                      {
                                        sender: msg.sender,
                                        senderName: senderName,
                                        timestamp: msg.timestamp,
                                      },
                                    );
                                  }}
                                />
                              ) : (
                                <video
                                  controls
                                  src={media.resolvedUrl}
                                  style={{
                                    width: "100%",
                                    height: "auto",
                                    maxHeight: "300px",
                                    borderRadius: "8px",
                                  }}
                                />
                              )}
                            </MediaContainer>
                          );
                        }

                        // GIF with load/error feedback
                        const state = gifLoadStates[media.sourceUrl];
                        // If this GIF-only message errored → don't render the GifBubble at all
                        if (singleGif && state === "error") return null;

                        return (
                          <GifBubble
                            key={`${media.sourceUrl}-${idx}`}
                            media={media}
                            onLoad={() =>
                              setGifLoadStates((prev) => ({ ...prev, [media.sourceUrl]: "loaded" }))
                            }
                            onError={() =>
                              setGifLoadStates((prev) => ({ ...prev, [media.sourceUrl]: "error" }))
                            }
                          />
                        );
                      })}

                      {/* URL text: suppress when GIF-only and not errored */}
                      {msg.text &&
                        !(singleGif && gifLoadStates[inlineMedia[0]?.sourceUrl] !== "error") &&
                        renderTextWithLinks(msg.text)}
                    </div>
                  );
                })()}
              </>
            )}
          </>
        )}

        <div
          style={{
            fontSize: "0.65rem",
            opacity: 0.6,
            textAlign: "right",
            marginTop: "4px",
            display: isModernLayout ? "none" : "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "4px",
          }}
        >
          {!isModernLayout && timeString}
          {isMe && (
            <span style={{ display: "flex", alignItems: "center", opacity: msg.status === 2 ? 1 : 0.7 }}>
              {msg.status === 2 ? (
                <CheckCheck size={14} strokeWidth={2.5} color="#60a5fa" />
              ) : msg.status === 1 ? (
                <Check size={14} strokeWidth={2.5} />
              ) : (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              )}
            </span>
          )}
        </div>
      </Bubble>
    );

    return (
      <BubbleWrapper
        isMe={isModernLayout ? false : isMe}
        hasReactions={groupedReactions.length > 0}
        onContextMenu={handleContextMenu}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {!isModernLayout && (
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
        )}

        {isModernLayout ? (
          <div
            style={{
              display: "flex",
              gap: "12px",
              width: "100%",
              alignItems: "flex-start",
              padding: "2px 12px 2px 16px",
              borderRadius: "4px",
              backgroundColor: isHovered ? "rgba(255,255,255,0.04)" : "transparent",
              transition: "background-color 0.1s",
            }}
          >
            <div style={{ flexShrink: 0, marginTop: "2px" }}>
              <Avatar
                size="sm"
                src={senderAvatar}
                name={senderName || (isMe ? "You" : "User")}
              />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "6px",
                  marginBottom: "2px",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "#f3f4f6", lineHeight: 1 }}>
                  {senderName || (isMe ? "You" : "User")}
                </span>
                <span style={{ fontSize: "0.7rem", color: "#6b7280", display: "flex", alignItems: "center", gap: "3px" }}>
                  {timeString}
                  {isMe && (
                    <span style={{ display: "flex", alignItems: "center", opacity: msg.status === 2 ? 1 : 0.6 }}>
                      {msg.status === 2 ? (
                        <CheckCheck size={10} strokeWidth={2.5} color="#60a5fa" />
                      ) : msg.status === 1 ? (
                        <Check size={10} strokeWidth={2.5} />
                      ) : (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}
                        >
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                      )}
                    </span>
                  )}
                </span>
              </div>
              {bubbleNode}
            </div>
          </div>
        ) : (
          bubbleNode
        )}


        {groupedReactions.length > 0 && (
          <ReactionBubble
            isMe={isModernLayout ? false : isMe}
            style={
              isModernLayout
                ? {
                  left: "42px",
                  right: "auto",
                }
                : undefined
            }
          >
            {groupedReactions.map(([emoji, info]) => (
              <span
                key={emoji}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!msg.sid || !msg.id) return;
                  if (info.mine) {
                    // My reaction exists — remove it
                    ChatClient.sendReaction(msg.sid, msg.id, emoji, "remove");
                  } else {
                    // No reaction from me — add it
                    ChatClient.sendReaction(msg.sid, msg.id, emoji, "add");
                    trackEmoji(emoji);
                  }
                  loadReactions();
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  border: info.mine
                    ? "1.5px solid #3b82f6"
                    : "1px solid rgba(255,255,255,0.12)",
                  background: info.mine
                    ? "rgba(59,130,246,0.18)"
                    : "rgba(255,255,255,0.06)",
                  color: info.mine ? "#bfdbfe" : "#d1d5db",
                  fontSize: "12px",
                  lineHeight: 1.2,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  userSelect: "none",
                }}
                title={info.mine ? "Click to remove your reaction" : "Click to react"}
              >
                <span style={{ fontSize: "14px" }}>{emoji}</span>
                <span style={{ fontWeight: 500 }}>{info.count}</span>
              </span>
            ))}
          </ReactionBubble>
        )}


        {contextMenu !== null && (
          <Menu
            open={contextMenu !== null}
            onClose={(e: any) => {
              e.stopPropagation();
              setContextMenu(null);
            }}
            anchorReference="anchorPosition"
            anchorPosition={
              contextMenu !== null
                ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
                : undefined
            }
            MenuListProps={{
              style: {
                backgroundColor: "#1f2937",
                color: "white",
                borderRadius: "8px",
              },
            }}
            PaperProps={{
              style: {
                backgroundColor: "#1f2937",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
              },
            }}
          >
            <div style={{ padding: "8px 16px", outline: "none" }}>
              <ReactionBar>
                {recentEmojis.map((emoji) => (
                  <ReactionButton
                    key={emoji}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReaction({ emoji });
                      trackEmoji(emoji);
                      setContextMenu(null);
                    }}
                  >
                    {emoji}
                  </ReactionButton>
                ))}
                <MoreReactionsButton
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPicker(true);
                    setContextMenu(null);
                  }}
                >
                  <Plus size={16} />
                </MoreReactionsButton>
              </ReactionBar>
            </div>

            <MenuItem
              onClick={(e) => {
                e.stopPropagation();
                if (onReply) {
                  onReply(msg);
                  setContextMenu(null);
                }
              }}
              style={{ gap: "10px" }}
            >
              <Reply size={18} /> Reply
            </MenuItem>

            <MenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              style={{ gap: "10px" }}
            >
              <Copy size={18} /> Copy
            </MenuItem>

            {isAiInstalled && !isAndroidPlatform && msg.type === "text" && (msg.text || "").trim().length >= 20 && (
              <MenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleSummarizeMsg();
                }}
                style={{ gap: "10px", color: "#a78bfa" }}
              >
                <Sparkles size={18} /> Summarize
              </MenuItem>
            )}

            {isEditable && (
              <MenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit();
                }}
                style={{ gap: "10px" }}
              >
                <Edit2 size={18} /> Edit
              </MenuItem>
            )}

            {isDeletable && (
              <MenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                style={{ gap: "10px", color: "#f87171" }}
              >
                <Trash2 size={18} /> Delete
              </MenuItem>
            )}
          </Menu>
        )}

        {/* Per-message AI summary panel */}
        {msgSummaryOpen && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 3000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
            }}
            onClick={() => setMsgSummaryOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: "#1a1a2e",
                border: "1px solid rgba(167,139,250,0.3)",
                borderRadius: "16px",
                padding: "20px",
                width: "min(340px, 90vw)",
                boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Sparkles size={16} color="#a78bfa" />
                  <span style={{ color: "#fff", fontSize: "14px", fontWeight: 600 }}>Message Summary</span>
                </div>
                <button
                  onClick={() => setMsgSummaryOpen(false)}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: "2px" }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              {isInitializingForMsg ? (
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", textAlign: "center", margin: 0 }}>
                  ⚙️ Initialising model...
                </p>
              ) : isSummarizingMsg ? (
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", textAlign: "center", margin: 0 }}>
                  ✨ Generating...
                </p>
              ) : (
                <p style={{ color: "rgba(255,255,255,0.88)", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
                  {msgSummary}
                </p>
              )}
            </div>
          </div>
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

        {pendingExternalUrl && (
          <UnsafeLinkModal
            url={pendingExternalUrl}
            onCancel={() => setPendingExternalUrl(null)}
            onConfirm={async () => {
              await openExternalUrl(pendingExternalUrl);
              setPendingExternalUrl(null);
            }}
          />
        )}
      </BubbleWrapper>
    );
  },
);
