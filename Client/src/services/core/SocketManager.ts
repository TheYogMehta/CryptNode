import { EventEmitter } from "events";
import { MAX_WS_FRAME_BYTES } from "./protocolLimits";

class SocketManager extends EventEmitter {
  private static instance: SocketManager;
  private ws: WebSocket | null = null;
  private url: string = "";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private shouldReconnect = true;
  private readonly reconnectDelayMs = 3000;
  private readonly heartbeatTimeoutMs = 30000;
  private readonly heartbeatCheckMs = 5000;

  static getInstance() {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  async connect(url: string) {
    try {
      this.url = url;
      this.shouldReconnect = true;

      console.log("Proceeding with WebSocket connection...");

      if (
        this.ws &&
        (this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      this.clearReconnectTimer();

      await new Promise((resolve, reject) => {
        console.log(`Connecting to: ${url}`);
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log("WebSocket opened successfully!");
          this.lastMessageAt = Date.now();
          this.startHeartbeatWatchdog();
          this.emit("WS_CONNECTED");
          resolve(true);
        };

        this.ws.onmessage = (e) => {
          this.lastMessageAt = Date.now();
          if (typeof e.data !== "string") {
            return;
          }
          if (e.data.length > MAX_WS_FRAME_BYTES) {
            console.warn("Dropped oversized incoming WebSocket frame");
            return;
          }
          try {
            const frame = JSON.parse(e.data);
            this.emit("message", frame);
          } catch (err) {
            console.warn("Dropped malformed WebSocket frame", err);
          }
        };

        this.ws.onclose = (event) => {
          console.log(
            `Socket closed. Code: ${event.code}, Reason: ${event.reason}`,
          );
          this.stopHeartbeatWatchdog();
          this.ws = null;
          this.emit("WS_DISCONNECTED");
          this.scheduleReconnect();
        };

        this.ws.onerror = (err) => {
          console.error("WebSocket Error:", err);
          this.emit("error", err);
          reject(err);
        };
      });
    } catch (err) {
      console.error("Failed to connect to WebSocket:", err);
      this.emit("error", "WebSocket Connection Failed");
      this.scheduleReconnect();
      return;
    }
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const serialized = JSON.stringify(data);
      if (serialized.length > MAX_WS_FRAME_BYTES) {
        console.warn("Blocked oversized outbound WebSocket frame");
        this.emit("error", new Error("Outbound frame too large"));
        return;
      }
      this.ws.send(serialized);
    } else {
      if (!this.url) {
        console.warn(
          "WebSocket not connected and no URL set. Dropping message:",
          data,
        );
        return;
      }
      console.warn("WebSocket not connected. Retrying message...");
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.connect(this.url).catch(console.error);
      }
      setTimeout(() => this.send(data), 500);
    }
  }

  public isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  public disconnect() {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.stopHeartbeatWatchdog();
    this.url = "";
    if (this.ws) {
      console.log("Disconnecting WebSocket by user request...");
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
      this.emit("WS_DISCONNECTED");
    }
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect || !this.url) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(this.url).catch(console.error);
    }, this.reconnectDelayMs);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeatWatchdog() {
    this.stopHeartbeatWatchdog();
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const silentFor = Date.now() - this.lastMessageAt;
      if (silentFor <= this.heartbeatTimeoutMs) return;
      console.warn(
        `[SocketManager] No server frames for ${silentFor}ms, forcing reconnect`,
      );
      this.ws.close();
    }, this.heartbeatCheckMs);
  }

  private stopHeartbeatWatchdog() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export default SocketManager.getInstance();
