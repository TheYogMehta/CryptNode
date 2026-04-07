import React, { useState, useEffect } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import {
  getKeyFromSecureStorage,
  setActiveUser,
} from "../../../../services/storage/SafeStorage";
import {
  AccountService,
  StoredAccount,
} from "../../../../services/auth/AccountService";
import { AccountPicker } from "./AccountPicker";
import { colors, radii, shadows, spacing } from "../../../../theme/design-system";
import { DialogPanel, ModalOverlay } from "./Overlay.styles";
import { AppScreenLayout } from "./AppScreenLayout";

interface AppLockScreenProps {
  onSuccess: (pin?: string) => void;
  onCancel?: () => void;
  mode?: "unlock" | "input" | "lock_screen";
  title?: string;
  description?: string;
  isOverlay?: boolean;
  accounts?: StoredAccount[];
  onUnlockAccount?: (email: string) => void;
  onAddAccount?: () => void;
  userEmail?: string | null;
  fullscreen?: boolean;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({
  onSuccess,
  onCancel,
  mode = "unlock",
  title,
  description,
  isOverlay = true,
  accounts,
  onUnlockAccount,
  onAddAccount,
  userEmail,
  fullscreen = false,
}) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<StoredAccount | null>(
    () => {
      if (userEmail && accounts) {
        return accounts.find(a => a.email === userEmail) || null;
      }
      return null;
    }
  );

  useEffect(() => {
    if (mode === "lock_screen" && userEmail && accounts && accounts.length > 0) {
      const match = accounts.find(a => a.email === userEmail);
      if (match && (!selectedAccount || selectedAccount.email !== match.email)) {
        setSelectedAccount(match);
      }
    }
  }, [userEmail, accounts, mode]);

