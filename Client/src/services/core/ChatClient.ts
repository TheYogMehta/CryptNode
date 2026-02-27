import { EventEmitter } from "events";
import { executeDB, queryDB, isUserBlocked } from "../storage/sqliteService";
import socket from "./SocketManager";
import { MessageQueue } from "../../utils/MessageQueue";
import { sha256 } from "../../utils/crypto";

interface ServerFrame {
  t: string;
  sid: string;
  data: any;
  sh?: string;
  c?: boolean;
  p?: number;
}

import { AuthService } from "../auth/AuthService";
import { SessionService } from "../messaging/SessionService";
import { FileTransferService } from "../media/FileTransferService";
import { CallService } from "../media/CallService";
import { MessageService } from "../messaging/MessageService";
import { IChatClient } from "./interfaces";

export class ChatClient extends EventEmitter implements IChatClient {
  private static instance: ChatClient;

  public authService: AuthService;
  public sessionService: SessionService;
  public messageService: MessageService;
  public fileTransfer: FileTransferService;
  public callService: CallService;

  private messageQueue: MessageQueue;
  private hasNotifiedPendingRequests: boolean = false;

  constructor() {
    super();
    this.authService = new AuthService();
    this.sessionService = new SessionService(this.authService);

    this.fileTransfer = new FileTransferService(this);
    this.callService = new CallService(this);
    this.messageService = new MessageService(this);

    this.messageQueue = new MessageQueue(async (item) => {
      if (item.type === "HANDLE_MSG") {
        await this.messageService.handleMsg(
          item.payload.sid,
          item.payload.payload,
          item.payload.senderHash,
          item.priority,
        );
      }
    });

    this.authService.on("auth_success", (email) =>
      this.emit("auth_success", email),
    );
    this.authService.on("auth_error", () => this.emit("auth_error"));

    this.sessionService.on("session_updated", () => {
      console.log("[ChatClient] session_updated event received from Service");
      this.emit("session_updated");
    });
    this.sessionService.on("session_created", (sid) => {
      console.log(
        "[ChatClient] session_created event received from Service:",
        sid,
      );
      this.broadcastProfileUpdate().catch((e) =>
        console.warn(
          "[ChatClient] Failed to broadcast profile after session creation",
          e,
        ),
      );
      this.emit("session_created", sid);
    });

    socket.on("message", (frame) => {
      this.handleFrame(frame);
    });

    socket.on("WS_CONNECTED", async () => {
      console.log("[ChatClient] WS Connected");
      if (this.authService.hasToken()) {
        try {
          await this.sessionService.loadSessions();
          await this.sessionService.loadSessions();
        } catch (e) {
          console.error("[ChatClient] Failed to load/reattach sessions", e);
        }
        this.emit("session_updated");
      }
    });

    socket.on("WS_DISCONNECTED", () => {
      console.log("[ChatClient] WS Disconnected");
    });

    socket.on("error", (err) => {
      console.error("[ChatClient] Socket Error:", err);
      this.emit("notification", {
        type: "error",
        message: "Connection failed. Retrying...",
      });
    });
  }

  static getInstance() {
    if (!ChatClient.instance) ChatClient.instance = new ChatClient();
    return ChatClient.instance;
  }

  public send(frame: {
    t: string;
    sid?: string;
    data?: any;
    c?: boolean;
    p?: number;
  }) {
    socket.send(frame);
  }

  public get sessions() {
    return this.sessionService.sessions;
  }

  public get userEmail() {
    return this.authService.userEmail;
  }

  public hasToken(): boolean {
    return this.authService.hasToken();
  }

  async init() {
    await this.sessionService.loadSessions();
    this.emit("session_updated");
  }

  public async syncPendingMessages() {
    return this.messageService.syncPendingMessages();
  }

  private normalizeEmail(email?: string | null): string {
    return (email || "").trim().toLowerCase();
  }

