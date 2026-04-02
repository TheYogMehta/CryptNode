/**
 * openExternalUrl
 * ---------------
 * Cross-platform helper to open an HTTP/HTTPS URL in the user's native
 * browser rather than inside the app WebView / Electron window.
 *
 * Priority order:
 *  1. Electron  → window.electron.openExternal  (IPC → shell.openExternal)
 *  2. Android   → Capacitor App.openUrl         (fires Android Intent)
 *  3. Web / iOS → window.open with noopener
 */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

export async function openExternalUrl(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;

  // ── Electron ──────────────────────────────────────────────────────────────
  try {
    if (window.electron?.openExternal) {
      const ok = await window.electron.openExternal(url);
      if (ok) return;
    }
  } catch {
    // fall through
  }

  // ── Android (Capacitor) ───────────────────────────────────────────────────
  if (Capacitor.getPlatform() === "android") {
    try {
      // App.openUrl fires an ACTION_VIEW Intent which opens the system browser
      await (App as any).openUrl({ url });
      return;
    } catch {
      // fall through to window.open
    }
  }

  // ── Web / iOS / fallback ─────────────────────────────────────────────────
  window.open(url, "_blank", "noopener,noreferrer");
}
