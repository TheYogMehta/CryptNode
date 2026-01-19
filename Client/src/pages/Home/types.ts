export interface ChatMessage {
  sid: string;
  text: string;
  sender: "me" | "other";
  status?: 1 | 2 | 3;
}

export interface InboundReq {
  sid: string;
  publicKey: string;
}

export type CallStatus = "idle" | "calling" | "ringing" | "connected";

export interface CallState {
  status: CallStatus;
  type: "audio" | "video" | null;
  remoteSid: string | null;
  isIncoming: boolean;
}