  private async isValidMessageSenderHash(
    sid: string,
    senderHash?: string,
  ): Promise<boolean> {
    if (!senderHash) return false;
    const myEmail = this.normalizeEmail(this.authService.userEmail);
    if (myEmail) {
      const myEmailHash = await sha256(myEmail);
      if (myEmailHash.toLowerCase() === senderHash.toLowerCase()) return true;
    }

    const session = this.sessionService.sessions[sid];
    if (!session) return false;

    if (session.peerEmailHash) {
      return session.peerEmailHash.toLowerCase() === senderHash.toLowerCase();
    }

    const normalizedPeerEmail = this.normalizeEmail(session.peerEmail);
    if (normalizedPeerEmail) {
      const computed = await sha256(normalizedPeerEmail);
      session.peerEmailHash = computed;
      return computed.toLowerCase() === senderHash.toLowerCase();
    }

    const rows = await queryDB(
      "SELECT peer_hash, peer_email FROM sessions WHERE sid = ? LIMIT 1",
      [sid],
    );
    const row = rows?.[0];
    if (row?.peer_hash) {
      session.peerEmailHash = String(row.peer_hash);
      return session.peerEmailHash.toLowerCase() === senderHash.toLowerCase();
    }
    if (row?.peer_email) {
      const email = this.normalizeEmail(row.peer_email);
      const computed = await sha256(email);
      session.peerEmail = email;
      session.peerEmailHash = computed;
      await executeDB("UPDATE sessions SET peer_hash = ? WHERE sid = ?", [
        computed,
        sid,
      ]);
      return computed.toLowerCase() === senderHash.toLowerCase();
    }

    return false;
  }

