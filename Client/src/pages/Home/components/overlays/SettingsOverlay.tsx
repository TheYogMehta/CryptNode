import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
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
import Dialog from "@mui/material/Dialog";
import {
  SettingsContainer,
  SettingsSidebar,
  SettingsContent,
  CategoryButton,
  DangerZone,
  DangerButton,
  SignOutButton,
  SidebarHeader,
  SidebarTitle,
  BackButton,
  MobileCategoryList,
  MobileCategoryItem,
  MobileCategoryInfo,
  MobileHeader,
  MobileTitle,
  SidebarSearch,
  SearchInput,
  CategoryIcon,
  CategoryText,
  CategoryLabel,
  CategoryDescription,
  SettingsContentHeader,
  SettingsContentTitle,
  SettingsContentDescription,
  EmptySearchState,
} from "./Settings.styles";
import { colors } from "../../../../theme/design-system";
import {
  ArrowLeft,
  ChevronRight,
  UserRound,
  Smartphone,
  Palette,
  Shield,
  Bot,
  ScrollText,
  Database,
} from "lucide-react";
import { ProfileSettings } from "../settings/ProfileSettings";
import { SecuritySettings } from "../settings/SecuritySettings";
import { AppearanceSettings } from "../settings/AppearanceSettings";
import { StorageService } from "../../../../services/storage/StorageService";
import { deleteItemsByOwner } from "../../../../utils/secureStorage";
import { localAIService } from "../../../../services/ai/localAI.service";
import { DeviceManager } from "../settings/DeviceManager";
import { LocalAISettings } from "../settings/LocalAISettings";
import { LogSettings } from "../settings/LogSettings";
import { Capacitor } from "@capacitor/core";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";


interface SettingsOverlayProps {
  onClose: () => void;
  currentUserEmail: string | null;
  isMobile?: boolean;
  onAddAccount?: () => void;
  onSwitchAccount?: (email: string) => void;
  defaultTab?: SettingsCategory;
}

type SettingsCategory =
  | "Profile"
  | "Account"
  | "Security"
  | "Appearance"
  | "Devices"
  | "Local AI"
  | "Logs";

