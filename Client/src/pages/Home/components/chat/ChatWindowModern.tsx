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
} from "lucide-react";
import { MessageBubble } from "./MessageBubble";
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
import { qwenLocalService } from "../../../../services/ai/qwenLocal.service";
import { useAIStatus } from "../../hooks/useAIStatus";

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
}) => {
  const { messageLayout } = useTheme();
  const { isLoaded: isAiLoaded } = useAIStatus();
  const [inputText, setInputText] = useState("");
  const [showAiSuggestions, setShowAiSuggestions] = useState(true);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);

  const [isGeneratingReplies, setIsGeneratingReplies] = useState(false);

  const generateQuickReplies = async () => {
    if (isGeneratingReplies) return;
    setIsGeneratingReplies(true);
    try {
      const items = await qwenLocalService.quickReplies(messages, inputText, 3);
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

  const handleSend = () => {
    if (inputText.trim()) {
      onSend(inputText, replyingTo || undefined);
      setInputText("");
      setReplyingTo(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!session) return null;
  const peerLabelFromEmail = session.peerEmail
    ? session.peerEmail.split("@")[0]
    : undefined;

  return (
    <Container>
      <Header>
        <HeaderInfo>
          {onBack && (
            <ActionButton onClick={onBack}>
              <ArrowLeft size={20} />
            </ActionButton>
          )}
          <Avatar>
            {session.alias_avatar ||
              session.peer_name?.[0]?.toUpperCase() ||
              peerLabelFromEmail?.[0]?.toUpperCase() ||
              "?"}
          </Avatar>
          <div>
            <Name>
              {session.alias_name ||
                session.peer_name ||
                peerLabelFromEmail ||
                "Unknown"}
            </Name>
            {peerOnline ? (
              <Status>Online</Status>
            ) : (
              <span style={{ fontSize: "12px", color: colors.text.tertiary }}>
                Offline
              </span>
            )}
          </div>
        </HeaderInfo>
        <div style={{ display: "flex", gap: spacing[2] }}>
          <ActionButton onClick={() => onStartCall("Audio")}>
            <Phone size={20} />
          </ActionButton>
          <ActionButton onClick={() => onStartCall("Video")}>
            <Video size={20} />
          </ActionButton>
          <ActionButton>
            <MoreVertical size={20} />
          </ActionButton>
        </div>
      </Header>

      <MessagesArea>
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: "100%" }}
          data={messages}
          totalCount={messages.length}
          initialTopMostItemIndex={messages.length - 1}
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
                  onMediaClick={(url: string, type: "image" | "video") =>
                    window.open(url, "_blank")
                  }
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
                />
              </div>
            );
          }}
        />
      </MessagesArea>

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
        {!showAiSuggestions && !inputText.trim() && isAiLoaded && (
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
              {isGeneratingReplies ? "Generating..." : "AI Suggestions"}
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
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
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
                Hide AI suggestions
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
          <ActionButton>
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
    </Container>
  );
};