  private async handleFrame(frame: ServerFrame) {
    const { t, sid, data, sh } = frame;
    switch (t) {
      case "ERROR":
        console.error(
          "[Client] Server Error:",
          data,
          typeof data === "object" ? JSON.stringify(data) : "",
        );
        if (data.message && data.message.includes("Rate limit")) {
          this.emit("rate_limit_exceeded");
          return;
        }
        if (
          data.message === "Auth failed" ||
          data.message === "Authentication required" ||
          data.message === "Already logged in on another device"
        ) {
          await this.authService.logout();
        }
        if (
          data.message?.includes("not found") ||
          data.message?.includes("blocked")
        ) {
          this.emit("request_failed");
        }
        this.emit("notification", { type: "error", message: data.message });
        break;
      case "INVITE_CODE":
        this.emit("invite_ready", data.code);
        break;
      case "AUTH_SUCCESS":
        await this.authService.handleAuthSuccess(data);
        {
          await this.sessionService.loadSessions();
          await this.sessionService.loadSessions();
        }
        this.emit("auth_success", this.authService.userEmail);
        break;
      case "AUTH_PENDING":
        await this.authService.handleAuthPending({
          email: data.email,
          token: data.token,
        });
        this.emit("auth_pending", data.masterPubKey);
        break;
      case "DEVICE_LINK_REQUEST":
        this.emit("device_link_request", data);
        break;
      case "DEVICE_LINK_ACCEPTED":
        this.emit("device_link_accepted");
        break;
      case "DEVICE_LINK_REJECTED":
        this.emit("device_link_rejected");
        await this.authService.logout();
        break;
      case "DEVICE_NUCLEAR_SUCCESS":
        this.emit("device_nuclear_success");
        break;
      case "DEVICE_LIST":
        this.emit("device_list", data);
        break;
      case "PUBLIC_KEY":
        if (data.publicKey && data.targetEmail) {
          try {
            await this.sessionService.sendFriendRequest(
              data.targetEmail,
              data.publicKey,
            );
          } catch (err) {
            console.error("Failed to send encrypted friend request", err);
            this.emit("request_failed");
            this.emit("notification", {
              type: "error",
              message: "Failed to securely encrypt request.",
            });
          }
        } else {
          this.emit("request_failed");
          this.emit("notification", {
            type: "warning",
            message:
              "This user hasn't set up their profile or encryption keys yet.",
          });
        }
        break;
      case "FRIEND_REQUEST":
        try {
          const req = await this.sessionService.decryptFriendRequest(
            data.encryptedPacket,
            data.publicKey,
          );
          if (req) {
            const isBlocked = await isUserBlocked(
              this.normalizeEmail(req.email),
            );
            if (isBlocked) {
              console.log(
                "[ChatClient] Dropping FRIEND_REQUEST from blocked user:",
                req.email,
              );
              return;
            }

            const myEmail = this.normalizeEmail(this.authService.userEmail);
            const otherEmail = this.normalizeEmail(req.email);
            const [u1, u2] = [myEmail, otherEmail].sort();
            const computedSid = await sha256(u1 + ":" + u2);

            this.emit("inbound_request", {
              ...req,
              publicKey: data.publicKey,
              sid: computedSid,
            });
            this.emit("notification", {
              type: "success",
              message: `New friend request from ${req.name || "Unknown"}`,
            });
          }
        } catch (e) {
          console.error("Failed to decrypt friend request", e);
        }
        break;
      case "FRIEND_ACCEPT":
        await this.sessionService.handleFriendAccept(data);
        this.emit("session_updated");
        break;
      case "FRIEND_DENY":
        await this.sessionService.handleFriendDeny(data);
        this.emit("session_updated");
        break;
      case "USER_BLOCKED_EVENT":
        this.emit("notification", {
          type: "warning",
          message: "A user has blocked you.",
        });
        break;
      case "PROFILE_UPDATE":
        await this.sessionService.handleProfileUpdate(sid, data);
        this.emit("session_updated");
        break;
      case "RTC_OFFER":
      case "RTC_ANSWER":
      case "RTC_ICE":
      case "MSG":
        if (t === "MSG" && !(await this.isValidMessageSenderHash(sid, sh))) {
          console.warn(
            `[ChatClient] Dropped MSG for ${sid}: sender hash mismatch`,
          );
          this.emit("notification", {
            type: "warning",
            message: "Dropped an untrusted message.",
          });
          return;
        }

        {
          const session = this.sessionService.getSession(sid);
          if (session && session.peerEmail) {
            const isBlocked = await isUserBlocked(
              this.normalizeEmail(session.peerEmail),
            );
            if (isBlocked) {
              console.log(
                `[ChatClient] Dropping ${t} frame from blocked user:`,
                session.peerEmail,
              );
              return;
            }
          }
        }

        let myPayload: string | undefined;
        if (data.payloads) {
          const myPubKey = await this.getPublicKeyString();
          myPayload = data.payloads[myPubKey];
          if (!myPayload) {
            console.warn(
              `[ChatClient] Dropped MSG for ${sid}: missing payload for our pubkey.`,
            );
            return;
          }
        } else if (data.payload) {
          myPayload = data.payload;
        }

        if (!myPayload) return;

        this.messageQueue.enqueue(
          "HANDLE_MSG",
          { sid, payload: myPayload, senderHash: sh, priority: frame.p ?? 1 },
          frame.p ?? 1,
        );
        break;
      case "PENDING_REQUESTS":
        this.emit("pending_requests_list", data);
        break;
      case "REQUEST_SENT":
        this.emit("notification", {
          type: "success",
          message: "Connection request sent",
        });
        this.emit("request_sent");
        break;
      case "USER_BLOCKED":
        if (data.targetEmail) {
          executeDB(
            "INSERT OR REPLACE INTO blocked_users (email, timestamp) VALUES (?, ?)",
            [data.targetEmail, Date.now()],
          ).catch((e) =>
            console.error("Failed to save blocked user locally", e),
          );
        }
        this.emit("notification", {
          type: "success",
          message: "User successfully blocked.",
        });
        break;
      case "USER_UNBLOCKED":
        if (data.targetEmail) {
          executeDB("DELETE FROM blocked_users WHERE email = ?", [
            data.targetEmail,
          ]).catch((e) =>
            console.error("Failed to remove blocked user locally", e),
          );
          this.emit("user_unblocked", data.targetEmail);
        }
        break;

      case "FRIEND_ACCEPTED_ACK":
        this.emit("notification", {
          type: "success",
          message: "Friend request accepted.",
        });
        break;
      case "SESSION_LIST":
        this.sessionService.handleSessionList(data);
        break;
      case "PEER_ONLINE":
        this.sessionService.setPeerOnline(sid, true);
        this.emit("session_updated");
        this.syncPendingMessages();
        this.messageService.syncManager.enqueueSync(sid);
        this.broadcastProfileUpdate();
        break;
      case "PEER_OFFLINE":
        this.sessionService.setPeerOnline(sid, false);
        this.emit("session_updated");
        break;
      case "DELIVERED":
        await executeDB(
          "UPDATE messages SET status = 2 WHERE sid = ? AND status = 1",
          [sid],
        );
        this.emit("message_status", { sid });
        break;
      case "DELIVERED_FAILED":
        this.emit("message_status", { sid });
        this.emit("notification", {
          type: "warning",
          message:
            "Message not delivered yet. It will be retried when the peer is online.",
        });
        break;
    }
  }

  public async insertMessageRecord(
    sid: string,
    text: string,
    type: string,
    sender: string,
    forceId?: string,
    replyTo?: any,
  ): Promise<string> {
    return this.messageService.insertMessageRecord(
      sid,
      text,
      type,
      sender,
      forceId,
      replyTo,
    );
  }

  public async encryptForSession(
    sid: string,
    data: string | Uint8Array | ArrayBuffer,
    priority: number,
  ): Promise<Record<string, string>> {
    return this.sessionService.encrypt(sid, data, priority);
  }

