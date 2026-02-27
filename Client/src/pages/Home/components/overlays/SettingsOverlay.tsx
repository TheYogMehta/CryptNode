import React, { useState, useEffect } from "react";
import {
  AccountService,
  StoredAccount,
} from "../../../../services/auth/AccountService";
import {
  deleteDatabase,
  getMediaFilenames,
  switchDatabase,
} from "../../../../services/storage/sqliteService";
import ChatClient from "../../../../services/core/ChatClient";
import {
  getKeyFromSecureStorage,
  setKeyFromSecureStorage,
  setActiveUser,
} from "../../../../services/storage/SafeStorage";
import UserAvatar from "../../../../components/UserAvatar";
import Dialog from "@mui/material/Dialog";
import {
  SettingsContainer,
  SettingsSidebar,
  SettingsContent,
  CategoryButton,
  AccountItem,
  DangerZone,
  DangerButton,
  SignOutButton,
  SidebarHeader,
  SidebarTitle,
  BackButton,
  MobileCategoryList,
  MobileCategoryItem,
  MobileHeader,
  MobileTitle,
} from "./Settings.styles";
import { colors } from "../../../../theme/design-system";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { ProfileSettings } from "../settings/ProfileSettings";
import { SecuritySettings } from "../settings/SecuritySettings";
import { AppearanceSettings } from "../settings/AppearanceSettings";
import { StorageService } from "../../../../services/storage/StorageService";
import { deleteItemsByOwner } from "../../../../utils/secureStorage";
import { useAIStatus } from "../../hooks/useAIStatus";
import { qwenLocalService } from "../../../../services/ai/qwenLocal.service";
import { DeviceManager } from "../settings/DeviceManager";

interface SettingsOverlayProps {
  onClose: () => void;
  currentUserEmail: string | null;
  isMobile?: boolean;
  onAddAccount?: () => void;
  onSwitchAccount?: (email: string) => void;
}

type SettingsCategory =
  | "Profile"
  | "Account"
  | "Security"
  | "Appearance"
  | "Devices";

