import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { IChatClient } from "./interfaces";

export class PushNotificationService {
  private static instance: PushNotificationService;
  private chatClient: IChatClient | null = null;
  private token: string | null = null;
  private hasInitialized = false;

  private constructor() {}

  public static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  public init(chatClient: IChatClient) {
    this.chatClient = chatClient;
    if (Capacitor.getPlatform() !== "android") {
      return;
    }
    if (this.hasInitialized) {
      return;
    }
    this.hasInitialized = true;

    this.setupListeners();

    // When the chat client emits 'auth_success', register push if we have permissions
    // or request them.
    this.chatClient.on("auth_success", () => {
      this.registerPush().catch((err) => {
        console.error("[PushNotificationService] Failed to register push on auth success:", err);
      });
    });
  }

  private setupListeners() {
    PushNotifications.addListener("registration", async (token) => {
      console.log("[PushNotificationService] Push registration success, token:", token.value);
      this.token = token.value;
      await Preferences.set({ key: "fcm_token", value: token.value });
      
      // If we are authenticated, register the token on the server
      this.sendTokenToServer(token.value);
    });

    PushNotifications.addListener("registrationError", (error) => {
      console.error("[PushNotificationService] Error on registration:", error);
    });

    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      console.log("[PushNotificationService] Push received:", notification);
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (notification) => {
      console.log("[PushNotificationService] Push action performed:", notification);
    });
  }

  private sendTokenToServer(token: string) {
    if (this.chatClient && this.chatClient.isConnected && this.chatClient.hasToken()) {
      console.log("[PushNotificationService] Registering FCM token on server");
      this.chatClient.send({
        t: "REGISTER_FCM_TOKEN",
        data: { token },
      });
    }
  }

  public async registerPush() {
    if (Capacitor.getPlatform() !== "android") return;

    try {
      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === "prompt") {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive === "granted") {
        // Register with Google/Firebase
        await PushNotifications.register();
      } else {
        console.warn("[PushNotificationService] Push notification permission not granted:", permStatus.receive);
      }
    } catch (err) {
      console.error("[PushNotificationService] Error requesting push permissions:", err);
    }
  }

  public async unregisterTokenFromServer() {
    if (Capacitor.getPlatform() !== "android") return;

    try {
      // Get the stored FCM token
      const { value: storedToken } = await Preferences.get({ key: "fcm_token" });
      const tokenToUnregister = storedToken || this.token;

      if (tokenToUnregister && this.chatClient && this.chatClient.isConnected) {
        console.log("[PushNotificationService] Unregistering FCM token from server");
        this.chatClient.send({
          t: "UNREGISTER_FCM_TOKEN",
          data: { token: tokenToUnregister },
        });
      }
      
      // Clean up local reference and Preferences
      this.token = null;
      await Preferences.remove({ key: "fcm_token" });
    } catch (err) {
      console.error("[PushNotificationService] Error unregistering push token:", err);
    }
  }
}