  public async login(token: string) {
    return this.authService.login(token);
  }

  public async logout() {
    return this.authService.logout();
  }

  public async deleteAccount() {
    socket.send({ t: "DELETE_ACCOUNT" });
  }

  public async switchAccount(email: string) {
    return this.authService.switchAccount(email);
  }

  // --- Actions ---
  public async connectToPeer(targetEmail: string) {
    return this.sessionService.connectToPeer(targetEmail);
  }

  public getPendingRequests() {
    socket.send({
      t: "GET_PENDING_REQUESTS",
      c: true,
      p: 0,
    });
  }

  public async acceptFriend(
    targetEmail: string,
    remotePub: string,
    senderHash: string,
  ) {
    return this.sessionService.acceptFriend(
      targetEmail,
      [remotePub],
      senderHash,
    );
  }

  public denyFriend(targetEmail: string) {
    return this.sessionService.denyFriend(targetEmail);
  }

  public async blockUser(targetEmail: string) {
    return this.sessionService.blockUser(targetEmail);
  }

  public async unblockUser(targetEmail: string) {
    return this.sessionService.unblockUser(targetEmail);
  }

  public async sendMessage(
    sid: string,
    text: string,
    replyTo?: any,
    type: string = "text",
  ) {
    return this.messageService.sendMessage(sid, text, replyTo, type);
  }

  public async editMessage(sid: string, messageId: string, newText: string) {
    return this.messageService.editMessage(sid, messageId, newText);
  }

  public async deleteMessage(sid: string, messageId: string) {
    return this.messageService.deleteMessage(sid, messageId);
  }

  public async broadcastProfileUpdate() {
    return this.messageService.broadcastProfileUpdate();
  }

  public async sendReaction(
    sid: string,
    messageId: string,
    emoji: string,
    action: "add" | "remove",
  ) {
    return this.messageService.sendReaction(sid, messageId, emoji, action);
  }

  public async sendFile(
    sid: string,
    fileData: File | Blob | string,
    fileInfo: { name: string; size: number; type: string },
  ) {
    return this.fileTransfer.sendFile(sid, fileData, fileInfo);
  }

  public async requestDownload(
    sid: string,
    messageId: string,
    chunkIndex: number = 0,
  ) {
    return this.fileTransfer.requestDownload(sid, messageId, chunkIndex);
  }

  public async startCall(
    sid: string,
    mode: "Audio" | "Video" | "Screen" = "Audio",
  ) {
    return this.callService.startCall(sid, mode);
  }

  public async switchStream(_sid: string, mode: "Audio" | "Video" | "Screen") {
    return this.callService.switchStream(_sid, mode);
  }

  // Getters for CallService properties
  public get isCalling() {
    return this.callService.isCalling;
  }
  public get isCallConnected() {
    return this.callService.isCallConnected;
  }
  public get callStartTime() {
    return this.callService.callStartTime;
  }
  public get isMicEnabled() {
    return this.callService.isMicEnabled;
  }
  public get isVideoEnabled() {
    return this.callService.isVideoEnabled;
  }
  public get isScreenEnabled() {
    return this.callService.isScreenEnabled;
  }
  public get canScreenShare() {
    return this.callService.canUseScreenShare();
  }
  public async getPublicKeyString() {
    return await this.authService.exportPub();
  }
  public get currentCallSid() {
    return this.callService.currentCallSid;
  }

  // Delegate Call Public Methods
  public async toggleVideo(enabled: boolean) {
    return this.callService.toggleVideo(enabled);
  }

  public async toggleScreenShare(enabled: boolean) {
    return this.callService.toggleScreenShare(enabled);
  }

  public async toggleMic(enabled?: boolean) {
    if (enabled === undefined) {
      return this.callService.toggleMic();
    }
    return this.callService.toggleMic();
  }

  public async acceptCall(sid: string) {
    return this.callService.acceptCall(sid);
  }

  public async endCall(sid?: string) {
    return this.callService.endCall(sid);
  }

  public async handleRTCOffer(sid: string, offer: RTCSessionDescriptionInit) {
    return this.callService.handleRTCOffer(sid, offer);
  }

  public async handleRTCAnswer(sid: string, answer: RTCSessionDescriptionInit) {
    return this.callService.handleRTCAnswer(sid, answer);
  }

  public async handleICECandidate(sid: string, candidate: RTCIceCandidateInit) {
    return this.callService.handleICECandidate(sid, candidate);
  }

  public getRemoteStream() {
    return this.callService.getRemoteStream();
  }
}

export default ChatClient.getInstance();
