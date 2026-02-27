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

export class AuthService extends EventEmitter {
  public userEmail: string | null = null;
  private authToken: string | null = null;
  public identityKeyPair: CryptoKeyPair | null = null;

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
    this.authToken = token;

    const email = this.extractEmailFromToken(token);
    if (!email) {
      throw new Error("Could not extract email from token");
    }
    this.userEmail = email.toLowerCase().trim();
    const pubKey = await this.setupDeviceKeys(this.userEmail);

    if (socket.isConnected()) {
      socket.disconnect();
      await new Promise((res) => setTimeout(res, 100));
    }

    const isDev =
      import.meta.env.VITE_DEV_SOCKET ||
      (window as any).envConfig?.USE_DEV_SOCKET;
    const wsUrl = isDev
      ? "ws://localhost:9000"
      : "wss://socket.cryptnode.theyogmehta.online";
    await socket.connect(wsUrl);

    socket.send({
      t: "AUTH",
      data: { token, publicKey: pubKey },
      c: true,
      p: 0,
    });
  }

  private extractEmailFromToken(token: string): string | null {
    if (token.startsWith("sess:")) {
      const parts = token.split(":");
      if (parts.length >= 3) return parts[2];
      return null;
    }
    const claims = this.parseGoogleIdTokenClaims(token);
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
    let key = await getKeyFromSecureStorage(
      await AccountService.getStorageKey(email, "MASTER_KEY"),
    );
    if (!key) {
      console.log("[AuthService] Generating new MASTER_KEY for user");
      key = bip39.generateMnemonic(128);
      await setKeyFromSecureStorage(
        await AccountService.getStorageKey(email, "MASTER_KEY"),
        key,
      );
    }
    const dbName = await AccountService.getDbName(email);
    await switchDatabase(dbName, key!);

    await this.loadIdentity();
    return await this.exportPub();
  }

  public async logout() {
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
    socket.disconnect();
    this.emit("auth_error");
  }

  public async switchAccount(email: string) {
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
    await setActiveUser(email);

    const pubKey = await this.setupDeviceKeys(email);

    if (socket.isConnected()) {
      socket.disconnect();
      await new Promise((res) => setTimeout(res, 100));
    }

    const isDev =
      import.meta.env.VITE_DEV_SOCKET ||
      (window as any).envConfig?.USE_DEV_SOCKET;
    const wsUrl = isDev
      ? "ws://localhost:9000"
      : "wss://socket.cryptnode.theyogmehta.online";
    await socket.connect(wsUrl);

    const waitForAuth = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Authentication timed out"));
      }, 10000);

      const onSuccessOrPending = (authedEmail: string) => {
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
        this.off("auth_success", onSuccessOrPending);
        this.off("auth_error", onError);
        this.off("auth_pending", onSuccessOrPending);
      };

      this.on("auth_success", onSuccessOrPending);
      this.on("auth_pending", onSuccessOrPending);
      this.on("auth_error", onError);
    });

    socket.send({
      t: "AUTH",
      data: { token: this.authToken, publicKey: pubKey },
    });
    await waitForAuth;
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

      const claims = this.parseGoogleIdTokenClaims(data.token);
      await AccountService.addAccount(
        data.email,
        data.token,
        claims.name,
        claims.picture,
      );
      await setActiveUser(data.email);

      this.emit("auth_success", data.email);
    }
  }

  public async handleAuthPending(data: any) {
    this.userEmail = data.email;
    if (data.token) {
      this.authToken = data.token;
      const tokenKey = await AccountService.getStorageKey(
        data.email,
        "auth_token",
      );
      await setKeyFromSecureStorage(tokenKey, data.token);
      console.log("[AuthService] Session token saved (Pending)");

      const claims = this.parseGoogleIdTokenClaims(data.token);
      await AccountService.addAccount(
        data.email,
        data.token,
        claims.name,
        claims.picture,
      );
      await setActiveUser(data.email);

      this.emit("auth_pending", data.email);
    }
  }
}
