import type { CapacitorElectronConfig } from "@capacitor-community/electron";
import {
  CapElectronEventEmitter,
  CapacitorSplashScreen,
  setupCapacitorElectronPlugins,
} from "@capacitor-community/electron";
import type { MenuItemConstructorOptions } from "electron";
import {
  app,
  BrowserWindow,
  Menu,
  MenuItem,
  nativeImage,
  shell,
  Tray,
  session,
} from "electron";
import windowStateKeeper from "electron-window-state";
import { join } from "path";
import { createServer } from "http";
import handler from "serve-handler";

// Define our class to manage our app.
export class ElectronCapacitorApp {
  private MainWindow: BrowserWindow | null = null;
  private SplashScreen: CapacitorSplashScreen | null = null;
  private TrayIcon: Tray | null = null;
  private CapacitorFileConfig: CapacitorElectronConfig;
  private TrayMenuTemplate: (MenuItem | MenuItemConstructorOptions)[] = [
    new MenuItem({ label: "Quit App", role: "quit" }),
  ];
  private AppMenuBarMenuTemplate: (MenuItem | MenuItemConstructorOptions)[] = [
    { role: process.platform === "darwin" ? "appMenu" : "fileMenu" },
    { role: "viewMenu" },
  ];
  private mainWindowState;
  private loadWebApp;
  private customScheme: string;

  constructor(
    capacitorFileConfig: CapacitorElectronConfig,
    trayMenuTemplate?: (MenuItemConstructorOptions | MenuItem)[],
    appMenuBarMenuTemplate?: (MenuItemConstructorOptions | MenuItem)[],
  ) {
    this.CapacitorFileConfig = capacitorFileConfig;

    this.customScheme =
      this.CapacitorFileConfig.electron?.customUrlScheme ??
      "capacitor-electron";

    if (trayMenuTemplate) {
      this.TrayMenuTemplate = trayMenuTemplate;
    }

    if (appMenuBarMenuTemplate) {
      this.AppMenuBarMenuTemplate = appMenuBarMenuTemplate;
    }

    // Setup our web app loader, this lets us load apps like react, vue, and angular without changing their build chains.
    // this.loadWebApp = electronServe({
    //   directory: join(app.getAppPath(), "app"),
    //   scheme: this.customScheme,
    // });
  }

  // Helper function to load in the app.
  private async loadMainWindow(thisRef: any) {
    // await thisRef.loadWebApp(thisRef.MainWindow);
    const server = createServer((request, response) => {
      return handler(request, response, {
        public: join(app.getAppPath(), "app"),
        rewrites: [{ source: "**", destination: "/index.html" }],
        headers: [
          {
            source: "**/*.@(js|css|html|json)",
            headers: [
              {
                key: "Cache-Control",
                value: "no-cache, no-store, must-revalidate",
              },
            ],
          },
          {
            source: "**/*.@(jpg|jpeg|gif|png|svg|ico)",
            headers: [
              {
                key: "Cache-Control",
                value: "max-age=31536000",
              },
            ],
          },
        ],
      });
    });

    server.listen(5173, () => {
      console.log("Running at http://localhost:5173");
      void thisRef.MainWindow.webContents.session
        .clearCache()
        .then(() =>
          thisRef.MainWindow.webContents.session.clearStorageData({
            storages: ["serviceworkers"],
          }),
        )
        .finally(() => {
          thisRef.MainWindow.loadURL("http://localhost:5173");
        });
    });
  }

  // Expose the mainWindow ref for use outside of the class.
  getMainWindow(): BrowserWindow {
    return this.MainWindow;
  }

  getCustomURLScheme(): string {
    return this.customScheme;
  }

  async init(): Promise<void> {
    const icon = nativeImage.createFromPath(
      join(
        app.getAppPath(),
        "assets",
        process.platform === "win32" ? "appIcon.ico" : "appIcon.png",
      ),
    );
    this.mainWindowState = windowStateKeeper({
      defaultWidth: 1000,
      defaultHeight: 800,
    });
    // Setup preload script path and construct our main window.
    const preloadPath = join(app.getAppPath(), "build", "src", "preload.js");
    this.MainWindow = new BrowserWindow({
      icon,
      show: false,
      x: this.mainWindowState.x,
      y: this.mainWindowState.y,
      width: this.mainWindowState.width,
      height: this.mainWindowState.height,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        plugins: true,
        preload: preloadPath,
      },
    });
    this.mainWindowState.manage(this.MainWindow);

    if (this.CapacitorFileConfig.backgroundColor) {
      this.MainWindow.setBackgroundColor(
        this.CapacitorFileConfig.electron.backgroundColor,
      );
    }

    // If we close the main window with the splashscreen enabled we need to destory the ref.
    this.MainWindow.on("closed", () => {
      if (
        this.SplashScreen?.getSplashWindow() &&
        !this.SplashScreen.getSplashWindow().isDestroyed()
      ) {
        this.SplashScreen.getSplashWindow().close();
      }
    });

