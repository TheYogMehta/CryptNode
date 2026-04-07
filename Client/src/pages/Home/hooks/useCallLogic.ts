import { useState, useEffect, useRef, type RefObject } from "react";
import ChatClient from "../../../services/core/ChatClient";
import { executeDB, queryDB } from "../../../services/storage/sqliteService";
import { ChatMessage } from "../types";

interface UseCallLogicProps {
  activeChatRef: RefObject<string | null>;
  loadSessions: () => void;
  addMessage: (msg: ChatMessage) => void;
}

export const useCallLogic = ({
  activeChatRef,
  loadSessions,
  addMessage,
}: UseCallLogicProps) => {
  const [activeCall, setActiveCall] = useState<any>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  
  const addMessageRef = useRef(addMessage);
  const loadSessionsRef = useRef(loadSessions);
  useEffect(() => { addMessageRef.current = addMessage; }, [addMessage]);
  useEffect(() => { loadSessionsRef.current = loadSessions; }, [loadSessions]);

  useEffect(() => {
    const client = ChatClient;

    const onRemoteStream = (videoEl: HTMLVideoElement) => {
      setActiveCall((prev: any) =>
        prev ? { ...prev, remoteVideo: videoEl } : null,
      );
    };

    const onLocalStream = (stream: MediaStream | null) => {
      setLocalStream(stream);
    };

    const getSessionInfo = async (sid: string) => {
      try {
        const rows = await queryDB(
          "SELECT alias_name, alias_avatar, peer_name, peer_avatar, peer_email FROM sessions WHERE sid = ?",
          [sid],
        );
        if (rows.length > 0) {
          const r = rows[0];
          const peerLabelFromEmail =
            typeof r.peer_email === "string" && r.peer_email.includes("@")
              ? r.peer_email.split("@")[0]
              : r.peer_email;
          return {
            peerName: r.alias_name || r.peer_name || peerLabelFromEmail || "Unknown",
            peerAvatar: r.alias_avatar || r.peer_avatar,
          };
        }
      } catch (e) {
        console.error("Failed to load session info for call", e);
      }
      return { peerName: "Unknown", peerAvatar: null };
    };

    const onCallIncoming = async (call: any) => {
      const info = await getSessionInfo(call.sid);
      setActiveCall({ ...call, ...info, status: "ringing" });
    };

    const onCallOutgoing = async (call: any) => {
      const info = await getSessionInfo(call.sid);
      setActiveCall({ ...call, ...info, status: "outgoing" });
    };

    const onCallAccepted = (payload: { sid?: string } = {}) =>
      setActiveCall((prev: any) => {
        if (!prev) return prev;
        if (!payload.sid || prev.sid === payload.sid) {
          if (prev.status === "connected") return prev;
          return { ...prev, status: "connecting" };
        }
        return prev;
      });

    const onCallStarted = (payload: { sid?: string } = {}) =>
      setActiveCall((prev: any) => {
        if (!prev) return prev;
        if (!payload.sid || prev.sid === payload.sid) {
          return { ...prev, status: "connected" };
        }
        return prev;
      });

    const onIceStatus = (status: any) =>
      setActiveCall((prev: any) =>
        prev ? { ...prev, iceStatus: status } : null,
      );

    const onPeerMicStatus = ({ sid, muted }: { sid: string; muted: boolean }) =>
      setActiveCall((prev: any) =>
        prev && prev.sid === sid ? { ...prev, peerMicMuted: muted } : prev,
      );

    const onCallModeChanged = ({ sid, mode }: { sid: string; mode: any }) => {
      setActiveCall((prev: any) =>
        prev && prev.sid === sid ? { ...prev, type: mode } : prev,
      );
    };

    const onCallEnded = async (data: any) => {
      setActiveCall(null);
      const sid = typeof data === "string" ? data : data.sid;
      const duration = typeof data === "object" ? data.duration : 0;
      const connected = typeof data === "object" ? !!data.connected : false;
      const reason = typeof data === "object" ? data.reason : null;
      const callId = typeof data === "object" ? data.callId : null;

      let text = "";
      if (reason === "picked_up_elsewhere") {
        text = "Picked up on another device";
      } else if (connected) {
        const min = Math.floor(duration / 60000);
        const sec = Math.floor((duration % 60000) / 1000);
        const textDuration = `${min}m ${sec}s`;
        text = `Call ended • ${textDuration}`;
      } else {
        text = "Missed Call";
      }

      // If hideLog is true, we still might want to show "Picked up elsewhere" locally
      if (typeof data === "object" && data.hideLog && reason !== "picked_up_elsewhere") return;

      // Use a deterministic ID based on callId so sync replaces placeholders
      const id = callId ? `call_log_${callId}` : crypto.randomUUID();
      const timestamp = Date.now();

      try {
        await executeDB(
          "INSERT OR REPLACE INTO messages (id, sid, sender, text, type, timestamp, status) VALUES (?, ?, 'system', ?, 'system', ?, 1)",
          [id, sid, text, timestamp],
        );

        if (activeChatRef.current === sid) {
          addMessageRef.current({
            id,
            sid,
            text,
            sender: "system",
            type: "system",
            timestamp,
            status: 1,
          });
        }
        loadSessionsRef.current();
      } catch (e) {
        console.error("Failed to log call end:", e);
      }
    };

    client.on("call_incoming", onCallIncoming);
    client.on("call_outgoing", onCallOutgoing);
    client.on("call_accepted", onCallAccepted);
    client.on("call_started", onCallStarted);
    client.on("ice_status", onIceStatus);
    client.on("peer_mic_status", onPeerMicStatus);
    client.on("call_mode_changed", onCallModeChanged);
    client.on("call_ended", onCallEnded);

    client.on("local_stream_ready", onLocalStream);
    client.on("remote_stream_ready", onRemoteStream);

    return () => {
      client.off("call_incoming", onCallIncoming);
      client.off("call_outgoing", onCallOutgoing);
      client.off("call_accepted", onCallAccepted);
      client.off("call_started", onCallStarted);
      client.off("ice_status", onIceStatus);
      client.off("peer_mic_status", onPeerMicStatus);
      client.off("call_mode_changed", onCallModeChanged);
      client.off("call_ended", onCallEnded);
      client.off("local_stream_ready", onLocalStream);
      client.off("remote_stream_ready", onRemoteStream);
    };
  }, []);

  return {
    state: {
      activeCall,
      localStream,
    },
    actions: {
      startCall: (sid: string, type: "Audio" | "Video") =>
        ChatClient.startCall(sid, type),
      switchStream: (mode: "Audio" | "Video") =>
        activeCall ? ChatClient.switchStream(activeCall.sid, mode) : undefined,
      acceptCall: () =>
        activeCall ? ChatClient.acceptCall(activeCall.sid) : undefined,
      rejectCall: () => {
        if (activeCall) ChatClient.endCall(activeCall.sid);
      },
      endCall: () => {
        if (activeCall) ChatClient.endCall(activeCall.sid);
        else ChatClient.endCall();
      },
    },
  };
};
