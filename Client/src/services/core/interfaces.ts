export interface IChatClient {
  sessions: Record<string, any>;
  userEmail: string | null;
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
}