    // When the tray icon is enabled, setup the options.
    if (this.CapacitorFileConfig.electron?.trayIconAndMenuEnabled) {
      this.TrayIcon = new Tray(icon);
      this.TrayIcon.on("double-click", () => {
        if (this.MainWindow) {
          if (this.MainWindow.isVisible()) {
            this.MainWindow.hide();
          } else {
            this.MainWindow.show();
            this.MainWindow.focus();
          }
        }
      });
      this.TrayIcon.on("click", () => {
        if (this.MainWindow) {
          if (this.MainWindow.isVisible()) {
            this.MainWindow.hide();
          } else {
            this.MainWindow.show();
            this.MainWindow.focus();
          }
        }
      });
      this.TrayIcon.setToolTip(app.getName());
      this.TrayIcon.setContextMenu(
        Menu.buildFromTemplate(this.TrayMenuTemplate),
      );
    }

    // Setup the main manu bar at the top of our window.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(this.AppMenuBarMenuTemplate),
    );

    // If the splashscreen is enabled, show it first while the main window loads then switch it out for the main window, or just load the main window from the start.
    if (this.CapacitorFileConfig.electron?.splashScreenEnabled) {
      this.SplashScreen = new CapacitorSplashScreen({
        imageFilePath: join(
          app.getAppPath(),
          "assets",
          this.CapacitorFileConfig.electron?.splashScreenImageName ??
          "splash.png",
        ),
        windowWidth: 400,
        windowHeight: 400,
      });
      this.SplashScreen.init(this.loadMainWindow, this);
    } else {
      this.loadMainWindow(this);
    }

    // ── Navigation Security ─────────────────────────────────────────────────
    // Prevent ANY non-localhost URL from loading inside the main app window.
    // All external links are redirected to the user's default system browser.

    const isLocalUrl = (url: string): boolean => {
      try {
        const { hostname, protocol } = new URL(url);
        return (
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname === "::1" ||
          protocol === `${this.customScheme}:` ||
          protocol === "file:" ||
          protocol === "blob:" ||
          protocol === "data:"
        );
      } catch {
        return false;
      }
    };

    // Block & redirect top-level navigations (e.g. clicking an <a href> with no handler)
    this.MainWindow.webContents.on("will-navigate", (event, newURL) => {
      if (!isLocalUrl(newURL)) {
        event.preventDefault();
        shell.openExternal(newURL).catch(console.error);
      }
    });

    // Block & redirect window.open() / target="_blank" links
    this.MainWindow.webContents.setWindowOpenHandler((details) => {
      if (!isLocalUrl(details.url)) {
        shell.openExternal(details.url).catch(console.error);
      }
      // Always deny a new Electron window — external links go to the system browser
      return { action: "deny" };
    });

    // Block subframe navigations (iframes, <embed> etc.) to external URLs
    this.MainWindow.webContents.on("will-frame-navigate", (event) => {
      const nav = event as any;
      const frameUrl: string = nav.url ?? "";
      if (frameUrl && !isLocalUrl(frameUrl)) {
        event.preventDefault();
        shell.openExternal(frameUrl).catch(console.error);
      }
    });

    // Link electron plugins into the system.
    setupCapacitorElectronPlugins();

    // When the web app is loaded we hide the splashscreen if needed and show the mainwindow.
    this.MainWindow.webContents.on("dom-ready", () => {
      if (this.CapacitorFileConfig.electron?.splashScreenEnabled) {
        this.SplashScreen.getSplashWindow().hide();
      }
      if (!this.CapacitorFileConfig.electron?.hideMainWindowOnLaunch) {
        this.MainWindow.show();
      }
      setTimeout(() => {
        CapElectronEventEmitter.emit(
          "CAPELECTRON_DeeplinkListenerInitialized",
          "",
        );
      }, 400);
    });
  }
}

// Set a CSP up for our application based on the custom scheme
export function setupContentSecurityPolicy(customScheme: string): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Normalize header keys to lowercase to ensure we overwrite correctly
    const headers: Record<string, string[]> = {};
    for (const key of Object.keys(details.responseHeaders)) {
      headers[key.toLowerCase()] = details.responseHeaders[key];
    }

    // Remove headers that restrict framing
    delete headers["x-frame-options"];
    delete headers["frame-options"];
    delete headers["content-security-policy-report-only"];

    const csp = `
      default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;
      connect-src * ws: wss: data: blob:;
      img-src * data: blob:;
      style-src * 'unsafe-inline';
      font-src *;
      script-src * 'unsafe-inline' 'unsafe-eval' data: blob:;
      worker-src * data: blob: 'unsafe-inline' 'unsafe-eval';
      frame-src * blob: data:;
      object-src * blob: data:;
      frame-ancestors *;
    `;

    // Overwrite with our permissive CSP
    headers["content-security-policy"] = [csp.replace(/\s+/g, " ").trim()];

    callback({
      responseHeaders: headers,
    });
  });
}
