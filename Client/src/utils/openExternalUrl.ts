export async function openExternalUrl(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;

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
