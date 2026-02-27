import type { CapacitorElectronConfig } from "@capacitor-community/electron";
import {
  getCapacitorElectronConfig,
  setupElectronDeepLinking,
} from "@capacitor-community/electron";
import type { MenuItemConstructorOptions } from "electron";
import {
  app,
  MenuItem,
  ipcMain,
  session,
  BrowserWindow,
  shell,
} from "electron";
import { randomBytes } from "crypto";
import electronIsDev from "electron-is-dev";
import unhandled from "electron-unhandled";
import keytar from "keytar";

import {
  ElectronCapacitorApp,
  setupContentSecurityPolicy,
  setupReloadWatcher,
} from "./setup";

app.commandLine.appendSwitch("disable-http-cache");

// Graceful handling of unhandled errors.
unhandled();

// Define our menu templates (these are optional)
const trayMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  new MenuItem({ label: "Quit App", role: "quit" }),
];
const appMenuBarMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  { role: process.platform === "darwin" ? "appMenu" : "fileMenu" },
  { role: "viewMenu" },
];

// Get Config options from capacitor.config
const capacitorFileConfig: CapacitorElectronConfig =
  getCapacitorElectronConfig();

// Initialize our app. You can pass menu templates into the app here.
// const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig);
const myCapacitorApp = new ElectronCapacitorApp(
  capacitorFileConfig,
  trayMenuTemplate,
  appMenuBarMenuTemplate,
);

// If deeplinking is enabled then we will set it up here.
if (capacitorFileConfig.electron?.deepLinkingEnabled) {
  setupElectronDeepLinking(myCapacitorApp, {
    customProtocol:
      capacitorFileConfig.electron.deepLinkingCustomProtocol ??
      "mycapacitorapp",
  });
}

// If we are in Dev mode, use the file watcher components.
if (electronIsDev) {
  setupReloadWatcher(myCapacitorApp);
}

// Run Applicationapp
(async () => {
  // Wait for electron app to be ready.
  await app.whenReady();
  // Security - Set Content-Security-Policy based on whether or not we are in dev mode.
  setupContentSecurityPolicy(myCapacitorApp.getCustomURLScheme());
  // Initialize our app, build windows, and load content.
  await myCapacitorApp.init();
  // Check for updates if we are in a packaged app.
  // autoUpdater.checkForUpdatesAndNotify();

  // Handle permissions
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowedPermissions = [
        "media",
        "mediaKeySystem",
        "display-capture",
        "notifications",
        "clipboard-read",
        "clipboard-write",
      ];
      if (allowedPermissions.includes(permission)) {
        callback(true);
      } else {
        callback(false);
      }
    },
  );

  if (session.defaultSession.setDisplayMediaRequestHandler) {
    session.defaultSession.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ["screen", "window"],
          });
          callback({ video: sources[0], audio: undefined });
        } catch (e) {
          console.error("[Main] setDisplayMediaRequestHandler error:", e);
          callback({ video: null, audio: undefined });
        }
      },
    );
  }
})();

// Handle when all of our windows are close (platforms have their own expectations).
app.on("window-all-closed", function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// When the dock icon is clicked.
app.on("activate", async function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (myCapacitorApp.getMainWindow().isDestroyed()) {
    await myCapacitorApp.init();
  }
});

