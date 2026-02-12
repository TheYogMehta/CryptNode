import React from "react";
import { useTheme } from "../../../../theme/ThemeContext";
import { ChatWindowDefault } from "./ChatWindowDefault";
import { ChatWindowModern } from "./ChatWindowModern";
import { ChatMessage, SessionData } from "../../types";

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

export const ChatWindow: React.FC<ChatWindowProps> = (props) => {
  const { designMode } = useTheme();

  if (designMode === "modern") {
    return <ChatWindowModern {...props} />;
  }

  return <ChatWindowDefault {...props} />;
};
