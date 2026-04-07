import { useState, useEffect, useRef, useCallback } from "react";
import debounce from "lodash.debounce";
import toast from "react-hot-toast";
import ChatClient from "../../../services/core/ChatClient";
import { queryDB, executeDB } from "../../../services/storage/sqliteService";
import { SessionData, InboundReq } from "../types";

type LinkedDeviceEntry = {
  publicKey?: string;
  lastActive?: string;
  status?: string;
};

export const useSessionLogic = (shouldInit: boolean = true) => {
  const [view, setView] = useState<"chat" | "add" | "welcome">("welcome");
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [linkedDeviceCount, setLinkedDeviceCount] = useState(0);
  const [onlineLinkedDeviceCount, setOnlineLinkedDeviceCount] = useState(0);
  const [isJoining, setIsJoining] = useState(false);
  const [targetEmail, setTargetEmail] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [inboundReq, setInboundReq] = useState<InboundReq | null>(null);
  const [error] = useState<string | null>(null);
  const [peerOnline, setPeerOnline] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(
    ChatClient.userEmail,
  );
  const [isLoading, setIsLoading] = useState(true);

  const activeChatRef = useRef<string | null>(null);
  activeChatRef.current = activeChat;

  const hasNotifiedPending = useRef(false);
  const hasRequestedPending = useRef(false);

  const loadSessions = useCallback(
    debounce(async () => {
      if (!shouldInit) return;
      if (!ChatClient.userEmail) return;

      const rows = await queryDB(`
      SELECT s.sid, s.alias_name, s.alias_avatar, s.peer_name, s.peer_avatar, s.peer_email, s.notes, s.deleted_at,
             (SELECT text FROM messages WHERE sid = s.sid ORDER BY timestamp DESC LIMIT 1) as lastMsg,
             (SELECT type FROM messages WHERE sid = s.sid ORDER BY timestamp DESC LIMIT 1) as lastMsgType,
             (SELECT timestamp FROM messages WHERE sid = s.sid ORDER BY timestamp DESC LIMIT 1) as lastTs,
             (SELECT COUNT(*) FROM messages WHERE sid = s.sid AND is_read = 0 AND sender != 'me') as unread
      FROM sessions s
      ORDER BY lastTs DESC
    `);

      let userHash = "";
      try {
        const buf = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(ChatClient.userEmail.trim().toLowerCase()),
        );
        userHash = Array.from(new Uint8Array(buf))
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
      } catch (e) {
        console.warn("Failed to compute user hash for session logic", e);
      }

      const formatted: SessionData[] = rows
        .map((r: any) => {
          const peerHash = ChatClient.sessions[r.sid]?.peerEmailHash || "";
          const isConnected = ChatClient.sessions[r.sid]?.isConnected ?? false;
          const isDeleted = Boolean(r.deleted_at && Number(r.deleted_at) > 0);
          const isOwnDevice = Boolean(
            userHash &&
              peerHash &&
              userHash.toLowerCase() === peerHash.toLowerCase(),
          );

          return {
            sid: r.sid,
            alias_name: r.alias_name,
            alias_avatar: r.alias_avatar,
            peer_name: r.peer_name,
            peer_avatar: r.peer_avatar,
            peerEmail: r.peer_email,
            peerEmailHash: peerHash,
            notes: r.notes || undefined,
            isOwnDevice,
            lastMsg: r.lastMsg || "",
            lastMsgType: r.lastMsgType || "text",
            lastTs: r.lastTs || 0,
            unread: r.sid === activeChatRef.current ? 0 : r.unread || 0,
            online: ChatClient.sessions[r.sid]?.online || false,
            isConnected,
            deletedAt: isDeleted ? Number(r.deleted_at) : 0,
          };
        })
        .filter(
          (s: SessionData) =>
            !s.isOwnDevice && (!s.deletedAt || s.isConnected !== false),
        );
      setSessions(formatted);
    }, 500),
    [shouldInit],
  );

  useEffect(() => {
    if (activeChat) {
      executeDB(
        "UPDATE messages SET is_read = 1 WHERE sid = ? AND sender != 'me'",
        [activeChat],
      ).then(() => loadSessions());
      if (ChatClient.sessions[activeChat]) {
        setPeerOnline(ChatClient.sessions[activeChat].online);
      }
    } else {
      setPeerOnline(false);
    }
  }, [activeChat, loadSessions]);

  useEffect(() => {
    if (!shouldInit || !userEmail) {
      setLinkedDeviceCount(0);
      setOnlineLinkedDeviceCount(0);
      return;
    }

    const requestLinkedDevices = () => {
      ChatClient.send({ t: "GET_DEVICES" });
    };

    const onDeviceList = (data: { devices?: LinkedDeviceEntry[] }) => {
      const devices = Array.isArray(data?.devices) ? data.devices : [];
      setLinkedDeviceCount(devices.length);
      setOnlineLinkedDeviceCount(
        devices.filter((device) => device.status?.toLowerCase() === "online")
          .length,
      );
    };

    ChatClient.on("device_list", onDeviceList);
    requestLinkedDevices();

    const intervalId = window.setInterval(requestLinkedDevices, 30_000);

    return () => {
      window.clearInterval(intervalId);
      ChatClient.off("device_list", onDeviceList);
    };
  }, [shouldInit, userEmail]);

  useEffect(() => {
    if (!shouldInit) {
      setIsLoading(false);
      return;
    }
    if (ChatClient.userEmail) {
      setUserEmail(ChatClient.userEmail);
      setIsLoading(false);
    }

    const client = ChatClient;

    client
      .init()
      .then(() => {
        if (!client.hasToken()) {
          setIsLoading(false);
        } else {
          setTimeout(() => {
            if (!client.userEmail) setIsLoading(false);
          }, 5000);
        }
      })
      .catch((err) => {
        console.error("Failed to init ChatClient", err);
        setIsLoading(false);
      });

    const onSessionUpdate = () => {
      if (activeChatRef.current) {
        executeDB(
          "UPDATE messages SET is_read = 1 WHERE sid = ? AND sender != 'me'",
          [activeChatRef.current],
        ).catch((e) => console.warn("Failed to mark active chat as read", e));
      }
      loadSessions();
      if (activeChatRef.current && client.sessions[activeChatRef.current]) {
        setPeerOnline(client.sessions[activeChatRef.current].online);
      }
    };

    const onWaitingForAccept = () => {
      setIsJoining(false);
      setIsWaiting(true);
    };

    const onJoinedSuccess = () => {
      setIsWaiting(false);
      setIsJoining(false);
      loadSessions();
    };

    const onSessionCreated = () => {
      loadSessions();
    };

    const onInboundRequest = (req: InboundReq) => {};

    const onAuthSuccess = (email: string) => {
      setUserEmail(email);
      setIsLoading(false);
      loadSessions();
    };

    const onAuthError = () => {
      setIsJoining(false);
      setUserEmail(null);
      setView("welcome");
      setActiveChat(null);
      setIsSidebarOpen(false);
    };

    const onDeviceNuclearSuccess = () => {
      toast.success("Nuclear reset successful. You are now the Master Device.");
      setTimeout(() => {
        window.location.reload();
      }, 500);
    };

    const onPendingRequestsList = (data: any[]) => {
      if (
        !hasNotifiedPending.current &&
        Array.isArray(data) &&
        data.length > 0
      ) {
        hasNotifiedPending.current = true;
        toast.success(
          `You have ${data.length} pending friend ${
            data.length === 1 ? "request" : "requests"
          }. Check the Add Friend page.`,
        );
      }
    };

    const onNotification = (notif: {
      type: "info" | "success" | "warning" | "error";
      message: string;
    }) => {
      setIsJoining(false);
      if (notif.type === "error") {
        toast.error(notif.message);
      } else if (notif.type === "success") {
        toast.success(notif.message);
      } else {
        toast(notif.message);
      }
    };

    const onRequestSent = () => {
      setIsJoining(false);
      setTargetEmail("");
    };

    const onRequestFailed = () => {
      setIsJoining(false);
    };

    const onChatDeleted = (data: { sid: string }) => {
      if (activeChatRef.current === data.sid) {
        setView("welcome");
        setActiveChat(null);
        setIsSidebarOpen(false);
      }
      loadSessions();
    };

    client.on("session_updated", onSessionUpdate);
    client.on("waiting_for_accept", onWaitingForAccept);
    client.on("joined_success", onJoinedSuccess);
    client.on("session_created", onSessionCreated);
    client.on("inbound_request", onInboundRequest);
    client.on("auth_success", onAuthSuccess);
    client.on("auth_error", onAuthError);
    client.on("device_nuclear_success", onDeviceNuclearSuccess);
    client.on("notification", onNotification);
    client.on("request_sent", onRequestSent);
    client.on("request_failed", onRequestFailed);
    client.on("pending_requests_list", onPendingRequestsList);
    client.on("chat_deleted", onChatDeleted);

    return () => {
      client.off("session_updated", onSessionUpdate);
      client.off("waiting_for_accept", onWaitingForAccept);
      client.off("joined_success", onJoinedSuccess);
      client.off("session_created", onSessionCreated);
      client.off("inbound_request", onInboundRequest);
      client.off("auth_success", onAuthSuccess);
      client.off("auth_error", onAuthError);
      client.off("device_nuclear_success", onDeviceNuclearSuccess);
      client.off("notification", onNotification);
      client.off("request_sent", onRequestSent);
      client.off("request_failed", onRequestFailed);
      client.off("pending_requests_list", onPendingRequestsList);
      client.off("chat_deleted", onChatDeleted);
    };
  }, [loadSessions]);

  const handleConnect = async () => {
    if (!targetEmail) return;

    const fullEmail = `${targetEmail.trim()}@gmail.com`.toLowerCase();

    // Check basic email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fullEmail)) {
      toast.error("Please enter a valid username.");
      return;
    }

    // Check against own email
    if (fullEmail === userEmail?.trim().toLowerCase()) {
      toast.error("You cannot send a friend request to yourself.");
      return;
    }

    setIsJoining(true);
    try {
      await ChatClient.connectToPeer(fullEmail);
    } catch (e) {
      console.error(e);
      setIsJoining(false);
      toast.error("Failed to send request");
    }
  };

  return {
    state: {
      view,
      activeChat,
      sessions,
      linkedDeviceCount,
      onlineLinkedDeviceCount,
      isJoining,
      targetEmail,
      isWaiting,
      inboundReq,
      error,
      peerOnline,
      isSidebarOpen,
      userEmail,
      isLoading,
    },
    refs: {
      activeChatRef,
    },
    actions: {
      setView,
      setActiveChat,
      setTargetEmail,
      setIsSidebarOpen,
      setInboundReq,
      setIsWaiting,
      handleConnect,
      loadSessions,
      login: (token: string) => ChatClient.login(token),
    },
  };
};