export const SettingsOverlay: React.FC<SettingsOverlayProps> = ({
  onClose,
  currentUserEmail,
  isMobile,
  onAddAccount,
  onSwitchAccount,
}) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory | null>(
    isMobile ? null : "Profile",
  );
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const {
    isInstalled,
    isLoading: isDownloadingAi,
    progress: aiProgress,
    hasFailed: aiFailed,
  } = useAIStatus();

  useEffect(() => {
    if (!isMobile && !activeCategory) {
      setActiveCategory("Profile");
    }
  }, [isMobile, activeCategory]);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    const accs = await AccountService.getAccounts();
    setAccounts(accs);
  };

  const handleSwitchAccount = async (email: string) => {
    try {
      if (email === currentUserEmail) return;
      if (onSwitchAccount) {
        onSwitchAccount(email);
      } else {
        await ChatClient.switchAccount(email);
        onClose();
        window.location.reload(); // Fallback if not controlled
      }
    } catch (e) {
      alert("Failed to switch account: " + e);
    }
  };

  const handleSignOut = async () => {
    if (confirm("Are you sure you want to sign out?")) {
      await ChatClient.logout();
      onClose();
    }
  };

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;
    if (
      confirm(
        "ARE YOU SURE? This will delete all your chats and keys permanently from this device.",
      )
    ) {
      if (confirm("Really really sure? This cannot be undone.")) {
        if (currentUserEmail) {
          setIsDeletingAccount(true);
          let deleteFailed = false;
          try {
            const dbName = await AccountService.getDbName(currentUserEmail);
            const masterKey = await getKeyFromSecureStorage(
              await AccountService.getStorageKey(
                currentUserEmail,
                "MASTER_KEY",
              ),
            );

            await switchDatabase(dbName, masterKey || undefined);

            const mediaFiles = await getMediaFilenames();
            for (const fileName of mediaFiles) {
              await StorageService.deleteFile(fileName);
            }

            await StorageService.deleteProfileImage(dbName);
            await deleteItemsByOwner(currentUserEmail);
            localStorage.removeItem(`secure_chat_salt_${currentUserEmail}`);

            await setActiveUser(currentUserEmail);

            const keysToClear = [
              "app_lock_pin",
              "MASTER_KEY",
              "vault_mfa_secret",
              "vault_mfa_provisioned",
              "identity_priv",
              "identity_pub",
              "auth_token",
            ];

            for (const keyId of keysToClear) {
              const scopedKey = await AccountService.getStorageKey(
                currentUserEmail,
                keyId,
              );
              await setKeyFromSecureStorage(scopedKey, "");
            }

            await ChatClient.deleteAccount();

            await deleteDatabase(dbName);
            await AccountService.removeAccount(currentUserEmail);
          } catch (e) {
            deleteFailed = true;
            console.error("Delete failed", e);
            alert("Failed to delete account data fully.");
          } finally {
            try {
              await setActiveUser(null);
              await ChatClient.logout();
            } catch (logoutErr) {
              console.warn("Forced logout after delete failed", logoutErr);
            }
            setIsDeletingAccount(false);
            if (!deleteFailed) {
              onClose();
            }
          }
        }
      }
    }
  };

  const deletingOverlay = isDeletingAccount ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 5000,
        background: "rgba(5, 10, 22, 0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          padding: "18px 22px",
          borderRadius: "12px",
          background: colors.surface.primary,
          border: `1px solid ${colors.border.subtle}`,
          color: colors.text.primary,
          minWidth: "220px",
          textAlign: "center",
        }}
      >
        <div className="spinner" style={{ margin: "0 auto 12px" }}></div>
        <div style={{ fontWeight: 600 }}>Deleting account...</div>
        <div style={{ marginTop: "6px", fontSize: "12px", opacity: 0.85 }}>
          Please wait and do not close the app.
        </div>
      </div>
    </div>
  ) : null;

  const menuItems: { id: SettingsCategory; label: string }[] = [
    { id: "Profile", label: "Profile" },
    { id: "Devices", label: "Devices" },
    { id: "Appearance", label: "Appearance" },
    { id: "Security", label: "Security" },
    { id: "Account", label: "Data & Storage" },
  ];

  const renderContent = () => {
    switch (activeCategory) {
      case "Devices":
        return <DeviceManager />;
      case "Appearance":
        return <AppearanceSettings />;
      case "Profile":
        return (
          <ProfileSettings
            currentUserEmail={currentUserEmail}
            accounts={accounts}
            onReloadAccounts={loadAccounts}
            onSwitchAccount={handleSwitchAccount}
            isDeletingAccount={isDeletingAccount}
            onAddAccount={onAddAccount}
          />
        );
      case "Account":
        return (
          <div>
            <h3 style={{ color: colors.text.primary }}>Local AI Model</h3>
            <div
              style={{
                marginBottom: "30px",
                background: colors.background.secondary,
                padding: "16px",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  marginBottom: "12px",
                  color: colors.text.secondary,
                  fontSize: "14px",
                  lineHeight: "1.5",
                }}
              >
                The AI model enables Smart Compose, Summarize, and Quick Replies
                directly on your device without sending your chats to the cloud.
                It requires ~400MB of storage space.
              </div>

              {aiFailed && (
                <div
                  style={{
                    marginBottom: "12px",
                    padding: "12px",
                    borderRadius: "6px",
                    background: "rgba(239, 68, 68, 0.1)",
                    color: "#ef4444",
                    fontSize: "13px",
                  }}
                >
                  <strong>Error: </strong> Local AI is not supported on this
                  device architecture.
                </div>
              )}

              {isInstalled ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: colors.status.success,
                        fontWeight: 500,
                        fontSize: "14px",
                      }}
                    >
                      Installed ✓
                    </div>
                    <div
                      style={{ fontSize: "12px", color: colors.text.tertiary }}
                    >
                      ~400MB Used
                    </div>
                  </div>
                  <button
                    disabled={isDeletingAccount}
                    onClick={() => qwenLocalService.deleteModel()}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "4px",
                      background: "rgba(239, 68, 68, 0.1)",
                      color: "#ef4444",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      cursor: isDeletingAccount ? "not-allowed" : "pointer",
                      fontSize: "13px",
                    }}
                  >
                    Delete Model
                  </button>
                </div>
              ) : isDownloadingAi ? (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "13px",
                      marginBottom: "8px",
                      color: colors.text.secondary,
                    }}
                  >
                    <span>Downloading...</span>
                    <span>{aiProgress}%</span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "6px",
                      background: "rgba(255,255,255,0.1)",
                      borderRadius: "3px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${aiProgress}%`,
                        height: "100%",
                        background: colors.primary.main,
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  disabled={isDeletingAccount}
                  onClick={() => qwenLocalService.downloadModel()}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "6px",
                    background: colors.primary.main,
                    color: colors.text.inverse,
                    border: "none",
                    cursor: isDeletingAccount ? "not-allowed" : "pointer",
                    fontWeight: 500,
                    width: "100%",
                  }}
                >
                  Download Model (~400MB)
                </button>
              )}
            </div>

            <h3 style={{ color: colors.text.primary }}>Danger Zone</h3>
            <DangerZone>
              <SignOutButton
                disabled={isDeletingAccount}
                onClick={handleSignOut}
              >
                Sign Out
              </SignOutButton>
              <DangerButton
                disabled={isDeletingAccount}
                onClick={handleDeleteAccount}
              >
                {isDeletingAccount ? "Deleting..." : "Delete Account"}
              </DangerButton>
            </DangerZone>
          </div>
        );
      case "Security":
        return <SecuritySettings currentUserEmail={currentUserEmail} />;
      default:
        return null;
    }
  };

  // Mobile Logic
  if (isMobile) {
    if (!activeCategory) {
      return (
        <Dialog open={true} onClose={onClose} fullScreen>
          <SettingsContainer>
            <MobileCategoryList>
              <SidebarHeader style={{ padding: "16px", marginBottom: 0 }}>
                <BackButton disabled={isDeletingAccount} onClick={onClose}>
                  <ArrowLeft size={24} />
                </BackButton>
                <SidebarTitle>Settings</SidebarTitle>
              </SidebarHeader>

              {menuItems.map((item) => (
                <MobileCategoryItem
                  key={item.id}
                  disabled={isDeletingAccount}
                  onClick={() => setActiveCategory(item.id)}
                >
                  {item.label}
                  <ChevronRight size={20} color={colors.text.tertiary} />
                </MobileCategoryItem>
              ))}
            </MobileCategoryList>
          </SettingsContainer>
          {deletingOverlay}
        </Dialog>
      );
    }

    return (
      <Dialog open={true} onClose={onClose} fullScreen>
        <SettingsContainer>
          <MobileHeader>
            <BackButton
              disabled={isDeletingAccount}
              onClick={() => setActiveCategory(null)}
            >
              <ArrowLeft size={24} />
            </BackButton>
            <MobileTitle>
              {menuItems.find((m) => m.id === activeCategory)?.label}
            </MobileTitle>
          </MobileHeader>
          <SettingsContent>{renderContent()}</SettingsContent>
        </SettingsContainer>
        {deletingOverlay}
      </Dialog>
    );
  }

  // Desktop Logic
  return (
    <Dialog
      open={true}
      onClose={isDeletingAccount ? undefined : onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        style: {
          backgroundColor: "transparent",
          boxShadow: "none",
        },
      }}
    >
      <SettingsContainer>
        {/* Left Sidebar */}
        <SettingsSidebar>
          <SidebarHeader>
            <BackButton disabled={isDeletingAccount} onClick={onClose}>
              <ArrowLeft size={20} />
            </BackButton>
            <SidebarTitle>Settings</SidebarTitle>
          </SidebarHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {menuItems.map((item) => (
              <CategoryButton
                key={item.id}
                isActive={activeCategory === item.id}
                disabled={isDeletingAccount}
                onClick={() => setActiveCategory(item.id)}
              >
                {item.label}
              </CategoryButton>
            ))}
          </div>
        </SettingsSidebar>

        {/* Right Content */}
        <SettingsContent>
          {activeCategory === "Devices" && <DeviceManager />}
          {activeCategory === "Appearance" && <AppearanceSettings />}
          {activeCategory === "Profile" && (
            <ProfileSettings
              currentUserEmail={currentUserEmail}
              accounts={accounts}
              onReloadAccounts={loadAccounts}
              onSwitchAccount={handleSwitchAccount}
              isDeletingAccount={isDeletingAccount}
              onAddAccount={onAddAccount}
            />
          )}
          {activeCategory === "Account" && (
            <div>
              <h3 style={{ color: colors.text.primary }}>Local AI Model</h3>
              <div
                style={{
                  marginBottom: "30px",
                  background: colors.background.secondary,
                  padding: "16px",
                  borderRadius: "8px",
                }}
              >
                <div
                  style={{
                    marginBottom: "12px",
                    color: colors.text.secondary,
                    fontSize: "14px",
                    lineHeight: "1.5",
                  }}
                >
                  The AI model enables Smart Compose, Summarize, and Quick
                  Replies directly on your device without sending your chats to
                  the cloud. It requires ~400MB of storage space.
                </div>

                {aiFailed && (
                  <div
                    style={{
                      marginBottom: "12px",
                      padding: "12px",
                      borderRadius: "6px",
                      background: "rgba(239, 68, 68, 0.1)",
                      color: "#ef4444",
                      fontSize: "13px",
                    }}
                  >
                    <strong>Error: </strong> Local AI is not supported on this
                    device architecture.
                  </div>
                )}

                {isInstalled ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: colors.status.success,
                          fontWeight: 500,
                          fontSize: "14px",
                        }}
                      >
                        Installed ✓
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: colors.text.tertiary,
                        }}
                      >
                        ~400MB Used
                      </div>
                    </div>
                    <button
                      disabled={isDeletingAccount}
                      onClick={() => qwenLocalService.deleteModel()}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "4px",
                        background: "rgba(239, 68, 68, 0.1)",
                        color: "#ef4444",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        cursor: isDeletingAccount ? "not-allowed" : "pointer",
                        fontSize: "13px",
                      }}
                    >
                      Delete Model
                    </button>
                  </div>
                ) : isDownloadingAi ? (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "13px",
                        marginBottom: "8px",
                        color: colors.text.secondary,
                      }}
                    >
                      <span>Downloading...</span>
                      <span>{aiProgress}%</span>
                    </div>
                    <div
                      style={{
                        width: "100%",
                        height: "6px",
                        background: "rgba(255,255,255,0.1)",
                        borderRadius: "3px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${aiProgress}%`,
                          height: "100%",
                          background: colors.primary.main,
                          transition: "width 0.2s ease",
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    disabled={isDeletingAccount}
                    onClick={() => qwenLocalService.downloadModel()}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      background: colors.primary.main,
                      color: colors.text.inverse,
                      border: "none",
                      cursor: isDeletingAccount ? "not-allowed" : "pointer",
                      fontWeight: 500,
                      width: "100%",
                    }}
                  >
                    Download Model (~400MB)
                  </button>
                )}
              </div>

              <h3 style={{ color: colors.text.primary }}>Danger Zone</h3>
              <DangerZone>
                <SignOutButton
                  disabled={isDeletingAccount}
                  onClick={handleSignOut}
                >
                  Sign Out
                </SignOutButton>
                <DangerButton
                  disabled={isDeletingAccount}
                  onClick={handleDeleteAccount}
                >
                  {isDeletingAccount ? "Deleting..." : "Delete Account"}
                </DangerButton>
              </DangerZone>
            </div>
          )}

          {activeCategory === "Security" && (
            <SecuritySettings currentUserEmail={currentUserEmail} />
          )}
        </SettingsContent>
      </SettingsContainer>
      {deletingOverlay}
    </Dialog>
  );
};
