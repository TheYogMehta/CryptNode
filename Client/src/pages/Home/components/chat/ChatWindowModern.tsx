import React, { useRef, useEffect, useState } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import {
  Send,
  Phone,
  Video,
  MoreVertical,
  Paperclip,
  Smile,
  ArrowLeft,
  Lightbulb,
  Copy,
  Trash2,
  X,
} from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { EmojiPicker } from "../../../../components/EmojiPicker";
import { GifPicker } from "../../../../components/GifPicker";
import { colors, spacing } from "../../../../theme/design-system";
import { ChatMessage, SessionData } from "../../types";
import { useTheme } from "../../../../theme/ThemeContext";
import {
  Container,
  Header,
  HeaderInfo,
  Avatar,
  Name,
  Status,
  MessagesArea,
  InputArea,
  InputWrapper,
  Input,
  ActionButton,
  SendButton,
  DateSeparator,
  ReplyContainer,
  CloseReplyButton,
} from "./ChatWindowModern.styles";
import { localAIService } from "../../../../services/ai/localAI.service";
import { useAIStatus } from "../../hooks/useAIStatus";
import { UserProfileModal } from "../overlays/UserProfileModal";
import { MediaModal } from "./MediaModal";
import { setSessionAlias, updateSessionNotes } from "../../../../services/storage/sqliteService";
import ChatClient from "../../../../services/core/ChatClient";

interface ChatWindowProps {
  messages: ChatMessage[];
  onSend: (text: string, replyTo?: any) => void;
  activeChat: string | null;
  session?: SessionData;
  onFileSelect: (file: File) => void;
  peerOnline: boolean;
  onStartCall: (mode: "Audio" | "Video" | "Screen") => void;
  onBack?: () => void;
  replyingTo: ChatMessage | null;
  setReplyingTo: (msg: ChatMessage | null) => void;
  onLoadMore: () => void;
  isRateLimited: boolean;
  firstItemIndex?: number;
}

