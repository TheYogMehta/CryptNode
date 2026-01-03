import { EventEmitter } from "events";
import { Platform } from "./SafeStorage";

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
    this.url = url;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.ws = new WebSocket(url);

    this.ws.onopen = () => this.emit("WS_CONNECTED");
    this.ws.onmessage = (e) => {
      const frame = JSON.parse(e.data);
      this.emit("message", frame);
    };
    this.ws.onclose = () => {
      this.emit("WS_DISCONNECTED");
      setTimeout(() => this.connect(this.url), 3000);
    };
    this.ws.onerror = (err) => this.emit("error", err);
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("WebSocket not connected. Retrying...");
      setTimeout(() => this.send(data), 500);
    }
  }
}

async function initTor() {
  const platform = await Platform();
  if (platform === "ios" || platform === "android") {
    try {
      const { Tor } = await import("@start9labs/capacitor-tor");
      await Tor.start();
      console.log("Tor started on native");
    } catch (e) {
      console.error("Failed to load Tor plugin", e);
    }
  } else {
    console.log("Running on Electron/Web: Tor plugin skipped.");
  }
}

export default SocketManager.getInstance();
