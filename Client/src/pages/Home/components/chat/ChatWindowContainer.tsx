import React from "react";
import { ChatWindowDefault } from "./ChatWindowDefault";
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
  isPending?: boolean;
}

export const ChatWindow: React.FC<ChatWindowProps> = (props) => {
  return <ChatWindowDefault {...props} />;
};
