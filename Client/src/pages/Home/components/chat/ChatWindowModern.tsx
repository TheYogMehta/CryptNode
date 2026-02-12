import React, { useRef, useEffect, useState } from "react";
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

interface ChatWindowProps {
  messages: ChatMessage[];
  onSend: (text: string, replyTo?: any) => void;
  activeChat: string | null;
  session?: SessionData; // Using SessionData instead of 'any'
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
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
              "?"}
          </Avatar>
          <div>
            <Name>{session.alias_name || session.peer_name || "Unknown"}</Name>
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
        {messages.map((msg, index) => {
          const showDate =
            index === 0 ||
            new Date(Number(msg.timestamp)).toDateString() !==
              new Date(Number(messages[index - 1].timestamp)).toDateString();

          return (
            <React.Fragment key={msg.id || index}>
              {showDate && (
                <DateSeparator>
                  {new Date(Number(msg.timestamp)).toLocaleDateString()}
                </DateSeparator>
              )}
              <MessageBubble
                msg={msg}
                onReply={setReplyingTo}
                onMediaClick={(url, type) => window.open(url, "_blank")} // Simple fallback for now
              />
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
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
