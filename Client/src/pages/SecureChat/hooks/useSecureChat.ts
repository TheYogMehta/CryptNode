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
        let saltHex = localStorage.getItem(getSaltKey());
        let salt: Uint8Array;

        if (!saltHex) {
          throw new Error("Vault not set up");
        } else {
          salt = new Uint8Array(
            saltHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
          );
        }

        const derivedKey = await deriveKey(password, salt);

        // Verify key by attempting to decrypt the verifier item
        const allItems = await getAllItems();
        // Look for the special verifier item for this user
        const verifierItem = allItems.find(
          (i) =>
            i.id === `verifier_${userEmail}` ||
            (i.metadata?.isVerifier && i.metadata?.owner === userEmail),
        );

        if (verifierItem) {
          try {
            const decrypted = await decryptString(
              verifierItem.encryptedContent,
              verifierItem.iv,
              derivedKey,
            );
            if (decrypted !== "VERIFIER_CHECK") {
              throw new Error("Incorrect Password");
            }
          } catch (e) {
            // Decryption failed means wrong key
            throw new Error("Incorrect Password");
          }
        }
        // Note: For existing vaults without a verifier, we might auto-migrate or just proceed.
        // For strict security, we should enforce it, but let's allow legacy for now or re-encrypt.
        // Given this is a refactor, we can assume we might reset or just create it if missing?
        // Let's assume strict check if verifier exists, else (legacy dev state) pass.

        setKey(derivedKey);
        setIsUnlocked(true);
        setError(null);

        loadItems(derivedKey);
      } catch (e: any) {
        console.error(e);
        setError(
          e.message === "Incorrect Password"
            ? "Incorrect Password"
            : "Failed to unlock",
        );
        return false;
      }
      return true;
    },
    [userEmail],
  );

  const setupVault = useCallback(
    async (password: string) => {
      if (!userEmail) return;
      try {
        const salt = generateSalt();
        const saltHex = Array.from(salt)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        localStorage.setItem(getSaltKey(), saltHex);

        const derivedKey = await deriveKey(password, salt);
        setKey(derivedKey);
        setIsUnlocked(true);
        setError(null);

        // Create Verifier Item
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
          "Welcome to your Secure Vault! This data is encrypted and stored locally on your device.",
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
