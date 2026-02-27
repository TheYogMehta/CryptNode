import React, { useState } from "react";
import { StoredAccount } from "../../../../services/auth/AccountService";
import { BackupService } from "../../../../services/storage/BackupService";
import { colors } from "../../../../theme/design-system";

interface AccountPickerProps {
  accounts?: StoredAccount[];
  onSelectAccount: (account: StoredAccount) => void;
  onAddAccount?: () => void;
  isOverlay?: boolean;
}

export const AccountPicker: React.FC<AccountPickerProps> = ({
  accounts,
  onSelectAccount,
  onAddAccount,
  isOverlay = true,
}) => {
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [restoreBuffer, setRestoreBuffer] = useState<ArrayBuffer | null>(null);
  const [tempCode, setTempCode] = useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      setRestoreBuffer(arrayBuffer);
      setShowRestorePrompt(true);
    } catch (err) {
      alert("Failed to read backup file.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRestoreSubmit = async () => {
    if (!restoreBuffer || !tempCode) return;
    setShowRestorePrompt(false);
    try {
      await BackupService.restoreFromEncryptedBackup(restoreBuffer, tempCode);
      alert(
        "Backup restored! Please click 'Add Account' and sign in with Google to continue.",
      );
      setTempCode("");
      setRestoreBuffer(null);
    } catch (err: any) {
      alert(err.message || "Failed to restore backup.");
    }
  };

  const containerStyle: React.CSSProperties = isOverlay
    ? {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "#111",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        color: "white",
      }
    : {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        color: "white",
        width: "100%",
        height: "100%",
      };

  return (
    <div style={containerStyle}>
      <h2 style={{ fontSize: "24px", marginBottom: "30px" }}>Select Account</h2>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "15px",
          width: "100%",
          maxWidth: "320px",
        }}
      >
        {accounts?.map((acc) => (
          <button
            key={acc.email}
            onClick={() => onSelectAccount(acc)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "15px",
              padding: "15px",
              backgroundColor: "#222",
              border: "1px solid #333",
              borderRadius: "12px",
              color: "white",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                backgroundColor: "#3b82f6",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                fontWeight: "bold",
              }}
            >
              {acc.displayName?.[0]?.toUpperCase() ||
                acc.email[0].toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "bold", fontSize: "16px" }}>
                {acc.displayName || acc.email.split("@")[0]}
              </div>
              <div style={{ fontSize: "12px", color: "#aaa" }}>{acc.email}</div>
            </div>
          </button>
        ))}

        {(!accounts || accounts.length === 0) && (
          <div style={{ textAlign: "center", padding: "20px", color: "#aaa" }}>
            No accounts found. Please add an account to begin.
          </div>
        )}

        <button
          onClick={onAddAccount}
          style={{
            padding: "15px",
            backgroundColor: "rgba(99, 102, 241, 0.1)",
            border: "1px dashed #6366f1",
            borderRadius: "12px",
            color: "#6366f1",
            fontWeight: "bold",
            cursor: "pointer",
            marginTop: "5px",
            transition: "all 0.2s",
          }}
        >
          + Add Account
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: "12px",
            backgroundColor: "transparent",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "12px",
            color: "#aaa",
            cursor: "pointer",
            marginTop: "5px",
            fontSize: "14px",
          }}
        >
          Restore from Backup
        </button>
        <input
          type="file"
          accept=".zip"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>

      {showRestorePrompt && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.8)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 10000,
          }}
        >
          <div
            style={{
              background: colors.background.secondary,
              padding: "24px",
              borderRadius: "12px",
              width: "90%",
              maxWidth: "400px",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", color: colors.text.primary }}>
              Enter Backup Code
            </h3>
            <p
              style={{
                color: colors.text.secondary,
                fontSize: "14px",
                marginBottom: "20px",
              }}
            >
              Please enter your 12-word Master Backup Phrase to decrypt this
              backup.
            </p>
            <input
              type="text"
              value={tempCode}
              onChange={(e) => setTempCode(e.target.value)}
              placeholder="e.g. apple banana orange..."
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.2)",
                color: colors.text.primary,
                marginBottom: "20px",
              }}
            />
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setShowRestorePrompt(false);
                  setRestoreBuffer(null);
                  setTempCode("");
                }}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  color: colors.text.secondary,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRestoreSubmit}
                style={{
                  padding: "8px 16px",
                  background: colors.primary.main,
                  color: "white",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Decrypt & Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
