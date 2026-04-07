import React from "react";
import { ChatWindowDefault } from "./ChatWindowDefault";
import { ChatMessage, SessionData } from "../../types";

interface ChatWindowProps {
  messages: ChatMessage[];
  onSend: (text: string, replyTo?: any) => void;
  activeChat: string | null;
  session?: SessionData;
  onFileSelect: (file: File, caption?: string) => void;
  peerOnline: boolean;
  onStartCall: (mode: "Audio" | "Video") => void;
  onBack?: () => void;
  replyingTo: ChatMessage | null;
  setReplyingTo: (msg: ChatMessage | null) => void;
  onLoadMore: () => void;
  isRateLimited: boolean;
  isPending?: boolean;
  isLoadingHistory?: boolean;
  firstItemIndex?: number;
}

export const ChatWindow: React.FC<ChatWindowProps> = (props) => {
  return <ChatWindowDefault {...props} />;
};
