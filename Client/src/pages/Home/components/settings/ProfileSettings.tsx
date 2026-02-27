import React, { useState } from "react";
import {
  AccountService,
  StoredAccount,
} from "../../../../services/auth/AccountService";
import { executeDB } from "../../../../services/storage/sqliteService";
import ChatClient from "../../../../services/core/ChatClient";
import { StorageService } from "../../../../services/storage/StorageService";
import UserAvatar from "../../../../components/UserAvatar";
import {
  ProfileSection,
  ProfileHeader,
  ProfileInfo,
  EditProfileContainer,
  EditProfileForm,
  EditProfileActions,
  AccountItem,
} from "../overlays/Settings.styles";
import { colors } from "../../../../theme/design-system";

interface ProfileSettingsProps {
  currentUserEmail: string | null;
  accounts: StoredAccount[];
  onReloadAccounts: () => Promise<void>;
  onSwitchAccount: (email: string) => Promise<void>;
  isDeletingAccount: boolean;
  onAddAccount?: () => void;
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({
  currentUserEmail,
  accounts,
  onReloadAccounts,
  onSwitchAccount,
  isDeletingAccount,
  onAddAccount,
}) => {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState<string | null>(null);

  const handleEditProfile = async () => {
    const currentAcc = accounts.find((a) => a.email === currentUserEmail);
    setEditName(
      currentAcc?.displayName || currentUserEmail?.split("@")[0] || "",
    );

    let avatarSrc = currentAcc?.avatarUrl || null;
    if (
      avatarSrc &&
      !avatarSrc.startsWith("data:") &&
      !avatarSrc.startsWith("http")
    ) {
      avatarSrc = await StorageService.getProfileImage(
        avatarSrc.replace(/\.jpg$/, ""),
      );
    }

    setEditAvatar(avatarSrc);
    setIsEditingProfile(true);
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // Use compressImage utility for consistent behavior with sharing logic
      import("../../../../utils/imageUtils").then(({ compressImage }) => {
        compressImage(file, 0.8, 1024, 1024)
          .then((compressedFile) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              if (ev.target?.result) {
                setEditAvatar(ev.target.result as string);
              }
            };
            reader.readAsDataURL(compressedFile);
          })
          .catch((err) => {
            console.error("Compression failed, using original", err);
            const reader = new FileReader();
            reader.onload = (ev) => {
              if (ev.target?.result) {
                setEditAvatar(ev.target.result as string);
              }
            };
            reader.readAsDataURL(file);
          });
      });
    }
  };

  const handleSaveProfile = async () => {
    if (!currentUserEmail) return;
    try {
      let avatarToSave = editAvatar;
      if (editAvatar && editAvatar.startsWith("data:")) {
        const base64Data = editAvatar.split(",")[1];
        avatarToSave = await StorageService.saveProfileImage(
          base64Data,
          `avatar_${Date.now()}`,
        );
      }

      await executeDB(
        "UPDATE me SET public_name = ?, public_avatar = ?, name_version = name_version + 1, avatar_version = avatar_version + 1 WHERE id = 1",
        [editName, avatarToSave],
      );

      await AccountService.updateProfile(
        currentUserEmail,
        editName,
        avatarToSave || "",
      );

      ChatClient.broadcastProfileUpdate();

      setIsEditingProfile(false);
      await onReloadAccounts();
    } catch (e) {
      console.error("Failed to save profile", e);
      alert("Failed to save profile");
    }
  };

  return (
    <div>
      <h3 style={{ marginTop: 0, color: colors.text.primary }}>Profile</h3>

      {isEditingProfile ? (
        <EditProfileContainer>
          <EditProfileForm>
            <UserAvatar
              avatarUrl={editAvatar}
              name={currentUserEmail || "?"}
              size={80}
              style={{
                border: `2px solid ${colors.primary.main}`,
                flexShrink: 0,
              }}
              onClick={() =>
                document.getElementById("edit-avatar-input")?.click()
              }
            >
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: "rgba(0,0,0,0.6)",
                  color: colors.text.inverse,
                  fontSize: "10px",
                  textAlign: "center",
                  padding: "2px",
                }}
              >
                CHANGE
              </div>
            </UserAvatar>
            <input
              id="edit-avatar-input"
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              style={{ display: "none" }}
            />

            <div style={{ flex: 1, width: "100%" }}>
              <label
                style={{
                  display: "block",
                  color: colors.text.secondary,
                  fontSize: "12px",
                  marginBottom: "5px",
                }}
              >
                Display Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "6px",
                  background: colors.background.tertiary,
                  border: `1px solid ${colors.border.subtle}`,
                  color: colors.text.primary,
                  fontSize: "16px",
                  outline: "none",
                }}
              />
            </div>
          </EditProfileForm>

          <EditProfileActions>
            <button
              onClick={handleSaveProfile}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                background: colors.primary.main,
                color: colors.text.inverse,
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Save Changes
            </button>
            <button
              onClick={() => setIsEditingProfile(false)}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                background: "transparent",
                color: colors.text.secondary,
                border: `1px solid ${colors.border.subtle}`,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </EditProfileActions>
        </EditProfileContainer>
      ) : (
        <ProfileSection>
          <ProfileHeader>
            <ProfileInfo>
              <UserAvatar
                avatarUrl={(() => {
                  const url = accounts.find(
                    (a) => a.email === currentUserEmail,
                  )?.avatarUrl;
                  return url;
                })()}
                name={currentUserEmail || "?"}
                size={60}
              />
              <div>
                <div
                  style={{
                    color: colors.text.primary,
                    fontSize: "18px",
                    fontWeight: 600,
                  }}
                >
                  {accounts.find((a) => a.email === currentUserEmail)
                    ?.displayName || "No Name Set"}
                </div>
                <div
                  style={{
                    color: colors.text.secondary,
                    fontSize: "14px",
                  }}
                >
                  {currentUserEmail}
                </div>
              </div>
            </ProfileInfo>
            <button
              onClick={handleEditProfile}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                background: colors.background.tertiary,
                color: colors.text.primary,
                border: `1px solid ${colors.border.subtle}`,
                cursor: "pointer",
              }}
            >
              Edit Profile
            </button>
          </ProfileHeader>
        </ProfileSection>
      )}

      <h3 style={{ marginTop: "30px", color: colors.text.primary }}>
        Manage Accounts
      </h3>
      <div style={{ marginBottom: "20px" }}>
        {accounts.map((acc) => (
          <AccountItem
            key={acc.email}
            isActive={acc.email === currentUserEmail}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <UserAvatar
                avatarUrl={acc.avatarUrl}
                name={acc.email}
                size={32}
                style={{ background: colors.background.tertiary }}
              />
              <span style={{ color: colors.text.primary }}>{acc.email}</span>
              {acc.email === currentUserEmail && (
                <span
                  style={{
                    fontSize: "12px",
                    color: colors.primary.main,
                    background: colors.primary.subtle,
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  Current
                </span>
              )}
            </div>
            {acc.email !== currentUserEmail && (
              <button
                disabled={isDeletingAccount}
                onClick={() => onSwitchAccount(acc.email)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "4px",
                  background: colors.primary.main,
                  color: colors.text.inverse,
                  border: "none",
                  cursor: isDeletingAccount ? "not-allowed" : "pointer",
                  opacity: isDeletingAccount ? 0.6 : 1,
                }}
              >
                Switch
              </button>
            )}
          </AccountItem>
        ))}

        {onAddAccount && (
          <button
            disabled={isDeletingAccount}
            onClick={onAddAccount}
            style={{
              width: "100%",
              padding: "12px",
              marginTop: "10px",
              background: "transparent",
              color: colors.primary.main,
              border: `1px dashed ${colors.primary.main}`,
              borderRadius: "8px",
              cursor: isDeletingAccount ? "not-allowed" : "pointer",
              opacity: isDeletingAccount ? 0.6 : 1,
              fontWeight: 600,
            }}
          >
            + Add Account
          </button>
        )}
      </div>
    </div>
  );
};
