import { EventEmitter } from "events";
import { Platform } from "./SafeStorage";

class SocketManager extends EventEmitter {
  private static instance: SocketManager;
  private ws: WebSocket | null = null;
  private url: string = "";
  private isTorRunning: boolean = false;

  static getInstance() {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  async connect(url: string) {
    try {
      this.url = url;

      // 1. Check if it's an onion link
      const isOnion = url.toLowerCase().includes(".onion");

      if (isOnion && !this.isTorRunning) {
        console.log("Onion address detected. Initializing Tor...");
        try {
          await this.initTor();
          this.isTorRunning = true;
        } catch (err) {
          console.error("Failed to start Tor for onion address:", err);
          this.emit("error", "Tor Initialization Failed");
          return;
        }
      }

      console.log("Proceeding with WebSocket connection...");
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // 2. Standard WebSocket connection logic
      if (
        this.ws &&
        (this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      // Check and Log WebSocket State on Connection Attempt
      await new Promise((resolve, reject) => {
        console.log(`Connecting to: ${url} (Tor: ${isOnion})`);
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log("WebSocket opened successfully!");
          this.emit("WS_CONNECTED");
          resolve(true);
        };

        this.ws.onmessage = (e) => {
          const frame = JSON.parse(e.data);
          this.emit("message", frame);
        };

        this.ws.onclose = (event) => {
          console.log(
            `Socket closed. Code: ${event.code}, Reason: ${event.reason}`
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
      console.error("Failed to start Tor for onion address:", err);
      this.emit("error", "Tor Initialization Failed");
      return;
    }
  }

  private async initTor() {
    const platform = await Platform();
    if (platform === "ios" || platform === "android") {
      try {
        const { Tor } = await import("@start9labs/capacitor-tor");
        await Tor.start();
        console.log("Tor started on native");
      } catch (e) {
        throw new Error("Capacitor Tor failed: " + e);
      }
    } else {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject("Tor bootstrap timed out"),
          60000
        );

        if ((window as any).TorManager?.onLog) {
          (window as any).TorManager.onLog((log: string) => {
            if (log.includes("Bootstrapped 100%")) {
              clearTimeout(timeout);
              console.log("Tor Ready for sockets!");
              resolve(true);
            }
          });
        }

        (window as any).TorManager.initTor().catch((err: any) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }
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
