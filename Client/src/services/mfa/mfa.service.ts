import { mfaSecureStorage } from "./secure-storage.adapter";

const APP_NAME = "CryptNode";
const ISSUER = "CryptNode";
const OTP_ALGORITHM = "SHA1";
const OTP_DIGITS = 6;
const OTP_PERIOD_SECONDS = 30;
const OTP_WINDOW = 1;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export interface MfaOnboardingData {
  secret: string;
  otpAuthUri: string;
  accountName: string;
  issuer: string;
  algorithm: string;
  digits: number;
  period: number;
}

const constantTimeEqual = (a: string, b: string): boolean => {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ac = i < a.length ? a.charCodeAt(i) : 0;
    const bc = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ac ^ bc;
  }
  return diff === 0;
};

const sanitizeToken = (token: string): string => token.replace(/\D/g, "");

const buildOtpAuthUri = (userEmail: string, secret: string): string => {
  const account = `${APP_NAME}:${userEmail}`;
  const label = encodeURIComponent(account);
  const issuer = encodeURIComponent(ISSUER);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=${OTP_ALGORITHM}&digits=${OTP_DIGITS}&period=${OTP_PERIOD_SECONDS}`;
};

const getNow = (): number => Date.now();

const secureRandomBytes = (length: number): Uint8Array => {
  const out = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(out);
    return out;
  }
  throw new Error("Secure random generator unavailable on this platform.");
};

const toBase32 = (bytes: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
};

const fromBase32 = (input: string): Uint8Array => {
  const normalized = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const c of normalized) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(out);
};

const toCounterBytes = (counter: number): Uint8Array => {
  const out = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i -= 1) {
    out[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  return out;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

const hotp = async (secretBase32: string, counter: number): Promise<string> => {
  const keyBytes = fromBase32(secretBase32);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    toArrayBuffer(toCounterBytes(counter)),
  );
  const hmac = new Uint8Array(signature);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = code % 10 ** OTP_DIGITS;
  return otp.toString().padStart(OTP_DIGITS, "0");
};

const totpAt = async (secretBase32: string, epochMs: number): Promise<string> => {
  const counter = Math.floor(epochMs / 1000 / OTP_PERIOD_SECONDS);
  return hotp(secretBase32, counter);
};

export const mfaService = {
  generateSecret(): string {
    // 20 bytes => 32 Base32 chars, compatible with authenticator apps.
    return toBase32(secureRandomBytes(20));
  },

  createOnboardingData(userEmail: string, secret: string): MfaOnboardingData {
    return {
      secret,
      otpAuthUri: buildOtpAuthUri(userEmail, secret),
      accountName: `${APP_NAME}:${userEmail}`,
      issuer: ISSUER,
      algorithm: OTP_ALGORITHM,
      digits: OTP_DIGITS,
      period: OTP_PERIOD_SECONDS,
    };
  },

  async getOrCreateSecret(userEmail: string): Promise<string> {
    const existing = await mfaSecureStorage.getVaultMfaSecret(userEmail);
    if (existing) return existing;
    const secret = this.generateSecret();
    await mfaSecureStorage.setVaultMfaSecret(userEmail, secret);
    return secret;
  },

  async getOnboardingData(userEmail: string): Promise<MfaOnboardingData> {
    const secret = await this.getOrCreateSecret(userEmail);
    return this.createOnboardingData(userEmail, secret);
  },

  async isEnabled(userEmail: string): Promise<boolean> {
    const secret = await mfaSecureStorage.getVaultMfaSecret(userEmail);
    return !!secret;
  },

  async isProvisioned(userEmail: string): Promise<boolean> {
    return mfaSecureStorage.isVaultMfaProvisioned(userEmail);
  },

  async setProvisioned(userEmail: string, value: boolean): Promise<void> {
    await mfaSecureStorage.setVaultMfaProvisioned(userEmail, value);
  },

  async verifyToken(
    secret: string,
    token: string,
    nowMs: number = getNow(),
  ): Promise<boolean> {
    const cleaned = sanitizeToken(token);
    if (!/^\d{6}$/.test(cleaned)) return false;
    for (let offset = -OTP_WINDOW; offset <= OTP_WINDOW; offset += 1) {
      const epochMs = nowMs + offset * OTP_PERIOD_SECONDS * 1000;
      const expected = await totpAt(secret, epochMs);
      if (constantTimeEqual(expected, cleaned)) {
        return true;
      }
    }
    return false;
  },

  async verifyUserToken(userEmail: string, token: string): Promise<boolean> {
    const secret = await mfaSecureStorage.getVaultMfaSecret(userEmail);
    if (!secret) return false;
    return this.verifyToken(secret, token);
  },
};
