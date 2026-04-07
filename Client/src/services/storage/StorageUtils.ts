export const VAULT_DIR = "cryptnode_vault";
export const PROFILE_DIR = "cryptnode_profiles";
export const CHUNK_SIZE = 256000;
import { Directory } from "@capacitor/filesystem";
import { getMimeTypeForFileLike } from "../../utils/mediaType";

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
    return getMimeTypeForFileLike({ name: fileName, type: defaultMime });
  },
};
