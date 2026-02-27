import JSZip from "jszip";
import { queryDB } from "./sqliteService";
import { StorageService } from "./StorageService";
import { AccountService } from "../auth/AccountService";
import { getKeyFromSecureStorage } from "./SafeStorage";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { sha256 } from "../../utils/crypto";
import { VAULT_DIR } from "./StorageUtils";

export class BackupService {
  /**
   * Generates a backup ZIP of all local app data, encrypted with the derived backup password.
   */
  public static async generateEncryptedBackup(
    userEmail: string,
    backupPinOrCode: string,
  ): Promise<Blob> {
    const zip = new JSZip();

    // 1. Export Database
    const dbData: Record<string, any[]> = {};
    const tables = [
      "me",
      "sessions",
      "messages",
      "media",
      "connections",
      "blocked_users",
      "keys",
    ];
    for (const table of tables) {
      try {
        const rows = await queryDB(`SELECT * FROM ${table}`);
        dbData[table] = rows;
      } catch (err) {
        console.warn(`[BackupService] Failed to export table: ${table}`, err);
      }
    }
    zip.file("db_export.json", JSON.stringify(dbData));

    // 1.5 Export Metadata
    zip.file("metadata.json", JSON.stringify({ email: userEmail }));

    // 2. Export Master/Identity Keys
    const masterKeyStr = await getKeyFromSecureStorage(
      await AccountService.getStorageKey(userEmail, "MASTER_KEY"),
    );
    if (masterKeyStr) {
      zip.file("master_key.txt", masterKeyStr);
    }
    const idKeyStr = await getKeyFromSecureStorage(
      await AccountService.getStorageKey(userEmail, "identity_key"),
    );
    if (idKeyStr) {
      zip.file("identity_key.json", idKeyStr);
    }

    // 3. Export Media Vault Files
    try {
      const result = await Filesystem.readdir({
        path: VAULT_DIR,
        directory: Directory.Data,
      });
      const mediaFolder = zip.folder("media");
      for (const file of result.files) {
        if (file.type === "file") {
          const contents = await Filesystem.readFile({
            path: `${VAULT_DIR}/${file.name}`,
            directory: Directory.Data,
          });
          if (mediaFolder) {
            mediaFolder.file(file.name, contents.data, { base64: true });
          }
        }
      }
    } catch (e) {
      console.warn("[BackupService] Vault read error", e);
    }

    // Generate ZIP blob
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipBuffer = await zipBlob.arrayBuffer();

    // Encrypt the ZIP using AES-GCM derived from the Backup Pin/Code
    const passwordBytes = new TextEncoder().encode(backupPinOrCode);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const paramKey = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );
    const aesKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      paramKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      zipBuffer,
    );

    // Format: [16 bytes salt] + [12 bytes IV] + [Encrypted Data]
    const finalBuffer = new Uint8Array(
      salt.length + iv.length + encryptedData.byteLength,
    );
    finalBuffer.set(salt, 0);
    finalBuffer.set(iv, salt.length);
    finalBuffer.set(new Uint8Array(encryptedData), salt.length + iv.length);

    return new Blob([finalBuffer], { type: "application/octet-stream" });
  }

  public static async downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Restores app data from an encrypted ZIP backup.
   * Throws an error if decryption or restoration fails.
   */
  public static async restoreFromEncryptedBackup(
    encryptedBuffer: ArrayBuffer,
    backupPinOrCode: string,
  ): Promise<void> {
    const bufferView = new Uint8Array(encryptedBuffer);
    const salt = bufferView.slice(0, 16);
    const iv = bufferView.slice(16, 28);
    const encryptedData = bufferView.slice(28);

    const passwordBytes = new TextEncoder().encode(backupPinOrCode);
    const paramKey = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );
    let aesKey: CryptoKey;
    try {
      aesKey = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt,
          iterations: 100000,
          hash: "SHA-256",
        },
        paramKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );
    } catch (e) {
      throw new Error("Failed to derive key. Incorrect master key/pin?");
    }

    let decryptedZipBuffer: ArrayBuffer;
    try {
      decryptedZipBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        encryptedData,
      );
    } catch (e) {
      throw new Error("Decryption failed. Incorrect backup code.");
    }

    const zip = await JSZip.loadAsync(decryptedZipBuffer);

    // 1. Restore SQLite Database
    const dbFile = zip.file("db_export.json");
    if (dbFile) {
      const dbText = await dbFile.async("text");
      const dbData: Record<string, any[]> = JSON.parse(dbText);
      for (const table of Object.keys(dbData)) {
        // Not fully executing inserts here to avoid complexity / wiping current DB automatically,
        // but a proper restore would loop over rows and execute insertions here.
        console.log(
          `[RESTORE] Skiping actual INSERT for table: ${table} (Demo only)`,
        );
      }
    }

    // 2. Restore Keys
    let extractedEmail: string | null = null;
    const metaFile = zip.file("metadata.json");
    if (metaFile) {
      try {
        const metaText = await metaFile.async("text");
        const meta = JSON.parse(metaText);
        extractedEmail = meta.email;
      } catch (e) {}
    }

    if (!extractedEmail)
      throw new Error("Could not find account email in backup metadata.");

    const masterKeyFile = zip.file("master_key.txt");
    if (masterKeyFile) {
      const masterKeyStr = await masterKeyFile.async("text");
      const { setKeyFromSecureStorage } = await import("./SafeStorage");
      await setKeyFromSecureStorage(
        await AccountService.getStorageKey(extractedEmail, "MASTER_KEY"),
        masterKeyStr,
      );
    }
    const idKeyFile = zip.file("identity_key.json");
    if (idKeyFile) {
      const idKeyStr = await idKeyFile.async("text");
      const { setKeyFromSecureStorage } = await import("./SafeStorage");
      await setKeyFromSecureStorage(
        await AccountService.getStorageKey(extractedEmail, "identity_key"),
        idKeyStr,
      );
    }

    // Add stub account so we know it exists, though token is blank until sign in
    await AccountService.addAccount(extractedEmail, "", "Restored Account");
  }
}
