export const VAULT_DIR = "cryptnode_vault";
export const PROFILE_DIR = "cryptnode_profiles";
export const CHUNK_SIZE = 256000;
import { Directory } from "@capacitor/filesystem";

export const StorageUtils = {
  isLocalSystemPath(fileName: string): boolean {
    return fileName.startsWith("/") || fileName.includes("://");
  },

  resolvePath(fileName: string): { path: string; directory?: Directory } {
    if (this.isLocalSystemPath(fileName)) {
      return { path: fileName };
    }
    return {
      path: `${VAULT_DIR}/${fileName}`,
      directory: Directory.Data,
    };
  },

  async getUniqueVaultPath(): Promise<{ fileName: string; path: string }> {
    const fileName = `${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}.bin`;
    const path = `${VAULT_DIR}/${fileName}`;
    return { fileName, path };
  },

  getMimeType(fileName: string, defaultMime?: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase();
    let mime = defaultMime || "application/octet-stream";

    if (!defaultMime) {
      if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";
      else if (ext === "png") mime = "image/png";
      else if (ext === "gif") mime = "image/gif";
      else if (ext === "webp") mime = "image/webp";
      else if (ext === "mp4") mime = "video/mp4";
      else if (ext === "webm") mime = "video/webm";
      else if (ext === "mp3") mime = "audio/mpeg";
      else if (ext === "wav") mime = "audio/wav";
      else if (ext === "ogg") mime = "audio/ogg";
      else if (ext === "m4a") mime = "audio/mp4";
    }

    if (fileName.includes("voice-note") && ext === "webm") {
      mime = "audio/webm";
    }
    return mime;
  },
};
