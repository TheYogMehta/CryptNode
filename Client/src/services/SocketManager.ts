import { EventEmitter } from "events";

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

  connect(url: string) {
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

export default SocketManager.getInstance();
