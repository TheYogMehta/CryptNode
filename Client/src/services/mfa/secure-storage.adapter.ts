import { AccountService } from "../auth/AccountService";
import {
  getKeyFromSecureStorage,
  setKeyFromSecureStorage,
} from "../storage/SafeStorage";

const VAULT_MFA_SECRET_PREFIX = "vault_mfa_secret";
const VAULT_MFA_PROVISIONED_PREFIX = "vault_mfa_provisioned";

export const mfaSecureStorage = {
  async getVaultMfaSecret(userEmail: string): Promise<string | null> {
    const key = await AccountService.getStorageKey(
      userEmail,
      VAULT_MFA_SECRET_PREFIX,
    );
    return getKeyFromSecureStorage(key);
  },

  async setVaultMfaSecret(userEmail: string, secret: string): Promise<void> {
    const key = await AccountService.getStorageKey(
      userEmail,
      VAULT_MFA_SECRET_PREFIX,
    );
    await setKeyFromSecureStorage(key, secret);
  },

  async clearVaultMfaSecret(userEmail: string): Promise<void> {
    const key = await AccountService.getStorageKey(
      userEmail,
      VAULT_MFA_SECRET_PREFIX,
    );
    await setKeyFromSecureStorage(key, "");
  },

  async isVaultMfaProvisioned(userEmail: string): Promise<boolean> {
    const key = await AccountService.getStorageKey(
      userEmail,
      VAULT_MFA_PROVISIONED_PREFIX,
    );
    const raw = await getKeyFromSecureStorage(key);
    return raw === "1";
  },

  async setVaultMfaProvisioned(userEmail: string, value: boolean): Promise<void> {
    const key = await AccountService.getStorageKey(
      userEmail,
      VAULT_MFA_PROVISIONED_PREFIX,
    );
    await setKeyFromSecureStorage(key, value ? "1" : "0");
  },

  async clearVaultMfaProvisioned(userEmail: string): Promise<void> {
    const key = await AccountService.getStorageKey(
      userEmail,
      VAULT_MFA_PROVISIONED_PREFIX,
    );
    await setKeyFromSecureStorage(key, "");
  },
};