export const ChatWindowModern: React.FC<ChatWindowProps> = ({
  messages,
  onSend,
  activeChat,
  session,
  onFileSelect,
  peerOnline,
  onStartCall,
  onBack,
  replyingTo,
  setReplyingTo,
  onLoadMore,
  isRateLimited,
  firstItemIndex = 0,
}) => {
  const { messageLayout } = useTheme();
  const { isLoaded: isAiLoaded, isInstalled: isAiInstalled } = useAIStatus(false);
  const [inputText, setInputText] = useState("");
  const [showAiSuggestions, setShowAiSuggestions] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<{
    url: string;
    type: "image" | "video";
    description?: string;
    meta?: any;
    mimeType?: string;
  } | null>(null);
  const sessionService = ChatClient.sessionService;
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);

  const [isGeneratingReplies, setIsGeneratingReplies] = useState(false);

  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const selectionMode = selectedMessages.size > 0;

  const handleToggleSelect = (msg: ChatMessage) => {
    if (!msg.id) return;
    const msgId = msg.id;
    setSelectedMessages(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const clearSelection = () => setSelectedMessages(new Set());

  const handleCopySelected = async () => {
    try {
      const msgsToCopy = messages.filter(m => m.id && selectedMessages.has(m.id)).sort((a,b) => a.timestamp - b.timestamp);
      const text = msgsToCopy.map(m => {
        const sender = m.sender === "me" ? "Me" : (session?.alias_name || session?.peer_name || "User");
        const time = new Date(m.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const content = m.text || (m.mediaFilename ? `[File: ${m.mediaFilename}]` : `[${m.type}]`);
        return `[${time}] ${sender}: ${content}`;
      }).join('\n');
      
      const { Clipboard } = await import("@capacitor/clipboard");
      await Clipboard.write({ string: text });
      clearSelection();
    } catch(e) {
      console.error("Copy multiple failed", e);
    }
  };

  const handleDeleteSelected = async () => {
    if(!activeChat) return;
    if (window.confirm(`Delete ${selectedMessages.size} selected message(s)?`)) {
      for(const id of selectedMessages) {
        ChatClient.deleteMessage(activeChat, id);
      }
      clearSelection();
    }
  };



  const generateQuickReplies = async () => {
    if (isGeneratingReplies) return;
    setIsGeneratingReplies(true);
    try {
      const items = await localAIService.quickReplies(inputText, 3);
      setQuickReplies(items);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingReplies(false);
    }
  };

  useEffect(() => {
    if (quickReplies.length > 0 && inputText.trim().length > 0) {
      setQuickReplies([]);
    }
  }, [inputText]);
  
  const handleEmojiClick = (emojiData: any) => {
    setInputText((prev) => prev + emojiData.emoji);
  };

  const handleSend = () => {
    if (inputText.trim()) {
      onSend(inputText, replyingTo || undefined);
      setInputText("");
      setReplyingTo(null);
      setShowEmojiPicker(false);
      setShowGifPicker(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleMediaClick = (
    url: string,
    type: "image" | "video",
    description?: string,
    meta?: any,
    mimeType?: string
  ) => {
    setSelectedMedia({ url, type, description, meta, mimeType });
    setMediaModalOpen(true);
  };

  if (!session) return null;
  const peerLabelFromEmail = session.peerEmail
    ? session.peerEmail.split("@")[0]
    : undefined;

  return (
    <Container>
      {selectionMode ? (
        <Header style={{ backgroundColor: "rgba(99, 102, 241, 0.15)", borderBottom: "1px solid rgba(99, 102, 241, 0.3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1 }}>
            <ActionButton onClick={clearSelection}>
              <X size={20} />
            </ActionButton>
            <span style={{ fontWeight: 600, fontSize: "16px", color: "#f3f4f6" }}>
              {selectedMessages.size} selected
            </span>
          </div>
          <div style={{ display: "flex", gap: "12px", position: "relative" }}>
            <ActionButton onClick={handleCopySelected} title="Copy selected">
              <Copy size={20} />
            </ActionButton>
            <ActionButton onClick={handleDeleteSelected} title="Delete selected" style={{ color: "#ef4444" }}>
              <Trash2 size={20} />
            </ActionButton>
          </div>
        </Header>
      ) : (
      <Header>
        <HeaderInfo>
          {onBack && (
            <ActionButton onClick={onBack}>
              <ArrowLeft size={20} />
            </ActionButton>
          )}
          <div
            onClick={() => setShowProfileModal(true)} 
            onContextMenu={(e) => {
              e.preventDefault();
              setShowProfileModal(true);
            }}
            style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}
            title="View Profile"
          >
            <Avatar>
              {session.alias_avatar ||
                session.peer_name?.[0]?.toUpperCase() ||
                peerLabelFromEmail?.[0]?.toUpperCase() ||
                "?"}
            </Avatar>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
              <Name>
                {session.alias_name ||
                  session.peer_name ||
                  peerLabelFromEmail ||
                  "Unknown"}
              </Name>
              {session.alias_name && session.alias_name !== (session.peer_name || peerLabelFromEmail || "") && (
                  <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', marginTop: '-2px', marginBottom: '2px' }}>
                    {session.peer_name || peerLabelFromEmail || "User"}
                  </div>
              )}
              {peerOnline ? (
                <Status isOnline={true}>Online</Status>
              ) : (
                <Status>Offline</Status>
              )}
            </div>
          </div>
        </HeaderInfo>
        <div
          style={{ display: "flex", gap: spacing[2], position: "relative" }}
        >
          <ActionButton onClick={() => onStartCall("Audio")} title="Start Call">
            <Phone size={20} />
          </ActionButton>
        </div>
      </Header>
      )}

      <MessagesArea>
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: "100%" }}
          data={messages}
          firstItemIndex={firstItemIndex}
          initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
          followOutput="auto"
          alignToBottom
          atTopStateChange={(atTop: boolean) => {
            if (atTop && onLoadMore) onLoadMore();
          }}
          itemContent={(index: number, msg: ChatMessage) => {
            const showDate =
              index === 0 ||
              new Date(Number(msg.timestamp)).toDateString() !==
                new Date(Number(messages[index - 1].timestamp)).toDateString();

            return (
              <div style={{ paddingBottom: 8 }}>
                {showDate && (
                  <DateSeparator>
                    {new Date(Number(msg.timestamp)).toLocaleDateString()}
                  </DateSeparator>
                )}
                <MessageBubble
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
                  senderAvatar={undefined}
                  selectionMode={selectionMode}
                  isSelected={!!msg.id && selectedMessages.has(msg.id)}
                  onToggleSelect={handleToggleSelect}
                />
              </div>
            );
          }}
        />
      </MessagesArea>

      {session?.isConnected === false ? (
        <InputArea
          style={{
            justifyContent: "center",
            padding: "16px",
            color: "rgba(255,255,255,0.5)",
            fontSize: "14px",
            fontStyle: "italic",
          }}
        >
          You cannot send messages to this user because you are not connected.
        </InputArea>
      ) : (
        <InputArea>
          {replyingTo && (
            <ReplyContainer>
              <span>
                Replying to: {(replyingTo.text || "").substring(0, 50)}...
              </span>
              <CloseReplyButton onClick={() => setReplyingTo(null)}>
                ✕
              </CloseReplyButton>
            </ReplyContainer>
          )}{" "}
          {isAiInstalled &&
            !showAiSuggestions &&
            !inputText.trim() &&
            isAiLoaded && (
              <div style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAiSuggestions(true);
                    generateQuickReplies();
                  }}
                  disabled={isGeneratingReplies}
                  style={{
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 14,
                    color: "#fff",
                    background: "rgba(255,255,255,0.06)",
                    padding: "5px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Lightbulb size={16} />
                  {isGeneratingReplies ? "Catching up..." : "Catch Up"}
                </button>
              </div>
            )}
          {showAiSuggestions &&
            (quickReplies.length > 0 || isGeneratingReplies) &&
            !inputText.trim() && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                {isGeneratingReplies && quickReplies.length === 0 && (
                  <span
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}
                  >
                    Thinking...
                  </span>
                )}
                {quickReplies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => setInputText(reply)}
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
              </div>
            )}
          <InputWrapper>
            <ActionButton onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={20} />
            </ActionButton>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.[0]) onFileSelect(e.target.files[0]);
              }}
            />
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type a message..."
              disabled={isRateLimited}
            />
            <ActionButton onClick={() => {
              setShowEmojiPicker(!showEmojiPicker);
              setShowGifPicker(false);
            }}>
              <Smile size={20} />
            </ActionButton>
            <SendButton
              onClick={handleSend}
              disabled={isRateLimited || !inputText.trim()}
            >
              <Send size={18} />
            </SendButton>
          </InputWrapper>
        </InputArea>
      )}

      {showEmojiPicker && (
        <EmojiPicker
          onEmojiClick={handleEmojiClick}
          onClose={() => setShowEmojiPicker(false)}
        />
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

      <MediaModal
        isOpen={mediaModalOpen}
        onClose={() => setMediaModalOpen(false)}
        media={selectedMedia}
      />

      {showProfileModal && session && (
        <UserProfileModal
          session={session}
          onClose={() => setShowProfileModal(false)}
          onSave={async (aliasName, notes) => {
             await setSessionAlias(session.sid, aliasName, session.alias_avatar || "");
             await updateSessionNotes(session.sid, notes);
             sessionService.updateSessionNotes(session.sid, notes);
             sessionService.emit("session_updated");
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
    </Container>
  );
};