// ============================================================================
// Google Login
// ============================================================================
ipcMain.handle("GoogleLogin", async () => {
  return new Promise((resolve) => {
    const state = randomBytes(16).toString("hex");
    const nonce = randomBytes(16).toString("hex");
    const googleLoginUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      "scope=openid%20email%20profile&" +
      "response_type=id_token%20token&" +
      "nonce=" +
      encodeURIComponent(nonce) +
      "&" +
      "state=" +
      encodeURIComponent(state) +
      "&" +
      "redirect_uri=http://localhost:5173&" +
      "client_id=588653192623-aqs0s01hv62pbp5p7pe3r0h7mce8m10l.apps.googleusercontent.com";

    const authWindow = new BrowserWindow({
      width: 500,
      height: 600,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    authWindow.loadURL(googleLoginUrl);

    authWindow.webContents.on("will-redirect", (event, url) => {
      handleNavigation(url);
    });

    authWindow.webContents.on("will-navigate", (event, url) => {
      handleNavigation(url);
    });

    const parseParams = (
      rawUrl: string,
    ): {
      state?: string;
      access_token?: string;
      id_token?: string;
    } | null => {
      try {
        const parsed = new URL(rawUrl);
        if (
          parsed.protocol !== "http:" ||
          parsed.hostname !== "localhost" ||
          parsed.port !== "5173"
        ) {
          return null;
        }
        const out: Record<string, string> = {};
        for (const [k, v] of parsed.searchParams.entries()) out[k] = v;
        if (parsed.hash.startsWith("#")) {
          const hash = new URLSearchParams(parsed.hash.slice(1));
          for (const [k, v] of hash.entries()) out[k] = v;
        }
        return out;
      } catch {
        return null;
      }
    };

    const getJwtNonce = (jwt?: string | null): string | null => {
      if (!jwt) return null;
      try {
        const parts = jwt.split(".");
        if (parts.length < 2) return null;
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64.padEnd(
          base64.length + ((4 - (base64.length % 4)) % 4),
          "=",
        );
        const claims = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
        return typeof claims?.nonce === "string" ? claims.nonce : null;
      } catch {
        return null;
      }
    };

    function handleNavigation(url: string) {
      const parsed = parseParams(url);
      if (!parsed || (!parsed.access_token && !parsed.id_token)) return;
      if (parsed.state !== state) {
        resolve(null);
        authWindow.close();
        return;
      }
      const idToken = parsed.id_token || null;
      if (idToken && getJwtNonce(idToken) !== nonce) {
        resolve(null);
        authWindow.close();
        return;
      }

      resolve({ accessToken: parsed.access_token || null, idToken });
      authWindow.close();
    }

    authWindow.on("closed", () => {
      resolve(null);
    });
  });
});

// ============================================================================
// Screen Sharing
// ============================================================================
import { desktopCapturer } from "electron";

ipcMain.handle("get-desktop-sources", async () => {
  console.log("[Main] get-desktop-sources called");
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"],
  });
  console.log(`[Main] Found ${sources.length} sources`);
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
  }));
});

ipcMain.handle("open-external-url", async (_event, url: string) => {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:", "otpauth:"].includes(parsed.protocol)) {
      return false;
    }
    await shell.openExternal(url);
    return true;
  } catch (e) {
    console.error("[Main] Failed to open external URL:", e);
    return false;
  }
});

// ============================================================================
// Secure Storage
// ============================================================================
let activeUserHash: string | null = null;
const GLOBAL_KEYS = ["cryptnode_accounts"];

function isValidSha256Hex(value: string | null): boolean {
  return !!value && /^[a-f0-9]{64}$/i.test(value);
}

function isScopedKeyForActiveUser(key: string, userHash: string): boolean {
  return key.endsWith(`_${userHash}`);
}

function checkAccess(key: string): boolean {
  if (GLOBAL_KEYS.includes(key)) return true;
  if (isValidSha256Hex(activeUserHash) && isScopedKeyForActiveUser(key, activeUserHash)) {
    return true;
  }
  console.warn(`[SafeStorage] Access denied for key: ${key}`);
  return false;
}

ipcMain.handle(
  "SafeStorage:SetActiveUser",
  async (_event, userHash: string | null) => {
    activeUserHash =
      typeof userHash === "string" && isValidSha256Hex(userHash)
        ? userHash.toLowerCase()
        : null;
    return { success: true };
  },
);

ipcMain.handle("SafeStorage:getKey", async (_event, key: string) => {
  if (!checkAccess(key)) return null;
  return keytar.getPassword("CryptNode", key);
});

ipcMain.handle(
  "SafeStorage:setKey",
  async (_event, key: string, value: string) => {
    if (!checkAccess(key)) return null;
    return keytar.setPassword("CryptNode", key, value);
  },
);
