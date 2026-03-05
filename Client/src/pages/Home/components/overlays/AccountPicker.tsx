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
      </div>
    </div>
  );
};
