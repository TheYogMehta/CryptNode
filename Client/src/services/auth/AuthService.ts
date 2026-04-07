import { EventEmitter } from "events";
import { AccountService } from "./AccountService";
import {
  setKeyFromSecureStorage,
  getKeyFromSecureStorage,
  setActiveUser,
} from "../storage/SafeStorage";
import { switchDatabase } from "../storage/sqliteService";
import socket from "../core/SocketManager";
import * as bip39 from "bip39";

type AuthProfileClaims = {
  name?: string;
  picture?: string;
};

export class AuthService extends EventEmitter {
  public userEmail: string | null = null;
  private authToken: string | null = null;
  public identityKeyPair: CryptoKeyPair | null = null;
  private _loginInFlight: Promise<string> | null = null;
  private pendingProfileClaims: AuthProfileClaims | null = null;

  public isLocallyReady: boolean = false;

  constructor() {
    super();
  }

  public hasToken(): boolean {
    return !!this.authToken;
  }

  public getAuthToken(): string | null {
    return this.authToken;
  }

  public setAuthToken(token: string) {
    this.authToken = token;
  }

  public async login(token: string) {
    if (!token || !String(token).trim()) {
      throw new Error("Missing Google id token");
    }


    if (this._loginInFlight) {
      console.warn(
        "[AuthService] login() called while already in flight, deduplicating",
      );
      return this._loginInFlight;
    }

    this._loginInFlight = (async () => {
      try {
        this.authToken = token;
        this.pendingProfileClaims = this.parseGoogleIdTokenClaims(token);
        const email = this.extractEmailFromToken(token);
        if (!email) throw new Error("Could not extract email from token");
        this.userEmail = email.toLowerCase().trim();

        await setActiveUser(this.userEmail);

        const pubKey = await this.setupDeviceKeys(this.userEmail);

        socket.disconnect();
        await new Promise((res) => setTimeout(res, 150));

        const isDev =
          import.meta.env.VITE_DEV_SOCKET ||
          (window as any).envConfig?.USE_DEV_SOCKET;
        const wsUrl = isDev
          ? "ws://localhost:9000"
          : "wss://socket.cryptnode.theyogmehta.online";

        await socket.connect(wsUrl);

        return pubKey;
      } finally {
        this._loginInFlight = null;
      }
    })();

    return this._loginInFlight;
  }

  private extractEmailFromToken(token: string): string | null {
    if (token.startsWith("sess:")) {
      const parts = token.split(":");
      if (parts.length >= 3) return parts[2];
      return null;
    }
    try {
      const parts = token.split(".");
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(
        base64.length + ((4 - (base64.length % 4)) % 4),
        "=",
      );
      const json = atob(padded);
      const claims = JSON.parse(json);
      return claims.email || null;
    } catch {
      return null;
    }
  }

  private async setupDeviceKeys(email: string): Promise<string> {
    const masterKeyStorageKey = await AccountService.getStorageKey(
      email,
      "MASTER_KEY",
    );
    let key = await getKeyFromSecureStorage(masterKeyStorageKey);
    if (!key) {
      console.log("[AuthService] Generating new MASTER_KEY for user");
      key = bip39.generateMnemonic(128);
      await setKeyFromSecureStorage(masterKeyStorageKey, key);
      await setKeyFromSecureStorage(
        await AccountService.getStorageKey(email, "MASTER_KEY_PENDING_REVEAL"),
        "1",
      );
    }
    const dbName = await AccountService.getDbName(email);
    await switchDatabase(dbName, key!);

    await this.loadIdentity();
    return await this.exportPub();
  }

  public lockSession() {
    this.authToken = null;
    this.userEmail = null;
    this.identityKeyPair = null;
    this.pendingProfileClaims = null;
    socket.disconnect();
    this.emit("auth_error", { isManualLogout: true });
  }

  public async logout(isManualLogout = false) {
    if (this.userEmail) {
      const key = await AccountService.getStorageKey(
        this.userEmail,
        "auth_token",
      );
      await setKeyFromSecureStorage(key, "");
      await AccountService.updateToken(this.userEmail, "");
    }
    this.authToken = null;
    this.userEmail = null;
    this.identityKeyPair = null;
    this.pendingProfileClaims = null;
    socket.disconnect();
    this.emit("auth_error", { isManualLogout });
  }

  /**
   * Phase 1 (offline-safe): Unlock the local DB for a returning user.
   * Resolves immediately without touching the network — call this to unblock the UI.
   * Follow up with switchAccountConnect() in the background.
   */
  public async switchAccountLocal(
    email: string,
  ): Promise<{ pubKey: string; token: string }> {
    const accounts = await AccountService.getAccounts();
    const account = accounts.find((a) => a.email === email);
    if (!account) throw new Error("Account not found");

    const tokenKey = await AccountService.getStorageKey(email, "auth_token");
    const secureStoredToken = (await getKeyFromSecureStorage(tokenKey)) || "";
    const tokenToUse = (secureStoredToken || account.token || "").trim();
    if (!tokenToUse) {
      throw new Error("Session expired. Please login again.");
    }

    this.authToken = tokenToUse;
    this.userEmail = email;
    this.identityKeyPair = null;
    this.isLocallyReady = true;
    await setActiveUser(email);

    const pubKey = await this.setupDeviceKeys(email);
    return { pubKey, token: tokenToUse };
  }

