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
