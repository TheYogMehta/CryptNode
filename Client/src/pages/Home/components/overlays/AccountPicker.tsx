import React from "react";
import { StoredAccount } from "../../../../services/auth/AccountService";
import { colors, radii, shadows, spacing } from "../../../../theme/design-system";
import {
  DialogBadge,
  DialogBody,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogTitle,
  ModalOverlay,
} from "./Overlay.styles";
import { AppScreenLayout } from "./AppScreenLayout";
import { Button } from "../../../../components/ui/Button";

interface AccountPickerProps {
  accounts?: StoredAccount[];
  onSelectAccount: (account: StoredAccount) => void;
  onAddAccount?: () => void;
  isOverlay?: boolean;
  fullscreen?: boolean;
}

export const AccountPicker: React.FC<AccountPickerProps> = ({
  accounts,
  onSelectAccount,
  onAddAccount,
  isOverlay = true,
  fullscreen = false,
}) => {
  const listContent = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: fullscreen ? "18px" : "15px",
        width: "100%",
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
            padding: fullscreen ? "18px 20px" : "15px",
            backgroundColor: fullscreen
              ? "transparent"
              : colors.background.secondary,
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: radii.xl,
            color: colors.text.primary,
            cursor: "pointer",
            textAlign: "left",
            boxShadow: "none",
          }}
        >
          <div
            style={{
              width: fullscreen ? "48px" : "42px",
              height: fullscreen ? "48px" : "42px",
              borderRadius: "50%",
              backgroundColor: colors.primary.main,
              color: colors.text.inverse,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: fullscreen ? "20px" : "18px",
              fontWeight: "bold",
              flexShrink: 0,
            }}
          >
            {acc.displayName?.[0]?.toUpperCase() || acc.email[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: "bold",
                fontSize: fullscreen ? "18px" : "16px",
                color: colors.text.primary,
              }}
            >
              {acc.displayName || acc.email.split("@")[0]}
            </div>
            <div
              style={{
                fontSize: fullscreen ? "13px" : "12px",
                color: colors.text.secondary,
                wordBreak: "break-word",
                marginTop: "4px",
              }}
            >
              {acc.email}
            </div>
          </div>
        </button>
      ))}

      {(!accounts || accounts.length === 0) && (
        <div
          style={{
            textAlign: "center",
            padding: fullscreen ? "26px" : "20px",
            color: colors.text.secondary,
            border: `1px dashed ${colors.border.subtle}`,
            borderRadius: radii.xl,
          }}
        >
          No accounts found. Add an account to begin.
        </div>
      )}

      <Button
        onClick={onAddAccount}
        fullWidth
        variant="secondary"
        size="lg"
        style={{
          borderStyle: "dashed",
          color: colors.primary.main,
          marginTop: "4px",
          minHeight: fullscreen ? "54px" : undefined,
        }}
      >
        + Add Account
      </Button>
    </div>
  );

  const panelContent = (
    <>
      <DialogHeader>
        <DialogBadge>Multi-Account</DialogBadge>
        <DialogTitle>Select Account</DialogTitle>
        <DialogDescription>
          Choose the account you want to open in CryptNode.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>{listContent}</DialogBody>
    </>
  );

  return (
    fullscreen ? (
      <AppScreenLayout stageWidth="min(100%, 560px)" panelless>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            padding: "8px 0",
          }}
        >
          <div
            style={{
              textAlign: "center",
            }}
          >
            <div
              style={{
                color: colors.text.primary,
                fontSize: "1.85rem",
                fontWeight: 700,
                marginBottom: "10px",
              }}
            >
              Select Account
            </div>
            <div
              style={{
                color: colors.text.secondary,
                lineHeight: 1.65,
              }}
            >
              Choose the account you want to open in CryptNode.
            </div>
          </div>

          {listContent}
        </div>
      </AppScreenLayout>
    ) : isOverlay ? (
      <ModalOverlay>
        <DialogPanel style={{ width: "min(100%, 440px)" }}>
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
            width: "min(100%, 440px)",
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