  const handleKeyPress = async (val: string) => {
    const newPin = pin + val;
    if (newPin.length <= 6) {
      setPin(newPin);
      setError("");
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setError("");
  };

  const handleSubmit = async () => {
    if (mode === "unlock") {
      if (userEmail) await setActiveUser(userEmail);
      const key = userEmail
        ? await AccountService.getStorageKey(userEmail, "app_lock_pin")
        : "app_lock_pin";
      const storedPin = await getKeyFromSecureStorage(key);
      if (!storedPin || storedPin === pin) {
        onSuccess(pin);
      } else {
        setError("Incorrect PIN");
        setPin("");
      }
    } else if (mode === "lock_screen") {
      if (!selectedAccount) return;
      await setActiveUser(selectedAccount.email);
      const key = await AccountService.getStorageKey(
        selectedAccount.email,
        "app_lock_pin",
      );
      const storedPin = await getKeyFromSecureStorage(key);

      if (!storedPin || storedPin === pin) {
        onUnlockAccount?.(selectedAccount.email);
      } else {
        setError("Incorrect PIN");
        setPin("");
      }
    } else {
      onSuccess(pin);
      setPin("");
    }
  };

  useEffect(() => {
    if (pin.length === 6) {
      handleSubmit();
    }
  }, [pin]);

  const resolvedTitle =
    title ||
    (mode === "lock_screen" && selectedAccount
      ? `Enter PIN for ${selectedAccount.displayName || selectedAccount.email}`
      : "App Locked");

  const resolvedDescription =
    description || "Enter your PIN to access CryptNode";

  const keypadSize = fullscreen ? "clamp(88px, 10vmin, 132px)" : "72px";
  const keypadFontSize = fullscreen ? "clamp(32px, 3.8vmin, 44px)" : "24px";
  const keypadGap = fullscreen ? "clamp(18px, 2.2vmin, 30px)" : "16px";
  const keypadGridWidth = fullscreen ? "min(100%, 520px)" : "292px";
  const isMinimalFullscreenLock = fullscreen && mode === "lock_screen";
  const isFullscreenInput = fullscreen && mode === "input";
  const useFullscreenCenteredStack = fullscreen && (mode === "input" || mode === "lock_screen");

  if (mode === "lock_screen" && !selectedAccount) {
    return (
      <AccountPicker
        accounts={accounts}
        isOverlay={isOverlay}
        fullscreen={fullscreen}
        onAddAccount={onAddAccount}
        onSelectAccount={async (acc) => {
          setSelectedAccount(acc);
          setPin("");
          setError("");
          await setActiveUser(acc.email);
          const key = await AccountService.getStorageKey(
            acc.email,
            "app_lock_pin",
          );
          const storedPin = await getKeyFromSecureStorage(key);
          if (!storedPin) {
            onUnlockAccount?.(acc.email);
          }
        }}
      />
    );
  }

  const panelContent = (
      <div
        style={{
          position: "relative",
          width: "100%",
          padding: useFullscreenCenteredStack
            ? isMinimalFullscreenLock
              ? "clamp(88px, 12vh, 124px) 24px 48px"
              : "0 24px 48px"
            : fullscreen
              ? "40px"
              : "30px",
          color: colors.text.primary,
          display: useFullscreenCenteredStack ? "flex" : "block",
          flexDirection: useFullscreenCenteredStack ? "column" : undefined,
          alignItems: useFullscreenCenteredStack ? "center" : undefined,
          justifyContent: isFullscreenInput ? "center" : "flex-start",
          minHeight: useFullscreenCenteredStack
            ? "min(calc(100vh - 48px), 840px)"
            : undefined,
        }}
      >
      {(onCancel || (mode === "lock_screen" && selectedAccount)) && (
        <button
          onClick={
            mode === "lock_screen" && selectedAccount
              ? () => {
                  setSelectedAccount(null);
                  setPin("");
                  setError("");
                }
              : onCancel
          }
          style={{
            position: fullscreen ? "fixed" : "absolute",
            top: fullscreen
              ? "max(24px, calc(env(safe-area-inset-top) + 12px))"
              : "18px",
            left: fullscreen
              ? "max(24px, calc(env(safe-area-inset-left) + 12px))"
              : "18px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "transparent",
            border: "none",
            color: colors.text.secondary,
            fontSize: fullscreen ? "18px" : "14px",
            cursor: "pointer",
            borderRadius: radii.md,
            padding: fullscreen ? "10px 14px" : "6px 8px",
            zIndex: fullscreen ? 2 : undefined,
          }}
        >
          <ArrowLeft size={fullscreen ? 20 : 16} />
          <span>{mode === "lock_screen" && selectedAccount ? "Back" : "Cancel"}</span>
        </button>
      )}

      <div
        style={{
          width: keypadGridWidth,
          maxWidth: "100%",
          margin: "0 auto",
          marginBottom: isMinimalFullscreenLock ? "24px" : "28px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {fullscreen && selectedAccount && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: fullscreen ? "14px" : "12px",
              padding: fullscreen ? "14px 18px" : "10px 14px",
              borderRadius: radii.full,
              background: colors.background.secondary,
              border: `1px solid ${colors.border.subtle}`,
              marginBottom: fullscreen ? "28px" : "20px",
              maxWidth: "100%",
            }}
          >
            <div
              style={{
                width: fullscreen ? "44px" : "34px",
                height: fullscreen ? "44px" : "34px",
                borderRadius: "50%",
                background: colors.primary.main,
                color: colors.text.inverse,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: fullscreen ? "18px" : "14px",
              }}
            >
              {(selectedAccount.displayName || selectedAccount.email)[0]?.toUpperCase()}
            </div>
            <div style={{ textAlign: "left" }}>
              <div
                style={{
                  color: colors.text.primary,
                  fontSize: fullscreen ? "18px" : "14px",
                  fontWeight: 600,
                }}
              >
                {selectedAccount.displayName || selectedAccount.email.split("@")[0]}
              </div>
              <div
                style={{
                  color: colors.text.secondary,
                  fontSize: fullscreen ? "14px" : "12px",
                }}
              >
                {selectedAccount.email}
              </div>
            </div>
          </div>
        )}
        <div
          style={{
            width: fullscreen ? "clamp(72px, 8vmin, 108px)" : "56px",
            height: fullscreen ? "clamp(72px, 8vmin, 108px)" : "56px",
            borderRadius: radii.full,
            background: colors.primary.subtle,
            color: colors.primary.main,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: isMinimalFullscreenLock
              ? "0 auto 22px"
              : "0 auto 16px",
          }}
        >
          <LockKeyhole size={fullscreen ? 34 : 26} />
        </div>
        {!isMinimalFullscreenLock && (
          <>
            <h2
              style={{
                fontSize: fullscreen ? "30px" : "24px",
                marginBottom: "10px",
                marginTop: 0,
                color: colors.text.primary,
              }}
            >
              {resolvedTitle}
            </h2>
            <p
              style={{
                color: colors.text.secondary,
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {resolvedDescription}
            </p>
          </>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: fullscreen ? "18px" : "15px",
          marginBottom: fullscreen ? "clamp(28px, 3.2vmin, 40px)" : "28px",
          width: keypadGridWidth,
          maxWidth: "100%",
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            style={{
              width: fullscreen ? "clamp(14px, 1.4vmin, 18px)" : "15px",
              height: fullscreen ? "clamp(14px, 1.4vmin, 18px)" : "15px",
              borderRadius: "50%",
              backgroundColor:
                i < pin.length ? colors.primary.main : colors.background.tertiary,
              border: `2px solid ${
                i < pin.length ? colors.primary.main : colors.border.subtle
              }`,
              transition: "all 0.16s ease",
            }}
          />
        ))}
      </div>

      {error && (
        <div
          style={{
            color: colors.status.error,
            marginBottom: "20px",
            textAlign: "center",
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: keypadGap,
          justifyItems: "center",
          maxWidth: keypadGridWidth,
          width: "100%",
          margin: "0 auto",
        }}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            onClick={() => handleKeyPress(num.toString())}
            style={{
              width: keypadSize,
              height: keypadSize,
              borderRadius: radii.full,
              border: `1px solid ${colors.border.subtle}`,
              background: colors.background.secondary,
              color: colors.text.primary,
              fontSize: keypadFontSize,
              cursor: "pointer",
              boxShadow: shadows.sm,
            }}
          >
            {num}
          </button>
        ))}
        <div />
        <button
          onClick={() => handleKeyPress("0")}
          style={{
            width: keypadSize,
            height: keypadSize,
            borderRadius: radii.full,
            border: `1px solid ${colors.border.subtle}`,
            background: colors.background.secondary,
            color: colors.text.primary,
            fontSize: keypadFontSize,
            cursor: "pointer",
            boxShadow: shadows.sm,
          }}
        >
          0
        </button>
        <button
          onClick={handleBackspace}
          style={{
            width: fullscreen ? keypadSize : "72px",
            height: fullscreen ? keypadSize : "72px",
            borderRadius: radii.full,
            border: "none",
            background: "transparent",
            color: colors.text.secondary,
            fontSize: fullscreen ? "clamp(24px, 2.8vmin, 34px)" : "18px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ⌫
        </button>
      </div>
    </div>
  );

  return (
    fullscreen ? (
      <AppScreenLayout stageWidth="100%" panelless>
        {panelContent}
      </AppScreenLayout>
    ) : isOverlay ? (
      <ModalOverlay>
        <DialogPanel
          style={{
            width: "min(100%, 420px)",
            overflow: "hidden",
          }}
        >
          {panelContent}
        </DialogPanel>
      </ModalOverlay>
    ) : (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: spacing[4],
          background: colors.background.primary,
        }}
      >
        <div
          style={{
            width: "min(100%, 420px)",
            background: colors.surface.primary,
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: radii["2xl"],
            boxShadow: shadows.xl,
            overflow: "hidden",
          }}
        >
          {panelContent}
        </div>
      </div>
    )
  );
};
