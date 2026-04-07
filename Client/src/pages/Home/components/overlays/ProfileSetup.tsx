// @ts-nocheck
import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { executeDB, queryDB } from "../../../../services/storage/sqliteService";
import { AccountService } from "../../../../services/auth/AccountService";
import {
  getKeyFromSecureStorage,
  setKeyFromSecureStorage,
} from "../../../../services/storage/SafeStorage";
import { StorageService } from "../../../../services/storage/StorageService";
import { avatarCacheService } from "../../../../services/storage/AvatarCacheService";
import { AppLockScreen } from "./AppLockScreen";
import { Clipboard } from "@capacitor/clipboard";
import * as bip39 from "bip39";
import { Buffer } from "buffer";
import { ChatClient } from "../../../../services/core/ChatClient";
import { useForm } from "react-hook-form";
import { colors, radii } from "../../../../theme/design-system";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogBadge,
  InputField,
} from "./Overlay.styles";
import { AppScreenLayout } from "./AppScreenLayout";
import { Button } from "../../../../components/ui/Button";
import { BlockingProgressOverlay } from "./BlockingProgressOverlay";

(window as any).Buffer = Buffer;

interface ProfileSetupProps {
  userEmail: string;
  onComplete: () => void;
}

export const ProfileSetup: React.FC<ProfileSetupProps> = ({
  userEmail,
  onComplete,
}) => {
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<{ username: string }>();

  const [avatar, setAvatar] = useState<string | null>(null);
  const [step, setStep] = useState<
    "loading" | "master_key" | "profile" | "pin"
  >("loading");

  // Master Key State
  const [masterKey, setMasterKey] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [shouldShowMasterKeyAfterPin, setShouldShowMasterKeyAfterPin] =
    useState(false);

  // PIN state
  const [tempPin, setTempPin] = useState("");
  const [setupError, setSetupError] = useState("");

  useEffect(() => {
    checkProfile();
  }, [userEmail]);

  const resolveStoredAvatar = async (avatarUrl?: string | null) => {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith("data:") || avatarUrl.startsWith("http")) {
      return avatarUrl;
    }
    return await avatarCacheService.getAvatar(avatarUrl);
  };

  const checkProfile = async () => {
    try {
      // 1. Check/Generate Master Key
      const storageKey = await AccountService.getStorageKey(
        userEmail,
        "MASTER_KEY",
      );
      const pendingRevealKey = await AccountService.getStorageKey(
        userEmail,
        "MASTER_KEY_PENDING_REVEAL",
      );
      let key = await getKeyFromSecureStorage(storageKey);
      let needsMasterKeyReveal =
        (await getKeyFromSecureStorage(pendingRevealKey)) === "1";

      if (!key) {
        // Generate new 12-word mnemonic for new accounts
        key = bip39.generateMnemonic(128); // 12 words
        await setKeyFromSecureStorage(storageKey, key);
        await setKeyFromSecureStorage(pendingRevealKey, "1");
        setMasterKey(key);
        setShouldShowMasterKeyAfterPin(true);
        needsMasterKeyReveal = true;
      }

      if (key && needsMasterKeyReveal) {
        setMasterKey(key);
      }

      setShouldShowMasterKeyAfterPin(needsMasterKeyReveal);

      // Legacy hex key conversion (if any)
      if (key && !key.includes(" ") && /^[0-9a-fA-F]+$/.test(key)) {
        try {
          const mnemonic = bip39.entropyToMnemonic(key);
          key = mnemonic;
          setMasterKey(mnemonic);
          // Don't trap them on login if it's just legacy conversion, only show on fresh setup
          // but we will update it in storage quietly.
          await setKeyFromSecureStorage(storageKey, mnemonic);
        } catch (e) {
          console.log("Failed to convert hex to mnemonic", e);
        }
      }

      // 2. Check Profile so we can recover first-run accounts whose key was
      // generated before the reveal flag was set.
      const rows = await queryDB(
        "SELECT public_name, public_avatar FROM me WHERE id = 1",
      );
      const hasProfile = rows.length > 0 && rows[0].public_name;
      const accounts = await AccountService.getAccounts();
      const currentAccount = accounts.find(
        (account) => account.email.toLowerCase() === userEmail.toLowerCase(),
      );

      if (!getValues("username")) {
        setValue(
          "username",
          currentAccount?.displayName || userEmail.split("@")[0],
        );
      }

      if (!hasProfile && !avatar && currentAccount?.avatarUrl) {
        const accountAvatar = await resolveStoredAvatar(currentAccount.avatarUrl);
        if (accountAvatar) {
          setAvatar(accountAvatar);
        }
      }

      if (key && !needsMasterKeyReveal && !hasProfile) {
        await setKeyFromSecureStorage(pendingRevealKey, "1");
        setMasterKey(key);
        needsMasterKeyReveal = true;
        setShouldShowMasterKeyAfterPin(true);
      }

      // 3. Check PIN
      const pinKey = await AccountService.getStorageKey(
        userEmail,
        "app_lock_pin",
      );
      const storedPin = await getKeyFromSecureStorage(pinKey);
      const hasPin = !!storedPin;

      if (!hasPin) {
        setStep("pin");
        return;
      }

      if (needsMasterKeyReveal) {
        setStep("master_key");
        return;
      }

      if (hasProfile) {
        onComplete();
      } else {
        setStep("profile");
      }
    } catch (e) {
      console.error("Profile check failed", e);
      setStep("profile");
    }
  };

  const handleMasterKeyNext = async () => {
    try {
      const storageKey = await AccountService.getStorageKey(
        userEmail,
        "MASTER_KEY",
      );
      await setKeyFromSecureStorage(storageKey, masterKey);
      await setKeyFromSecureStorage(
        await AccountService.getStorageKey(userEmail, "MASTER_KEY_PENDING_REVEAL"),
        "",
      );
    } catch (e) {
      console.error("Failed to update master key format", e);
    }
    setShouldShowMasterKeyAfterPin(false);
    const defaultName = userEmail.split("@")[0];
    if (!getValues("username")) {
      setValue("username", defaultName);
    }
    setStep("profile");
  };

  const handleCopyMasterKey = async () => {
    try {
      await Clipboard.write({ string: masterKey });
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      console.error("Clipboard error", e);
    }
  };

  const handleSaveProfile = async (data: { username: string }) => {
    try {
      let finalAvatar = avatar;
      if (avatar && avatar.startsWith("data:")) {
        try {
          const identifier = await AccountService.getDbName(userEmail);
          finalAvatar = await StorageService.saveProfileImage(
            avatar.split(",")[1],
            identifier,
          );
        } catch (e) {
          console.error("Failed to save profile image to disk", e);
        }
      }

      const existing = await queryDB(
        "SELECT name_version, avatar_version FROM me WHERE id = 1",
      );

      if (existing.length > 0) {
        await executeDB(
          "UPDATE me SET public_name = ?, public_avatar = ?, name_version = name_version + 1, avatar_version = avatar_version + 1 WHERE id = 1",
          [data.username, finalAvatar],
        );
      } else {
        await executeDB(
          "INSERT OR REPLACE INTO me (id, public_name, public_avatar, name_version, avatar_version) VALUES (1, ?, ?, 1, 1)",
          [data.username, finalAvatar],
        );
      }

      await AccountService.updateProfile(
        userEmail,
        data.username,
        finalAvatar || "",
      );

      // Broadcast the update
      ChatClient.getInstance().broadcastProfileUpdate();

      onComplete();
    } catch (e) {
      console.error("Failed to save profile", e);
      toast.error("Failed to save profile.");
    }
  };

  const handlePinSuccess = async (enteredPin?: string) => {
    if (!enteredPin) return;

    if (!tempPin) {
      // First pass
      setTempPin(enteredPin);
    } else {
      // Confirmation pass
      if (enteredPin === tempPin) {
        try {
          await setKeyFromSecureStorage(
            await AccountService.getStorageKey(userEmail, "app_lock_pin"),
            tempPin,
          );
          if (shouldShowMasterKeyAfterPin) {
            setStep("master_key");
          } else {
            const defaultName = userEmail.split("@")[0];
            if (!getValues("username")) {
              setValue("username", defaultName);
            }
            setStep("profile");
          }
        } catch (e) {
          setSetupError("Failed to save PIN");
          setTempPin("");
        }
      } else {
        setSetupError("PINs did not match. Please try again.");
        setTempPin("");
      }
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setAvatar(ev.target.result as string);
        }
      };
      reader.readAsDataURL(e.target.files[0]);
      e.target.value = "";
    }
  };

  const renderSetupScreen = ({
    width,
    content,
  }: {
    width: string;
    content: React.ReactNode;
  }) => (
    <AppScreenLayout stageWidth={`min(100%, ${width})`}>
      {content}
    </AppScreenLayout>
  );

  if (step === "loading") {
    return (
      <BlockingProgressOverlay
        title="Finishing setup..."
        description="Please wait and do not close the app while CryptNode sets up your encrypted storage, keys, and profile."
      />
    );
  }

  if (step === "master_key") {
    return renderSetupScreen({
      width: "620px",
      content: (
        <>
          <DialogHeader>
            <DialogBadge tone="danger">Save This Securely</DialogBadge>
            <DialogTitle>Recovery Passphrase</DialogTitle>
            <DialogDescription>
              This is your <strong>Master Key</strong>. You need it to recover
              your account and decrypt your data on a new device.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div
              style={{
                color: colors.status.error,
                fontWeight: 700,
                marginBottom: "16px",
                lineHeight: 1.5,
              }}
            >
              Do not lose it. CryptNode cannot recover it for you.
            </div>

            <div
              style={{
                backgroundColor: colors.background.secondary,
                padding: "20px",
                borderRadius: radii.lg,
                marginBottom: "8px",
                border: `1px solid ${colors.border.subtle}`,
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                justifyContent: "center",
              }}
            >
              {masterKey.split(" ").map((word, i) => (
                <span
                  key={i}
                  style={{
                    color: colors.text.primary,
                    fontFamily: "monospace",
                    fontSize: "15px",
                    backgroundColor: colors.background.tertiary,
                    padding: "6px 10px",
                    borderRadius: radii.md,
                    border: `1px solid ${colors.border.subtle}`,
                  }}
                >
                  <span style={{ color: colors.text.secondary, marginRight: "6px" }}>
                    {i + 1}.
                  </span>
                  {word}
                </span>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={handleCopyMasterKey}
            >
              {isCopied ? "Copied!" : "Copy to Clipboard"}
            </Button>
            <Button type="button" variant="primary" fullWidth onClick={handleMasterKeyNext}>
              I Have Saved It
            </Button>
          </DialogFooter>
        </>
      ),
    });
  }

  if (step === "pin") {
    return (
      <AppLockScreen
        mode="input"
        fullscreen
        title={tempPin ? "Confirm App Lock PIN" : "Set App Lock PIN"}
        description={
          setupError ||
          (tempPin
            ? "Re-enter your PIN to confirm"
            : "Create a PIN to secure your account on this device.")
        }
        onSuccess={handlePinSuccess}
        onCancel={() => {
          if (tempPin) {
            setTempPin("");
            setSetupError("");
          } else {
            setSetupError("");
          }
        }}
      />
    );
  }

  return renderSetupScreen({
      width: "520px",
      content: <form onSubmit={handleSubmit(handleSaveProfile)}>
        <DialogHeader>
          <DialogBadge>Profile Setup</DialogBadge>
          <DialogTitle>Set up your profile</DialogTitle>
          <DialogDescription>
            Choose a display name and optional avatar so others can recognize
            you across encrypted chats.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div style={{ marginBottom: "20px", textAlign: "center" }}>
            <div
              style={{
                width: "108px",
                height: "108px",
                borderRadius: "50%",
                backgroundColor: colors.background.secondary,
                margin: "0 auto 12px",
                backgroundImage: avatar ? `url(${avatar})` : "none",
                backgroundSize: "cover",
                backgroundPosition: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "40px",
                color: colors.text.secondary,
                cursor: "pointer",
                position: "relative",
                overflow: "hidden",
                border: `1px solid ${colors.border.subtle}`,
              }}
              onClick={() => document.getElementById("avatar-input")?.click()}
            >
              {!avatar && userEmail[0].toUpperCase()}
              <label
                htmlFor="avatar-input"
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: "rgba(0, 0, 0, 0.55)",
                  color: colors.text.inverse,
                  fontSize: "10px",
                  padding: "5px",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                }}
              >
                CHANGE
              </label>
            </div>
            <input
              id="avatar-input"
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              style={{ display: "none" }}
            />
          </div>

          <div style={{ marginBottom: "6px", textAlign: "left" }}>
            <label
              style={{
                display: "block",
                color: colors.text.secondary,
                fontSize: "12px",
                marginBottom: "8px",
                fontWeight: 600,
              }}
            >
              Username
            </label>
            <InputField
              {...register("username", { required: "Username is required" })}
              autoFocus
              style={{
                borderColor: errors.username
                  ? colors.status.error
                  : colors.border.subtle,
              }}
            />
            {errors.username && (
              <span
                style={{
                  color: colors.status.error,
                  fontSize: "12px",
                  marginTop: "6px",
                  display: "block",
                }}
              >
                {errors.username.message}
              </span>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="submit" variant="primary" fullWidth size="lg">
            Finish Setup
          </Button>
        </DialogFooter>
      </form>,
  });
};
