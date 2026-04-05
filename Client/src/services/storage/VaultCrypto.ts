// VaultCrypto definition
import { sha256 } from "../../utils/crypto";

export const VAULT_ENC_PREFIX = "VAULT_ENC_V1:";

async function getVaultKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(passphrase));
  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

export const VaultCrypto = {
  async encrypt(data: string, passphrase: string | null): Promise<string> {
    if (!passphrase) return data; // Fallback to plaintext if no key
    try {
      const key = await getVaultKey(passphrase);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(data);
      
      const cipherText = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv,
        },
        key,
        encoded
      );

      const ivBase64 = arrayBufferToBase64(iv.buffer);
      const cipherBase64 = arrayBufferToBase64(cipherText);
      
      // Pack into format VAULT_ENC_V1:[IV_BASE64]:[CIPHER_BASE64]
      return `${VAULT_ENC_PREFIX}${ivBase64}:${cipherBase64}`;
    } catch (e) {
      console.error("[VaultCrypto] Encryption failed", e);
      return data; // Fallback to plaintext on failure
    }
  },

  async decrypt(data: string, passphrase: string | null): Promise<string> {
    if (!data.startsWith(VAULT_ENC_PREFIX)) {
      return data; // Not encrypted or legacy format
    }
    if (!passphrase) {
      console.error("[VaultCrypto] Cannot decrypt file: no passphrase provided");
      throw new Error("Missing decryption key for vault file");
    }

    try {
      const parts = data.split(":");
      if (parts.length !== 3) {
        throw new Error("Invalid encrypted vault file format");
      }
      
      const ivBase64 = parts[1];
      const cipherBase64 = parts[2];
      
      const iv = base64ToArrayBuffer(ivBase64);
      const cipherText = base64ToArrayBuffer(cipherBase64);
      const key = await getVaultKey(passphrase);
      
      const decrypted = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: new Uint8Array(iv),
        },
        key,
        cipherText
      );
      
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      console.error("[VaultCrypto] Decryption failed", e);
      throw e;
    }
  }
};
