export interface IChatClient {
  sessions: Record<string, any>;
  userEmail: string | null;
  callService: any;
  messageService: any;
  fileTransfer: any;
  send(frame: any): void;
  encryptForSession(
    sid: string,
    data: string | Uint8Array | ArrayBuffer,
    priority: number,
  ): Promise<Record<string, string>>;
  emit(event: string, ...args: any[]): boolean;
  insertMessageRecord(
    sid: string,
    text: string,
    type: string,
    sender: string,
    forceId?: string,
    replyTo?: any,
  ): Promise<string>;
  getPublicKeyString(): Promise<string>;
  broadcastSyncCallAccept?(callSid: string): Promise<void>;
  broadcastSyncCallEnd?(callSid: string): Promise<void>;
}
