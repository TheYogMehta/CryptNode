import { useState, useCallback, useEffect } from "react";
import {
  deriveKey,
  encryptData,
  decryptString,
  decryptData,
  generateSalt,
} from "../../../utils/crypto";
import {
  storeItem,
  getAllItems,
  deleteItem,
  VaultItem,
} from "../../../utils/secureStorage";
import { v4 as uuidv4 } from "uuid";
import ChatClient from "../../../services/ChatClient";
import { AccountService } from "../../../services/AccountService";
import { getKeyFromSecureStorage } from "../../../services/SafeStorage";

export const useSecureChat = () => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Get current user email for namespacing
  const userEmail = ChatClient.userEmail;

  const getSaltKey = () => `secure_chat_salt_${userEmail}`;

  const unlock = useCallback(
    async (password: string) => {
      if (!userEmail) return;
      try {
        // 1. Verify PIN
        const pinKey = await AccountService.getStorageKey(
          userEmail,
          "app_lock_pin",
        );
        const storedPin = await getKeyFromSecureStorage(pinKey);

        if (storedPin !== password) {
          throw new Error("Incorrect Password");
        }

        // 2. Get Master Key
        const masterStorageKey = await AccountService.getStorageKey(
          userEmail,
          "MASTER_KEY",
        );
        const mnemonic = await getKeyFromSecureStorage(masterStorageKey);

        if (!mnemonic) {
          throw new Error("Master Key not found. Please reset profile.");
        }

        // 3. Derive Encryption Key from Master Key (Mnemonic)
        // We use a fixed salt for Master Key derivation to ensure determinism
        // since the mnemonic ITSELF is high entropy.
        // Or we can use the stored salt if we want to be extra safe, but
        // typically the mnemonic + passphrase (optional) is the seed.
        // Let's use the existing salt mechanism but applied to the mnemonic.

        let saltHex = localStorage.getItem(getSaltKey());
        let salt: Uint8Array;

        if (!saltHex) {
          // If no salt exists, we might be in a weird state or first run.
          // But valid vault should have salt.
          // If we really want to switch to Master Key, we should validly have salt.
          // For now, let's auto-generate if missing (implied setup) or error.
          // Let's stick to error if missing for unlock.
          throw new Error("Vault integrity error: Salt missing");
        } else {
          salt = new Uint8Array(
            saltHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
          );
        }

        const derivedKey = await deriveKey(mnemonic, salt);

        setKey(derivedKey);
        setIsUnlocked(true);
        setError(null);

        loadItems(derivedKey);
      } catch (e: any) {
        console.error(e);
        setError(
          e.message === "Incorrect Password"
            ? "Incorrect Password"
            : "Failed to unlock: " + e.message,
        );
        return false;
      }
      return true;
    },
    [userEmail],
  );

  const setupVault = useCallback(
    async (password: string) => {
      // NOTE: In the new flow, 'password' here is the PIN user just set/confirmed
      // But setupVault is slightly redundant now because ProfileSetup handles PIN and Master Key.
      // However, we still need to initialize the 'salt' and maybe a welcome message.
      if (!userEmail) return;
      try {
        // 1. Verify PIN (Optional, but good sanity check if we passed it in)
        // Actually, ProfileSetup just calls this on success.

        // 2. Ensure Master Key Exists
        const masterStorageKey = await AccountService.getStorageKey(
          userEmail,
          "MASTER_KEY",
        );
        const mnemonic = await getKeyFromSecureStorage(masterStorageKey);

        if (!mnemonic) {
          throw new Error(
            "Master Key not found. Complete profile setup first.",
          );
        }

        // 3. Generate/Get Salt
        let saltHex = localStorage.getItem(getSaltKey());
        if (!saltHex) {
          const salt = generateSalt();
          saltHex = Array.from(salt)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          localStorage.setItem(getSaltKey(), saltHex);
        }

        const salt = new Uint8Array(
          saltHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
        );

        // 4. Derive Key from Mnemonic
        const derivedKey = await deriveKey(mnemonic, salt);
        setKey(derivedKey);
        setIsUnlocked(true);
        setError(null);

        // Create Verifier Item (using Mnemonic-derived key)
        const { content: encryptedVerifier, iv: verifierIv } =
          await encryptData("VERIFIER_CHECK", derivedKey);
        await storeItem({
          id: `verifier_${userEmail}`,
          type: "text",
          encryptedContent: encryptedVerifier,
          iv: verifierIv,
          metadata: { owner: userEmail, isVerifier: true },
          timestamp: Date.now(),
        });

        // Create a welcome note
        await addItemWithKey(
          derivedKey,
          "text",
          "Welcome to your Secure Vault! This data is encrypted using your Master Key.",
          { title: "Welcome" },
        );
        loadItems(derivedKey);
      } catch (e: any) {
        setError("Setup failed: " + e.message);
      }
    },
    [userEmail],
  );

  const loadItems = async (currentKey: CryptoKey) => {
    try {
      // Filter items by userEmail if we add user separation to IndexedDB too.
      // For now, since it's local only, we might want to filter by ownership or use separate stores.
      // But for this refactor, let's just filter by a naming convention or metadata?
      // Actually, since encryption key depends on user password, other user's items won't decrypt properly anyway (garbage),
      // but it's cleaner to only show owned items.
      // Let's assume we filter by metadata.owner if we add it, or just rely on encryption.
      // UPDATED PLAN: Add `owner` field to metadata.

      const all = await getAllItems();
      const myItems = all.filter((i) => i.metadata?.owner === userEmail);

      setItems(myItems.sort((a, b) => b.timestamp - a.timestamp));
    } catch (e) {
      console.error("Failed to load items", e);
    }
  };

  const addItem = useCallback(
    async (
      type: "text" | "file" | "password",
      content: string | Uint8Array,
      metadata: any = {},
    ) => {
      if (!key || !userEmail) return;
      await addItemWithKey(key, type, content, {
        ...metadata,
        owner: userEmail,
      });
      loadItems(key);
    },
    [key, userEmail],
  );

  const addItemWithKey = async (
    k: CryptoKey,
    type: "text" | "file" | "password",
    content: string | Uint8Array,
    metadata: any,
  ) => {
    const { content: encrypted, iv } = await encryptData(content, k);
    const item: VaultItem = {
      id: uuidv4(),
      type,
      encryptedContent: encrypted,
      iv,
      metadata,
      timestamp: Date.now(),
    };
    await storeItem(item);
  };

  const removeItem = useCallback(
    async (id: string) => {
      await deleteItem(id);
      if (key) loadItems(key);
    },
    [key],
  );

  const decryptItemContent = useCallback(
    async (item: VaultItem) => {
      if (!key) throw new Error("Locked");
      if (item.type === "text" || item.type === "password") {
        return decryptString(item.encryptedContent, item.iv, key);
      } else {
        return decryptData(item.encryptedContent, item.iv, key);
      }
    },
    [key],
  );

  const isSetup = userEmail ? !!localStorage.getItem(getSaltKey()) : false;

  return {
    isUnlocked,
    isSetup,
    unlock,
    setupVault,
    items,
    addItem,
    removeItem,
    decryptItemContent,
    error,
  };
};
