import { useState, useEffect, useRef } from "react";
import ChatClient from "../../services/ChatClient.ts";
import { queryDB } from "../../services/sqliteService";
import { ChatMessage, InboundReq } from "./types";

export const useChatLogic = () => {
  const [view, setView] = useState<"chat" | "add">("chat");
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [inboundReq, setInboundReq] = useState<InboundReq | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [peerOnline, setPeerOnline] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const activeChatRef = useRef<string | null>(null);
  activeChatRef.current = activeChat;

  useEffect(() => {
    const startup = async () => {
      await ChatClient.init();
      setSessions(Object.keys(ChatClient.sessions));
    };
    startup();

    const onSessionUpdate = () => setSessions(Object.keys(ChatClient.sessions));
    const onInviteReady = (code: string) => {
      setInviteCode(code);
      setIsGenerating(false);
    };
    const onInboundReq = (req: InboundReq) => setInboundReq(req);
    const onWaiting = (waiting: boolean) => {
      setIsWaiting(waiting);
      if (!waiting) setIsJoining(false);
    };
    const onJoined = (sid: string) => {
      setActiveChat(sid);
      setView("chat");
      setIsSidebarOpen(false);
      setIsJoining(false);
    };

    const onError = (msg: string) => {
      setError(msg);
      setIsGenerating(false);
      setIsJoining(false);
      setTimeout(() => setError(null), 4000);
    };

    const onMessage = (msg: ChatMessage) => {
      if (msg.sid === activeChatRef.current) {
        setMessages((prev) => [
          ...prev.map((m) =>
            m.sender === "me" && m.status === 2 ? { ...m, status: 3 as 3 } : m
          ),
          msg,
        ]);
      }
    };

    const onDelivered = (sid: string) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.sender === "me" && m.sid === sid && m.status === 1
            ? { ...m, status: 2 }
            : m
        )
      );
    const onRead = (sid: string) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.sender === "me" && m.sid === sid ? { ...m, status: 3 } : m
        )
      );

    ChatClient.on("session_updated", onSessionUpdate);
    ChatClient.on("invite_ready", onInviteReady);
    ChatClient.on("inbound_request", onInboundReq);
    ChatClient.on("waiting_for_accept", onWaiting);
    ChatClient.on("joined_success", onJoined);
    ChatClient.on("error", onError);
    ChatClient.on("message", onMessage);
    ChatClient.on("message_delivered", onDelivered);
    ChatClient.on("message_read", onRead);

    return () => {
      ChatClient.off("session_updated", onSessionUpdate);
      ChatClient.off("invite_ready", onInviteReady);
      ChatClient.off("inbound_request", onInboundReq);
      ChatClient.off("waiting_for_accept", onWaiting);
      ChatClient.off("joined_success", onJoined);
      ChatClient.off("error", onError);
      ChatClient.off("message", onMessage);
    };
  }, []);

  useEffect(() => {
    if (activeChat) {
      setPeerOnline(ChatClient.sessions[activeChat]?.online ?? false);
      queryDB("SELECT * FROM messages WHERE sid = ?", [activeChat]).then(
        (rows: any) => setMessages(rows)
      );
    } else {
      setPeerOnline(false);
    }
  }, [activeChat]);

  const handleSend = async () => {
    if (!input.trim() || !activeChat) return;
    const currentInput = input;
    setInput("");
    await ChatClient.sendMessage(activeChat, currentInput);
    setMessages((prev) => [
      ...prev,
      {
        sid: activeChat,
        text: currentInput,
        sender: "me",
        status: ChatClient.sessions[activeChat]?.online ? 2 : 1,
      },
    ]);
  };

  return {
    state: {
      view,
      activeChat,
      messages,
      sessions,
      input,
      inviteCode,
      isGenerating,
      isJoining,
      joinCode,
      isWaiting,
      inboundReq,
      error,
      peerOnline,
      isSidebarOpen,
    },
    actions: {
      setView,
      setActiveChat,
      setInput,
      setJoinCode,
      setIsSidebarOpen,
      setInboundReq,
      setIsWaiting,
      setIsGenerating,
      handleSend,
      handleConnect: () => ChatClient.joinByCode(joinCode),
      resetToHome: () => {
        setActiveChat(null);
        setView("chat");
        setIsSidebarOpen(false);
      },
    },
  };
};
