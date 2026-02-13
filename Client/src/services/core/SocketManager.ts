import { EventEmitter } from "events";
import { MAX_WS_FRAME_BYTES } from "./protocolLimits";

class SocketManager extends EventEmitter {
  private static instance: SocketManager;
  private ws: WebSocket | null = null;
  private url: string = "";

  static getInstance() {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  async connect(url: string) {
    try {
      this.url = url;

      console.log("Proceeding with WebSocket connection...");

      if (
        this.ws &&
        (this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      await new Promise((resolve, reject) => {
        console.log(`Connecting to: ${url}`);
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log("WebSocket opened successfully!");
          this.emit("WS_CONNECTED");
          resolve(true);
        };

        this.ws.onmessage = (e) => {
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
          this.emit("WS_DISCONNECTED");
          setTimeout(() => this.connect(this.url), 3000);
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
      console.warn("WebSocket not connected. Retrying...");
      if (this.url && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
        this.connect(this.url).catch(console.error);
      }
      setTimeout(() => this.send(data), 500);
    }
  }

  public isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  public disconnect() {
    if (this.ws) {
      console.log("Disconnecting WebSocket by user request...");
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
      this.emit("WS_DISCONNECTED");
    }
  }
}

export default SocketManager.getInstance();
