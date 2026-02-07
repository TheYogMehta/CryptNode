export const generateSalt = () => {
  return window.crypto.getRandomValues(new Uint8Array(16));
};

export const generateIV = () => {
  return window.crypto.getRandomValues(new Uint8Array(12));
};

export const deriveKey = async (
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> => {
  const enc = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

export const encryptData = async (
  data: string | Uint8Array,
  key: CryptoKey,
): Promise<{ content: Uint8Array; iv: Uint8Array }> => {
  const iv = generateIV();
  const encodedData =
    typeof data === "string" ? new TextEncoder().encode(data) : data;

  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as any,
    },
    key,
    encodedData as any,
  );

  return {
    content: new Uint8Array(encrypted),
    iv: iv,
  };
};

export const decryptData = async (
  encryptedData: Uint8Array,
  iv: Uint8Array,
  key: CryptoKey,
): Promise<Uint8Array> => {
  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv as any,
    },
    key,
    encryptedData as any,
  );

  return new Uint8Array(decrypted);
};

export const decryptString = async (
  encryptedData: Uint8Array,
  iv: Uint8Array,
  key: CryptoKey,
): Promise<string> => {
  const decrypted = await decryptData(encryptedData, iv, key);
  return new TextDecoder().decode(decrypted);
};

export const generateRandomPassword = (length: number = 16): string => {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let retVal = "";
  const values = new Uint32Array(length);
  window.crypto.getRandomValues(values);
  for (let i = 0; i < length; i++) {
    retVal += charset[values[i] % charset.length];
  }
  return retVal;
};

export function bufferToBase64(buf: Uint8Array): string {
  const binString = Array.from(buf, (byte) => String.fromCodePoint(byte)).join(
    "",
  );
  return btoa(binString);
}

export function base64ToBuffer(base64: string): Uint8Array {
  const binString = atob(base64);
  return Uint8Array.from(binString, (m) => m.codePointAt(0)!);
}