export const SettingsOverlay: React.FC<SettingsOverlayProps> = ({
  onClose,
  currentUserEmail,
  isMobile,
  onAddAccount,
  onSwitchAccount,
  defaultTab,
}) => {
  const isAndroid = Capacitor.getPlatform() === "android";
  const initialCategory = defaultTab === "Local AI" && isAndroid ? "Profile" : defaultTab;
  const [activeCategory, setActiveCategory] = useState<SettingsCategory | null>(
    isMobile ? (initialCategory || null) : (initialCategory || "Profile"),
  );
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [deleteAccountConfirmOpen, setDeleteAccountConfirmOpen] = useState(false);
  const [deleteModelsWithAccount, setDeleteModelsWithAccount] = useState(false);
  const [canDeleteModelsWithAccount, setCanDeleteModelsWithAccount] = useState(false);

  useEffect(() => {
    if (!isMobile && !activeCategory) {
      setActiveCategory(defaultTab || "Profile");
    }
  }, [isMobile, activeCategory, defaultTab]);

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
        await onSwitchAccount(email);
      } else {
        await ChatClient.switchAccount(email);
        onClose();
        window.location.reload(); // Fallback if not controlled
      }
    } catch (e) {
      console.warn("SettingsOverlay fallback: switch account handled by parent, or failed:", e);
    }
  };

  const handleSignOut = async () => {
    try {
      await ChatClient.logout(true);
      toast.success("Signed out.");
      onClose();
    } catch (e) {
      console.error("Sign out failed", e);
      toast.error("Failed to sign out.");
    }
  };

  const openDeleteAccountConfirm = async () => {
    if (isDeletingAccount || !currentUserEmail) return;

    let hasDownloadedModels = false;
    if (accounts.length <= 1 && Capacitor.getPlatform() !== "android") {
      try {
        await localAIService.refreshInstalledStatus();
        const installedModels = await localAIService.getEnhancedModels();
        hasDownloadedModels = installedModels.some((m) => m.isDownloaded);
      } catch (err) {
        console.error("Failed to check for downloaded models", err);
      }
    }

    setCanDeleteModelsWithAccount(hasDownloadedModels);
    setDeleteModelsWithAccount(false);
    setDeleteAccountConfirmOpen(true);
  };

  const handleDeleteAccount = async () => {
    if (!currentUserEmail || isDeletingAccount) return;

    setIsDeletingAccount(true);
    let deleteFailed = false;
    try {
      const dbName = await AccountService.getDbName(currentUserEmail);
      const masterKey = await getKeyFromSecureStorage(
        await AccountService.getStorageKey(currentUserEmail, "MASTER_KEY"),
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

      // Fire-and-forget server delete while the current authenticated session
      // is still intact. We only wait for the frame to flush locally, not for
      // any server response.
      await ChatClient.deleteAccount();

      const keysToClear = [
        "app_lock_pin",
        "MASTER_KEY",
        "MASTER_KEY_PENDING_REVEAL",
        "vault_mfa_secret",
        "vault_mfa_provisioned",
        "identity_priv",
        "identity_pub",
      ];

      for (const keyId of keysToClear) {
        const scopedKey = await AccountService.getStorageKey(
          currentUserEmail,
          keyId,
        );
        await setKeyFromSecureStorage(scopedKey, "");
      }

      await AccountService.removeAccount(currentUserEmail);
      await deleteDatabase(dbName);

      if (deleteModelsWithAccount) {
        try {
          await localAIService.refreshInstalledStatus();
          const installedModels = await localAIService.getEnhancedModels();
          for (const model of installedModels) {
            if (model.isDownloaded) {
              await localAIService.deleteModel(model.id);
            }
          }
        } catch (modelErr) {
          console.error("Failed to delete models", modelErr);
        }
      }

      toast.success("Account deleted from this device.");
    } catch (e) {
      deleteFailed = true;
      console.error("Delete failed", e);
      toast.error("Failed to delete account data fully.");
    } finally {
      try {
        await setActiveUser(null);
        await ChatClient.logout(true);
      } catch (logoutErr) {
        console.warn("Forced logout after delete failed", logoutErr);
      }
      setIsDeletingAccount(false);
      setDeleteAccountConfirmOpen(false);
      if (!deleteFailed) {
        onClose();
      }
    }
  };

  const menuItems: {
    id: SettingsCategory;
    label: string;
    description: string;
    icon: any;
    keywords: string[];
  }[] = [
    {
      id: "Profile",
      label: "Profile",
      description: "Display name, avatar, public key, and account identity.",
      icon: UserRound,
      keywords: ["name", "avatar", "profile", "identity", "account"],
    },
    {
      id: "Devices",
      label: "Devices",
      description: "Manage linked devices and session trust.",
      icon: Smartphone,
      keywords: ["devices", "linked", "sync", "trust"],
    },
    {
      id: "Appearance",
      label: "Appearance",
      description: "Themes, message layout, and interface behavior.",
      icon: Palette,
      keywords: ["theme", "layout", "bubble", "modern", "ui"],
    },
    {
      id: "Logs",
      label: "Logs",
      description: "Inspect runtime logs and diagnostics.",
      icon: ScrollText,
      keywords: ["logs", "debug", "errors", "diagnostics"],
    },
    {
      id: "Security",
      label: "Security",
      description: "Backups, PIN lock, trusted users, and recovery tools.",
      icon: Shield,
      keywords: ["security", "backup", "pin", "block", "recovery"],
    },
    {
      id: "Account",
      label: "Data & Storage",
      description: "Sign out, delete account data, and storage controls.",
      icon: Database,
      keywords: ["sign out", "delete", "storage", "data"],
    },
  ];

  if (!isAndroid) {
    menuItems.push({
      id: "Local AI",
      label: "Local AI Models",
      description: "Download, switch, and manage offline AI models.",
      icon: Bot,
      keywords: ["local ai", "models", "llm", "download", "offline"],
    });
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

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredMenuItems = menuItems.filter((item) => {
    if (!normalizedSearch) return true;
    return (
      item.label.toLowerCase().includes(normalizedSearch) ||
      item.description.toLowerCase().includes(normalizedSearch) ||
      item.keywords.some((keyword) =>
        keyword.toLowerCase().includes(normalizedSearch),
      )
    );
  });
  const activeMenuItem = menuItems.find((item) => item.id === activeCategory);

  const renderContent = () => {
    switch (activeCategory) {
      case "Devices":
        return <DeviceManager currentUserEmail={currentUserEmail} />;
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
            <h3 style={{ color: colors.text.primary, marginTop: 0 }}>Danger Zone</h3>
            <p style={{ color: colors.text.secondary, lineHeight: 1.55 }}>
              Sign out of this account or permanently remove all local account data from this device.
            </p>
            <DangerZone>
              <SignOutButton
                disabled={isDeletingAccount}
                onClick={() => setSignOutConfirmOpen(true)}
              >
                Sign Out
              </SignOutButton>
              <DangerButton
                disabled={isDeletingAccount}
                onClick={openDeleteAccountConfirm}
              >
                {isDeletingAccount ? "Deleting..." : "Delete Account"}
              </DangerButton>
            </DangerZone>
          </div>
        );
      case "Local AI":
        if (isAndroid) return null;
        return <LocalAISettings />;
      case "Security":
        return <SecuritySettings currentUserEmail={currentUserEmail} onRestoreSuccess={async (email) => {
          if (email === currentUserEmail) {
            await ChatClient.init();
            onClose();
          } else {
            if (onSwitchAccount) onSwitchAccount(email);
          }
        }} />;
      case "Logs":
        return <LogSettings />;
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
              <div style={{ padding: "16px" }}>
                <SidebarSearch style={{ marginBottom: 0 }}>
                  <SearchInput
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search settings"
                  />
                </SidebarSearch>
              </div>

              {filteredMenuItems.length === 0 && (
                <div style={{ padding: "0 16px 16px" }}>
                  <EmptySearchState>No settings match "{searchQuery}".</EmptySearchState>
                </div>
              )}

              {filteredMenuItems.map((item) => (
                <MobileCategoryItem
                  key={item.id}
                  disabled={isDeletingAccount}
                  onClick={() => setActiveCategory(item.id)}
                >
                  <MobileCategoryInfo>
                    <CategoryIcon isActive={false}>
                      <item.icon size={18} />
                    </CategoryIcon>
                    <CategoryText>
                      <CategoryLabel>{item.label}</CategoryLabel>
                      <CategoryDescription>{item.description}</CategoryDescription>
                    </CategoryText>
                  </MobileCategoryInfo>
                  <ChevronRight size={20} color={colors.text.tertiary} />
                </MobileCategoryItem>
              ))}
            </MobileCategoryList>
          </SettingsContainer>
          {deletingOverlay}
          <ConfirmDialog
            open={signOutConfirmOpen}
            title="Sign out of this account?"
            description="You can sign back in later. Local encrypted data stays on this device unless you delete the account."
            confirmLabel="Sign Out"
            badgeLabel="Account Action"
            onCancel={() => setSignOutConfirmOpen(false)}
            onConfirm={async () => {
              setSignOutConfirmOpen(false);
              await handleSignOut();
            }}
          />
          <ConfirmDialog
            open={deleteAccountConfirmOpen}
            title="Delete this account from this device?"
            description="This removes local chats, keys, media, and account data stored on this device. This cannot be undone."
            confirmLabel="Delete Account"
            tone="danger"
            badgeLabel="Permanent Action"
            isLoading={isDeletingAccount}
            onCancel={() => setDeleteAccountConfirmOpen(false)}
            onConfirm={handleDeleteAccount}
          >
            {canDeleteModelsWithAccount ? (
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  color: colors.text.primary,
                  lineHeight: 1.5,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={deleteModelsWithAccount}
                  onChange={(e) => setDeleteModelsWithAccount(e.target.checked)}
                />
                <span>Also delete downloaded Local AI models from this device.</span>
              </label>
            ) : null}
          </ConfirmDialog>
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
              {activeMenuItem?.label}
            </MobileTitle>
          </MobileHeader>
          <SettingsContent>
            {activeMenuItem && (
              <SettingsContentHeader>
                <SettingsContentTitle>{activeMenuItem.label}</SettingsContentTitle>
                <SettingsContentDescription>
                  {activeMenuItem.description}
                </SettingsContentDescription>
              </SettingsContentHeader>
            )}
            {renderContent()}
          </SettingsContent>
        </SettingsContainer>
        {deletingOverlay}
        <ConfirmDialog
          open={signOutConfirmOpen}
          title="Sign out of this account?"
          description="You can sign back in later. Local encrypted data stays on this device unless you delete the account."
          confirmLabel="Sign Out"
          badgeLabel="Account Action"
          onCancel={() => setSignOutConfirmOpen(false)}
          onConfirm={async () => {
            setSignOutConfirmOpen(false);
            await handleSignOut();
          }}
        />
        <ConfirmDialog
          open={deleteAccountConfirmOpen}
          title="Delete this account from this device?"
          description="This removes local chats, keys, media, and account data stored on this device. This cannot be undone."
          confirmLabel="Delete Account"
          tone="danger"
          badgeLabel="Permanent Action"
          isLoading={isDeletingAccount}
          onCancel={() => setDeleteAccountConfirmOpen(false)}
          onConfirm={handleDeleteAccount}
        >
          {canDeleteModelsWithAccount ? (
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                color: colors.text.primary,
                lineHeight: 1.5,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={deleteModelsWithAccount}
                onChange={(e) => setDeleteModelsWithAccount(e.target.checked)}
              />
              <span>Also delete downloaded Local AI models from this device.</span>
            </label>
          ) : null}
        </ConfirmDialog>
      </Dialog>
    );
  }

  // Desktop Logic
  return (
    <Dialog
      open={true}
      onClose={isDeletingAccount ? undefined : onClose}
      fullScreen
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

          <SidebarSearch>
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings"
            />
          </SidebarSearch>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filteredMenuItems.length === 0 && (
              <EmptySearchState>No settings match "{searchQuery}".</EmptySearchState>
            )}
            {filteredMenuItems.map((item) => (
              <CategoryButton
                key={item.id}
                isActive={activeCategory === item.id}
                disabled={isDeletingAccount}
                onClick={() => setActiveCategory(item.id)}
              >
                <CategoryIcon isActive={activeCategory === item.id}>
                  <item.icon size={18} />
                </CategoryIcon>
                <CategoryText>
                  <CategoryLabel>{item.label}</CategoryLabel>
                  <CategoryDescription>{item.description}</CategoryDescription>
                </CategoryText>
              </CategoryButton>
            ))}
          </div>
        </SettingsSidebar>

        {/* Right Content */}
        <SettingsContent>
          {activeMenuItem && (
            <SettingsContentHeader>
              <SettingsContentTitle>{activeMenuItem.label}</SettingsContentTitle>
              <SettingsContentDescription>
                {activeMenuItem.description}
              </SettingsContentDescription>
            </SettingsContentHeader>
          )}
          {activeCategory === "Devices" && (
            <DeviceManager currentUserEmail={currentUserEmail} />
          )}
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
              <h3 style={{ color: colors.text.primary, marginTop: 0 }}>Danger Zone</h3>
              <p style={{ color: colors.text.secondary, lineHeight: 1.55 }}>
                Sign out of this account or permanently remove all local account data from this device.
              </p>
              <DangerZone>
                <SignOutButton
                  disabled={isDeletingAccount}
                  onClick={() => setSignOutConfirmOpen(true)}
                >
                  Sign Out
                </SignOutButton>
                <DangerButton
                  disabled={isDeletingAccount}
                  onClick={openDeleteAccountConfirm}
                >
                  {isDeletingAccount ? "Deleting..." : "Delete Account"}
                </DangerButton>
              </DangerZone>
            </div>
          )}

          {activeCategory === "Local AI" && !isAndroid && <LocalAISettings />}

          {activeCategory === "Security" && (
            <SecuritySettings currentUserEmail={currentUserEmail} onRestoreSuccess={async (email) => {
              if (email === currentUserEmail) {
                await ChatClient.init();
                onClose();
              } else {
                if (onSwitchAccount) onSwitchAccount(email);
              }
            }} />
          )}

          {activeCategory === "Logs" && <LogSettings />}
        </SettingsContent>
      </SettingsContainer>
      {deletingOverlay}
      <ConfirmDialog
        open={signOutConfirmOpen}
        title="Sign out of this account?"
        description="You can sign back in later. Local encrypted data stays on this device unless you delete the account."
        confirmLabel="Sign Out"
        badgeLabel="Account Action"
        onCancel={() => setSignOutConfirmOpen(false)}
        onConfirm={async () => {
          setSignOutConfirmOpen(false);
          await handleSignOut();
        }}
      />
      <ConfirmDialog
        open={deleteAccountConfirmOpen}
        title="Delete this account from this device?"
        description="This removes local chats, keys, media, and account data stored on this device. This cannot be undone."
        confirmLabel="Delete Account"
        tone="danger"
        badgeLabel="Permanent Action"
        isLoading={isDeletingAccount}
        onCancel={() => setDeleteAccountConfirmOpen(false)}
        onConfirm={handleDeleteAccount}
      >
        {canDeleteModelsWithAccount ? (
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              color: colors.text.primary,
              lineHeight: 1.5,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={deleteModelsWithAccount}
              onChange={(e) => setDeleteModelsWithAccount(e.target.checked)}
            />
            <span>Also delete downloaded Local AI models from this device.</span>
          </label>
        ) : null}
      </ConfirmDialog>
    </Dialog>
  );
};