  /**
   * Phase 2 (background): Connect the WebSocket and authenticate with the server.
   * Safe to call fire-and-forget — errors are caught and logged, not thrown.
   */
  public async switchAccountConnect(
    email: string,
    pubKey?: string,
    token?: string,
  ): Promise<void> {
    try {
      // If phase 1 wasn't called separately (e.g. internal use), resolve credentials now.
      if (!pubKey || !token) {
        const result = await this.switchAccountLocal(email);
        pubKey = result.pubKey;
        token = result.token;
      }

      socket.disconnect();
      await new Promise((res) => setTimeout(res, 150));

      const isDev =
        import.meta.env.VITE_DEV_SOCKET ||
        (window as any).envConfig?.USE_DEV_SOCKET;
      const wsUrl = isDev
        ? "ws://localhost:9000"
        : "wss://socket.cryptnode.theyogmehta.online";
      await socket.connect(wsUrl);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error("Authentication timed out"));
        }, 15000);

        const onSuccess = (authedEmail: string) => {
          if (authedEmail !== email) return;
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error("Authentication failed"));
        };
        const cleanup = () => {
          clearTimeout(timeout);
          this.off("auth_success", onSuccess);
          this.off("auth_error", onError);
        };
        this.on("auth_success", onSuccess);
        this.on("auth_error", onError);
      });
    } catch (err) {
      console.warn(
        "[AuthService] Background server auth failed (will retry via WS reconnect):",
        err,
      );
    }
  }

  /**
   * Full blocking switchAccount — used for explicit account switching in Settings
   * where we want a clean reconnect and a guaranteed connected state before returning.
   */
  public async switchAccount(email: string) {
    const { pubKey, token } = await this.switchAccountLocal(email);
    // Wait for server auth so callers know the session is fully established.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Authentication timed out"));
      }, 20000);

      const onSuccess = (authedEmail: string) => {
        if (authedEmail !== email) return;
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Authentication failed"));
      };
      const cleanup = () => {
        clearTimeout(timeout);
        this.off("auth_success", onSuccess);
        this.off("auth_error", onError);
      };
      this.on("auth_success", onSuccess);
      this.on("auth_error", onError);

      // Kick off connection after listeners are registered.
      this.switchAccountConnect(email, pubKey, token).catch(() => {});
    });
  }

  public async loadIdentity() {
    if (!this.userEmail) return;
    const privKeyName = await AccountService.getStorageKey(
      this.userEmail,
      "identity_priv",
    );
    const pubKeyName = await AccountService.getStorageKey(
      this.userEmail,
      "identity_pub",
    );

    const privJWK = await getKeyFromSecureStorage(privKeyName);
    const pubJWK = await getKeyFromSecureStorage(pubKeyName);
    if (privJWK && pubJWK) {
      this.identityKeyPair = {
        privateKey: await crypto.subtle.importKey(
          "jwk",
          JSON.parse(privJWK),
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveKey"],
        ),
        publicKey: await crypto.subtle.importKey(
          "jwk",
          JSON.parse(pubJWK),
          { name: "ECDH", namedCurve: "P-256" },
          true,
          [],
        ),
      };
    } else {
      this.identityKeyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"],
      );
      await setKeyFromSecureStorage(
        privKeyName,
        JSON.stringify(
          await crypto.subtle.exportKey("jwk", this.identityKeyPair.privateKey),
        ),
      );
      await setKeyFromSecureStorage(
        pubKeyName,
        JSON.stringify(
          await crypto.subtle.exportKey("jwk", this.identityKeyPair.publicKey),
        ),
      );
    }
  }

  public async exportPub() {
    const raw = await crypto.subtle.exportKey(
      "raw",
      this.identityKeyPair!.publicKey,
    );
    return btoa(String.fromCharCode(...new Uint8Array(raw)));
  }

  private parseGoogleIdTokenClaims(token?: string | null): {
    name?: string;
    picture?: string;
  } {
    try {
      if (!token) return {};
      const parts = token.split(".");
      if (parts.length < 2) return {};
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(
        base64.length + ((4 - (base64.length % 4)) % 4),
        "=",
      );
      const json = atob(padded);
      const claims = JSON.parse(json);
      return {
        name: typeof claims?.name === "string" ? claims.name : undefined,
        picture:
          typeof claims?.picture === "string" ? claims.picture : undefined,
      };
    } catch (_e) {
      return {};
    }
  }

  public async handleAuthSuccess(data: any) {
    this.userEmail = data.email;
    if (data.token) {
      this.authToken = data.token;
      const tokenKey = await AccountService.getStorageKey(
        data.email,
        "auth_token",
      );
      await setKeyFromSecureStorage(tokenKey, data.token);
      console.log("[AuthService] Session token saved/refreshed");

      const tokenClaims = this.parseGoogleIdTokenClaims(data.token);
      const claims: AuthProfileClaims = {
        name: tokenClaims.name || this.pendingProfileClaims?.name,
        picture: tokenClaims.picture || this.pendingProfileClaims?.picture,
      };
      await AccountService.addAccount(
        data.email,
        data.token,
        claims.name,
        claims.picture,
      );
      this.pendingProfileClaims = null;
      await setActiveUser(data.email);

      this.emit("auth_success", data.email);
    }
  }
}
