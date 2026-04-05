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
import electronIsDev from "electron-is-dev";
import unhandled from "electron-unhandled";
import keytar from "keytar";
import {
  ElectronCapacitorApp,
  setupContentSecurityPolicy,
  setupReloadWatcher,
} from "./setup";
import * as https from "https";
import * as http from "http";


app.commandLine.appendSwitch("disable-http-cache");
if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
}
app.commandLine.appendSwitch("plugins");

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
        "clipboard-sanitized-write",
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
  return new Promise((resolve, reject) => {
    const googleLoginUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      "scope=openid%20email%20profile&" +
      "response_type=id_token%20token&" +
      "nonce=" +
      Math.random().toString(36).substring(7) +
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

    function handleNavigation(url: string) {
      if (url.includes("access_token=") || url.includes("id_token=")) {
        const rawCode = /access_token=([^&]*)/.exec(url) || null;
        const accessToken = rawCode && rawCode.length > 1 ? rawCode[1] : null;

        const rawIdToken = /id_token=([^&]*)/.exec(url) || null;
        const idToken =
          rawIdToken && rawIdToken.length > 1 ? rawIdToken[1] : null;

        if (accessToken || idToken) {
          resolve({ accessToken, idToken });
          authWindow.close();
        }
      }
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

function checkAccess(key: string): boolean {
  if (GLOBAL_KEYS.includes(key)) return true;
  if (activeUserHash && key.includes(activeUserHash)) {
    return true;
  }
  console.warn(
    `[SafeStorage] Access Denied to key: ${key}. ActiveUser: ${activeUserHash}`,
  );
  return false;
}

ipcMain.handle(
  "SafeStorage:SetActiveUser",
  async (_event, userHash: string | null) => {
    console.log("[SafeStorage] Setting Active User Hash:", userHash);
    activeUserHash = userHash;
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

// ============================================================================
// Database Cleanup
// ============================================================================
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

ipcMain.handle("DeleteDatabaseFiles", async (_event, dbName: string) => {
  try {
    let dbFolderConfig: any = (capacitorFileConfig as any).plugins?.CapacitorSQLite;

    if (!dbFolderConfig) {
      try {
        const appPath = app.getAppPath();
        const jsonPath = path.join(appPath, "capacitor.config.json");
        if (fs.existsSync(jsonPath)) {
          dbFolderConfig = JSON.parse(fs.readFileSync(jsonPath, "utf8"))?.plugins?.CapacitorSQLite;
        } else {
          const jsPath = path.join(appPath, "build", "capacitor.config.js");
          if (fs.existsSync(jsPath)) {
            const mod = require(jsPath);
            dbFolderConfig = (mod.default || mod)?.plugins?.CapacitorSQLite;
          }
        }
      } catch (err) {
        console.warn("[Main] Could not fallback parse config for DB deletion:", err);
      }
    }

    let dbFolder = "Databases";

    const osType = os.type();
    if (osType === "Darwin" && dbFolderConfig?.electronMacLocation) {
      dbFolder = dbFolderConfig.electronMacLocation;
    } else if (osType === "Linux" && dbFolderConfig?.electronLinuxLocation) {
      dbFolder = dbFolderConfig.electronLinuxLocation;
    } else if (
      osType === "Windows_NT" &&
      dbFolderConfig?.electronWindowsLocation
    ) {
      dbFolder = dbFolderConfig.electronWindowsLocation;
    }

    const appName = app.getName() || "cryptnode";
    const databasesPathsToTry: string[] = [];

    // Handle backslashes and forward slashes for absolute paths
    if (dbFolder.includes(path.sep) || dbFolder.includes("/") || dbFolder.includes("\\")) {
      databasesPathsToTry.push(dbFolder);
      databasesPathsToTry.push(path.join(dbFolder, appName));
      databasesPathsToTry.push(path.join(dbFolder, "cryptnode"));
      databasesPathsToTry.push(path.join(dbFolder, "CryptNode"));
    } else {
      databasesPathsToTry.push(path.join(os.homedir(), dbFolder, appName));
      databasesPathsToTry.push(path.join(os.homedir(), dbFolder, "cryptnode"));
      databasesPathsToTry.push(path.join(os.homedir(), dbFolder, "CryptNode"));
    }

    const uniquePaths = Array.from(new Set(databasesPathsToTry));

    const targets = [
      `${dbName}SQLite.db`,
      `${dbName}SQLite.db-journal`,
      `${dbName}SQLite.db-wal`,
      `${dbName}SQLite.db-shm`,
    ];

    let filesDeleted = 0;
    let anyExisted = false;

    for (const databasesPath of uniquePaths) {
      for (const file of targets) {
        const fullPath = path.join(databasesPath, file);
        try {
          if (fs.existsSync(fullPath)) {
            anyExisted = true;
            // Retry loop for Windows EBUSY/EPERM
            let retries = 5;
            while (retries > 0) {
              try {
                fs.unlinkSync(fullPath);
                filesDeleted++;
                console.log(`[Main] Deleted DB file via IPC: ${fullPath}`);
                break; // Break retry loop on success
              } catch (err: any) {
                if (err.code === "EBUSY" || err.code === "EPERM") {
                  retries--;
                  if (retries === 0) throw err;
                  await new Promise(resolve => setTimeout(resolve, 300));
                } else {
                  throw err;
                }
              }
            }
          }
        } catch (err: any) {
          console.error(`[Main] Error deleting DB file ${fullPath}:`, err);
          return { success: false, error: err.message || String(err), count: filesDeleted };
        }
      }
    }

    if (!anyExisted) {
      return { success: false, error: "Database files not found in any known path. Attempted: " + uniquePaths[0], count: 0 };
    }

    return { success: filesDeleted > 0, count: filesDeleted };
  } catch (e: any) {
    console.error("[Main] Failed to delete database files:", e);
    return { success: false, error: String(e) };
  }
});

// ============================================================================
// Local LLM (node-llama-cpp)
// ============================================================================
let globalLlama: any = null;
let globalModel: any = null;
let globalContext: any = null;
let globalSession: any = null;

const asyncImportDynamic = new Function('modulePath', 'return import(modulePath)');

ipcMain.handle("llama:init", async (event, { modelPath }) => {
  try {
    const { getLlama, LlamaChatSession } = await asyncImportDynamic("node-llama-cpp");

    if (!globalLlama) {
      globalLlama = await getLlama();
    }

    // Cleanup old session if needed
    if (globalContext) {
      await globalContext.dispose();
      globalContext = null;
    }
    if (globalModel) {
      await globalModel.dispose();
      globalModel = null;
    }

    // Try GPU first, then fall back to CPU if VRAM is insufficient
    let usedCpuFallback = false;

    try {
      globalModel = await globalLlama.loadModel({ modelPath });
    } catch (modelErr: any) {
      console.warn("[Main] GPU model load failed, falling back to CPU. Original error:", modelErr?.message || modelErr);
      try {
        globalModel = await globalLlama.loadModel({ modelPath, gpuLayers: 0 });
        usedCpuFallback = true;
      } catch (cpuErr: any) {
        throw new Error(`Model load failed on both GPU and CPU: ${cpuErr?.message || cpuErr}`);
      }
    }

    // Try progressively smaller context sizes
    const contextSizes = [2048, 1024, 512];
    let contextCreated = false;

    for (const ctxSize of contextSizes) {
      try {
        globalContext = await globalModel.createContext({ contextSize: ctxSize });
        contextCreated = true;
        console.log(`[Main] Context created with size ${ctxSize}${usedCpuFallback ? " (CPU mode)" : ""}`);
        break;
      } catch (ctxErr: any) {
        console.warn(`[Main] Context creation failed at size ${ctxSize}, trying smaller... Original error:`, ctxErr?.message || ctxErr);
        // If we haven't tried CPU fallback yet for model, do it now
        if (!usedCpuFallback) {
          console.warn("[Main] Retrying model load with CPU fallback...");
          if (globalModel) {
            await globalModel.dispose();
            globalModel = null;
          }
          try {
            globalModel = await globalLlama.loadModel({ modelPath, gpuLayers: 0 });
            usedCpuFallback = true;
          } catch (cpuErr: any) {
            throw new Error(`CPU fallback model load failed: ${cpuErr?.message || cpuErr}`);
          }
        }
        continue;
      }
    }

    if (!contextCreated) {
      if (globalModel) {
        await globalModel.dispose();
        globalModel = null;
      }
      throw new Error("Context creation failed: Could not allocate memory even at minimum context size (512)");
    }

    globalSession = new LlamaChatSession({ contextSequence: globalContext.getSequence() });

    return { success: true, cpuFallback: usedCpuFallback };
  } catch (err: any) {
    console.error("[Main] Llama Init Error:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("llama:clearChat", async () => {
  if (globalSession) {
    if (typeof globalSession.setChatHistory === 'function') {
      globalSession.setChatHistory([]);
    } else if (globalSession.chatHistory) {
      globalSession.chatHistory = [];
    }
  }
  return { success: true };
});

ipcMain.handle("llama:generate", async (event, { prompt, options, id }) => {
  if (!globalSession) {
    return { success: false, error: "Llama session not initialized" };
  }

  try {
    const response = await globalSession.prompt(prompt, {
      maxTokens: options.max_new_tokens || 128,
      temperature: options.temperature || 0.2,
      topP: options.top_p || 0.9,
      onTextChunk(chunk: string) {
        event.sender.send("llama:token", { id, token: chunk });
      }
    });

    return { success: true, output: response };
  } catch (err: any) {
    console.error("[Main] Llama Generate Error:", err);
    return { success: false, error: err.message };
  }
});

function getModelsDir() {
  const modelsDir = path.join(app.getPath("userData"), "LocalAI_Models");
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }
  return modelsDir;
}

ipcMain.handle("llama:checkData", async (event, { filename }) => {
  const modelsDir = getModelsDir();
  const filePath = path.join(modelsDir, filename);
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      return { exists: true, size: stats.size, path: filePath };
    }
  } catch (err) { }
  return { exists: false, size: 0, path: filePath };
});

ipcMain.handle("llama:delete", async (event, { filename }) => {
  const modelsDir = getModelsDir();
  const filePath = path.join(modelsDir, filename);
  const partPath = filePath + ".part";
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (fs.existsSync(partPath)) {
      fs.unlinkSync(partPath);
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

import fetch from "node-fetch";

const activeDownloads: Record<string, any> = {};

ipcMain.handle("llama:download", async (event, { url, filename, id }) => {
  const modelsDir = getModelsDir();
  const filePath = path.join(modelsDir, filename);
  const partPath = filePath + ".part";

  try {
    // node-fetch natively follows up to 20 redirects automatically
    const res = await fetch(url);
    if (!res.ok) {
      return { success: false, error: `Failed with status ${res.status}` };
    }

    const totalBytes = parseInt(res.headers.get("content-length") || "0", 10);
    const file = fs.createWriteStream(partPath);
    activeDownloads[id] = { file };

    let downloadedBytes = 0;

    return new Promise((resolve) => {
      res.body.on("data", (chunk: any) => {
        downloadedBytes += chunk.length;
        event.sender.send("llama:download-progress", {
          id,
          bytes: downloadedBytes,
          total: totalBytes
        });
      });

      res.body.pipe(file);

      file.on("finish", () => {
        activeDownloads[id] = null;
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          fs.renameSync(partPath, filePath);
          resolve({ success: true, path: filePath });
        } catch (e: any) {
          resolve({ success: false, error: "Failed to finalize downloaded file: " + e.message });
        }
      });

      file.on("error", (err: any) => {
        activeDownloads[id] = null;
        fs.unlink(partPath, () => { });
        resolve({ success: false, error: err.message });
      });

      res.body.on("error", (err: any) => {
        file.close();
        fs.unlink(partPath, () => { });
        activeDownloads[id] = null;
        resolve({ success: false, error: err.message });
      });

      activeDownloads[id].request = res.body;
    });
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});


ipcMain.handle("llama:cancel-download", async (event, { id }) => {
  if (activeDownloads[id]) {
    if (activeDownloads[id].request) {
      activeDownloads[id].request.destroy();
    }
    if (activeDownloads[id].file) {
      activeDownloads[id].file.close();
    }
    activeDownloads[id] = null;
    return { success: true };
  }
  return { success: false };
});
