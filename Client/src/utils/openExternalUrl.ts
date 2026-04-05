/**
 * openExternalUrl
 * ---------------
 * Cross-platform helper to open an HTTP/HTTPS URL in the user's native
 * browser rather than inside the app WebView / Electron window.
 *
 * Priority order:
 *  1. Electron  → window.electron.openExternal  (IPC → shell.openExternal)
 *  2. Android   → Capacitor App.openUrl         (fires Android Intent)
 */
import { Capacitor } from "@capacitor/core";

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

  // ── Android / Web Fallback ────────────────────────────────────────────────
  // On Android, the WebView + our MainActivity.java navigation guard will
  // intercept this navigation, launch an ACTION_VIEW Intent, and cancel the
  // webview load. On web, this simply opens a new tab.
  window.open(url, "_blank", "noopener,noreferrer");
}
