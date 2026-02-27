import { useState, useEffect, useRef, useCallback } from "react";
import debounce from "lodash.debounce";
import toast from "react-hot-toast";
import ChatClient from "../../../services/core/ChatClient";
import { queryDB, executeDB } from "../../../services/storage/sqliteService";
import { SessionData, InboundReq } from "../types";

export const useSessionLogic = (shouldInit: boolean = true) => {
  const [view, setView] = useState<"chat" | "add" | "welcome">("welcome");
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
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
  const [pendingMasterKey, setPendingMasterKey] = useState<string | null>(null);
  const [linkRequests, setLinkRequests] = useState<any[]>([]);

  const activeChatRef = useRef<string | null>(null);
  activeChatRef.current = activeChat;

  const hasNotifiedPending = useRef(false);

  const loadSessions = useCallback(
    debounce(async () => {
      if (!shouldInit) return;
      if (!ChatClient.userEmail) return;

      const rows = await queryDB(`
      SELECT s.sid, s.alias_name, s.alias_avatar, s.peer_name, s.peer_avatar, s.peer_email,
             (SELECT text FROM messages WHERE sid = s.sid ORDER BY timestamp DESC LIMIT 1) as lastMsg,
             (SELECT type FROM messages WHERE sid = s.sid ORDER BY timestamp DESC LIMIT 1) as lastMsgType,
             (SELECT timestamp FROM messages WHERE sid = s.sid ORDER BY timestamp DESC LIMIT 1) as lastTs,
             (SELECT COUNT(*) FROM messages WHERE sid = s.sid AND is_read = 0 AND sender != 'me') as unread
      FROM sessions s
      ORDER BY lastTs DESC
    `);

      const formatted: SessionData[] = rows.map((r: any) => ({
        sid: r.sid,
        alias_name: r.alias_name,
        alias_avatar: r.alias_avatar,
        peer_name: r.peer_name,
        peer_avatar: r.peer_avatar,
        peerEmail: r.peer_email,
        lastMsg: r.lastMsg || "",
        lastMsgType: r.lastMsgType || "text",
        lastTs: r.lastTs || 0,
        unread: r.sid === activeChatRef.current ? 0 : r.unread || 0,
        online: ChatClient.sessions[r.sid]?.online || false,
        isConnected: ChatClient.sessions[r.sid]?.isConnected ?? false,
      }));
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
          client.getPendingRequests();
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

    const onInboundRequest = (req: InboundReq) => {
      // Just refresh the pending list
      ChatClient.getPendingRequests();
    };

    const onAuthSuccess = (email: string) => {
      setUserEmail(email);
      setPendingMasterKey(null);
      setIsLoading(false);
      loadSessions();
    };

    const onAuthError = () => {
      setIsJoining(false);
      setUserEmail(null);
      setPendingMasterKey(null);
      window.location.href = "/";
    };

    const onAuthPending = (masterKey: string) => {
      setPendingMasterKey(masterKey);
      setIsLoading(false);
    };

    const onDeviceLinkRequest = (data: any) => {
      setLinkRequests((prev) => [...prev, data]);
    };

    const onDeviceLinkAccepted = () => {
      window.location.reload();
    };

    const onDeviceLinkRejected = () => {
      toast.error("Master device rejected your connection request.");
      window.location.href = "/";
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
      setIsJoining(false); // Clear wait states on any notification toast (e.g., 'User not found' or 'Blocked')
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

    client.on("session_updated", onSessionUpdate);
    client.on("waiting_for_accept", onWaitingForAccept);
    client.on("joined_success", onJoinedSuccess);
    client.on("session_created", onSessionCreated);
    client.on("inbound_request", onInboundRequest);
    client.on("auth_success", onAuthSuccess);
    client.on("auth_error", onAuthError);
    client.on("auth_pending", onAuthPending);
    client.on("device_link_request", onDeviceLinkRequest);
    client.on("device_link_accepted", onDeviceLinkAccepted);
    client.on("device_link_rejected", onDeviceLinkRejected);
    client.on("device_nuclear_success", onDeviceNuclearSuccess);
    client.on("notification", onNotification);
    client.on("request_sent", onRequestSent);
    client.on("request_failed", onRequestFailed);
    client.on("pending_requests_list", onPendingRequestsList);

    return () => {
      client.off("session_updated", onSessionUpdate);
      client.off("waiting_for_accept", onWaitingForAccept);
      client.off("joined_success", onJoinedSuccess);
      client.off("session_created", onSessionCreated);
      client.off("inbound_request", onInboundRequest);
      client.off("auth_success", onAuthSuccess);
      client.off("auth_error", onAuthError);
      client.off("auth_pending", onAuthPending);
      client.off("device_link_request", onDeviceLinkRequest);
      client.off("device_link_accepted", onDeviceLinkAccepted);
      client.off("device_link_rejected", onDeviceLinkRejected);
      client.off("device_nuclear_success", onDeviceNuclearSuccess);
      client.off("notification", onNotification);
      client.off("request_sent", onRequestSent);
      client.off("request_failed", onRequestFailed);
      client.off("pending_requests_list", onPendingRequestsList);
    };
  }, [loadSessions]);

  const handleConnect = async () => {
    if (!targetEmail) return;

    // Check basic email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetEmail.trim())) {
      toast.error("Please enter a valid email address.");
      return;
    }

    // Check against own email
    if (targetEmail.trim().toLowerCase() === userEmail?.trim().toLowerCase()) {
      toast.error("You cannot send a friend request to yourself.");
      return;
    }

    setIsJoining(true);
    try {
      await ChatClient.connectToPeer(targetEmail);
    } catch (e) {
      console.error(e);
      setIsJoining(false);
      toast.error("Failed to send request");
    }
  };

  const handleSetAlias = async (sid: string, name: string) => {
    try {
      await executeDB("UPDATE sessions SET alias_name = ? WHERE sid = ?", [
        name,
        sid,
      ]);
      loadSessions();
    } catch (e) {
      console.error("Failed to set alias", e);
    }
  };

  return {
    state: {
      view,
      activeChat,
      sessions,
      isJoining,
      targetEmail,
      isWaiting,
      inboundReq,
      error,
      peerOnline,
      isSidebarOpen,
      userEmail,
      isLoading,
      pendingMasterKey,
      linkRequests,
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
      handleSetAlias,
      loadSessions,
      login: (token: string) => ChatClient.login(token),
      setLinkRequests,
    },
  };
};
