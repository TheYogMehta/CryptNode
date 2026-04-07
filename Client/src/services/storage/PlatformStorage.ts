import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { StorageService } from "./StorageService";

export const PlatformStorage = {
  saveToDownloads: async (
    vaultFileName: string,
    originalName: string,
  ): Promise<string> => {
    const platform = Capacitor.getPlatform();

    if (platform === "android") {
      const folderName = "Download/cryptnode";

      const perm = await Filesystem.checkPermissions();
      if (perm.publicStorage !== "granted") {
        const req = await Filesystem.requestPermissions();
        if (req.publicStorage !== "granted") {
          throw new Error("STORAGE_PERMISSION_DENIED");
        }
      }

      try {
        await Filesystem.mkdir({
          path: folderName,
          directory: Directory.ExternalStorage,
          recursive: true,
        });
      } catch (e: any) {
        if (e.message && e.message.includes("already exists")) {
        } else {
          try {
            await Filesystem.stat({
              path: folderName,
              directory: Directory.ExternalStorage,
            });
          } catch {
            throw e;
          }
        }
      }

      let finalName = originalName;
      let counter = 1;
      const parts = originalName.split(".");
      const ext = parts.length > 1 ? "." + parts.pop() : "";
      const base = parts.join(".");

      while (true) {
        try {
          await Filesystem.stat({
            path: `${folderName}/${finalName}`,
            directory: Directory.ExternalStorage,
          });
          finalName = `${base} (${counter++})${ext}`;
        } catch {
          break;
        }
      }

      // Read and decrypt the vault file, then write decoded binary to Downloads.
      // StorageService.readFile returns plain base64 (no data URI prefix).
      // Capacitor writeFile without encoding treats `data` as base64 and writes binary.
      const decryptedBase64 = await StorageService.readFile(vaultFileName);
      if (!decryptedBase64) throw new Error("Failed to read vault file");

      await Filesystem.writeFile({
        path: `${folderName}/${finalName}`,
        data: decryptedBase64,
        directory: Directory.ExternalStorage,
        recursive: true,
        // No encoding: Capacitor writes the base64 as binary bytes
      });

      return `Downloads/cryptnode/${finalName}`;
    }

    if (platform === "electron") {
      const decryptedBase64 = await StorageService.readFile(vaultFileName);
      if (!decryptedBase64) {
        throw new Error("Failed to read vault file");
      }

      if (window.electron?.saveToDownloads) {
        return window.electron.saveToDownloads(decryptedBase64, originalName);
      }

      const binaryString = window.atob(decryptedBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes]);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = originalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      return originalName;
    }

    throw new Error(`UNSUPPORTED_PLATFORM: ${platform}`);
  },
};
