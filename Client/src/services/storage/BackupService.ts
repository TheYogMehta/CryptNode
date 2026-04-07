import JSZip from "jszip";
import { queryDB, executeDB, switchDatabase, tableOrder } from "./sqliteService";
import { AccountService } from "../auth/AccountService";
import { getKeyFromSecureStorage, setKeyFromSecureStorage } from "./SafeStorage";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { VAULT_DIR, PROFILE_DIR } from "./StorageUtils";
import { hashIdentifier } from "./SafeStorage";

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
    const dbData: Record<string, unknown[]> = {};
    const tables = tableOrder;
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
    const accounts = await AccountService.getAccounts();
    const account = accounts.find((a) => a.email === userEmail);
    zip.file(
      "metadata.json",
      JSON.stringify({
        email: userEmail,
        displayName: account?.displayName,
        avatarUrl: account?.avatarUrl,
      }),
    );

    // 1.8 Export Profile Image
    try {
      const candidates: string[] = [];
      if (account?.avatarUrl && !account.avatarUrl.startsWith("http") && !account.avatarUrl.startsWith("data:")) {
        candidates.push(account.avatarUrl);
      }
      const emailHash = await hashIdentifier(userEmail);
      candidates.push(`${emailHash}.jpg`);
      const dbName = await AccountService.getDbName(userEmail);
      candidates.push(`${dbName}.jpg`);

      for (const fileName of candidates) {
        try {
          const fileData = await Filesystem.readFile({
            path: `${PROFILE_DIR}/${fileName}`,
            directory: Directory.Data,
          });
          if (fileData.data) {
            zip.file("profile_image.jpg", fileData.data, { base64: true });
            break; // found it
          }
        } catch (err: any) {
          // Continue to next candidate
        }
      }
    } catch (e) {
      console.warn("[BackupService] Profile image read error", e);
    }

    // 2. Export Master/Identity Keys
    const masterKeyStr = await getKeyFromSecureStorage(
      await AccountService.getStorageKey(userEmail, "MASTER_KEY"),
    );
    if (masterKeyStr) {
      zip.file("master_key.txt", masterKeyStr);
    }
    const idKeyStr = await getKeyFromSecureStorage(
      await AccountService.getStorageKey(userEmail, "identity_priv"),
    );
    if (idKeyStr) {
      zip.file("identity_priv.json", idKeyStr);
    }
    const pubKeyStr = await getKeyFromSecureStorage(
      await AccountService.getStorageKey(userEmail, "identity_pub"),
    );
    if (pubKeyStr) {
      zip.file("identity_pub.json", pubKeyStr);
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
  ): Promise<string> {
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
    } catch {
      throw new Error("Failed to derive key. Incorrect master key/pin?");
    }

    let decryptedZipBuffer: ArrayBuffer;
    try {
      decryptedZipBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        encryptedData,
      );
    } catch {
      throw new Error("Decryption failed. Incorrect backup code.");
    }

    const zip = await JSZip.loadAsync(decryptedZipBuffer);

    // 1. Restore account metadata first (email is required for scoped keys/db)
    let extractedEmail: string | null = null;
    let extractedName: string | undefined = undefined;
    let extractedAvatar: string | undefined = undefined;

    const metaFile = zip.file("metadata.json");
    if (metaFile) {
      try {
        const metaText = await metaFile.async("text");
        const meta = JSON.parse(metaText);
        extractedEmail = meta.email;
        extractedName = meta.displayName;
        extractedAvatar = meta.avatarUrl;
      } catch {
        extractedEmail = null;
      }
    }

    if (!extractedEmail)
      throw new Error("Could not find account email in backup metadata.");

    const masterKeyFile = zip.file("master_key.txt");
    if (masterKeyFile) {
      const masterKeyStr = await masterKeyFile.async("text");
      await setKeyFromSecureStorage(
        await AccountService.getStorageKey(extractedEmail, "MASTER_KEY"),
        masterKeyStr,
      );

      const dbName = await AccountService.getDbName(extractedEmail);
      await switchDatabase(dbName, masterKeyStr);

      // 2. Restore SQLite tables now that account DB is active.
      const dbFile = zip.file("db_export.json");
      if (dbFile) {
        const dbText = await dbFile.async("text");
        const dbData: Record<string, Record<string, unknown>[]> =
          JSON.parse(dbText);
        // use the imported tableOrder
        const safeIdentifier = (name: string): string => {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
            throw new Error(`Unsafe SQL identifier in backup: ${name}`);
          }
          return name;
        };
        const orderedTables = tableOrder.filter((t) => Array.isArray(dbData[t]));
        for (const extraTable of Object.keys(dbData)) {
          if (!orderedTables.includes(extraTable)) orderedTables.push(extraTable);
        }

        await executeDB("PRAGMA foreign_keys = OFF");
        for (const table of orderedTables) {
          const rows = dbData[table];
          if (!Array.isArray(rows)) continue;
          const safeTable = safeIdentifier(table);
          await executeDB(`DELETE FROM ${safeTable}`);
          for (const row of rows) {
            const safeRow =
              row && typeof row === "object"
                ? (row as Record<string, unknown>)
                : {};
            const cols = Object.keys(safeRow).filter(
              (c) => safeRow[c] !== undefined,
            );
            if (!cols.length) continue;
            const safeCols = cols.map(safeIdentifier);
            const placeholders = safeCols.map(() => "?").join(", ");
            const values = cols.map((c) => safeRow[c]);
            await executeDB(
              `INSERT OR REPLACE INTO ${safeTable} (${safeCols.join(", ")}) VALUES (${placeholders})`,
              values,
            );
          }
        }
        await executeDB("PRAGMA foreign_keys = ON");
      }
    }

    const identityPrivFile = zip.file("identity_priv.json");
    const identityPubFile = zip.file("identity_pub.json");

    if (identityPrivFile) {
      const idKeyStr = await identityPrivFile.async("text");
      await setKeyFromSecureStorage(
        await AccountService.getStorageKey(extractedEmail, "identity_priv"),
        idKeyStr,
      );
    }
    if (identityPubFile) {
      const pubKeyStr = await identityPubFile.async("text");
      await setKeyFromSecureStorage(
        await AccountService.getStorageKey(extractedEmail, "identity_pub"),
        pubKeyStr,
      );
    }

    // 2.5 Restore Profile Image
    const profileImageFile = zip.file("profile_image.jpg");
    if (profileImageFile) {
      try {
        const emailHash = await hashIdentifier(extractedEmail);
        const base64Data = await profileImageFile.async("base64");

        try {
          await Filesystem.mkdir({
            path: PROFILE_DIR,
            directory: Directory.Data,
            recursive: true,
          });
        } catch (e) {
          // Ignore if exists
        }

        await Filesystem.writeFile({
          path: `${PROFILE_DIR}/${emailHash}.jpg`,
          data: base64Data,
          directory: Directory.Data,
          recursive: true,
        });

        // Update the extractedAvatar to point to the local file we just restored
        extractedAvatar = `${emailHash}.jpg`;
      } catch (e) {
        console.warn("Failed to restore profile image", e);
      }
    }

    // 3. Restore media vault files.
    for (const [path, file] of Object.entries(zip.files)) {
      if (!path.startsWith("media/") || file.dir) continue;
      const fileName = path.slice("media/".length);
      if (!fileName) continue;
      const base64Data = await file.async("base64");
      await Filesystem.writeFile({
        path: `${VAULT_DIR}/${fileName}`,
        data: base64Data,
        directory: Directory.Data,
        recursive: true,
      });
    }

    // Add stub account so we know it exists. If it already exists, keep its token so we don't log the user out.
    const existingAccounts = await AccountService.getAccounts();
    const existingAccount = existingAccounts.find(a => a.email === extractedEmail);
    const tokenToKeep = existingAccount ? existingAccount.token : "";
    await AccountService.addAccount(extractedEmail, tokenToKeep, existingAccount?.displayName || "Restored Account", existingAccount?.avatarUrl);

    return extractedEmail;
  }
}
