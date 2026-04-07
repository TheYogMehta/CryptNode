import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonTitle,
  IonActionSheet,
  IonModal,
  IonInput,
  IonLabel,
} from "@ionic/react";
import {
  add,
  arrowBackOutline,
  documentTextOutline,
  keyOutline,
  lockClosedOutline,
  trashOutline,
  copyOutline,
  shieldCheckmarkOutline,
  paperPlaneOutline,
  searchOutline,
} from "ionicons/icons";
import { FileUploadPreview } from "../Home/components/overlays/FileUploadPreview";
import {
  darkFilePreviewTheme,
  FilePreviewPane,
} from "../../components/files/FilePreviewPane";
import { useSecureChat } from "./hooks/useSecureChat";
import SavePasswordModal from "./SavePasswordModal";
import { colors } from "../../theme/design-system";
import { platformLaunchService } from "../../services/mfa/platform-launch.service";
import { AccountService } from "../../services/auth/AccountService";
import { Clipboard } from "@capacitor/clipboard";
import { Capacitor } from "@capacitor/core";
import "./SecureChatWindow.css";

interface SecureChatWindowProps {
  onBack?: () => void;
}

export const SecureChatWindow: React.FC<SecureChatWindowProps> = ({
  onBack,
}) => {
  const {
    isUnlocked,
    isSetup,
    unlock,
    setupVault,
    items,
    error: vaultError,
    addItem,
    updateTextItem,
    removeItem,
    decryptItemContent,
    mfaOnboarding,
    clearMfaOnboarding,
  } = useSecureChat();

  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [viewingItem, setViewingItem] = useState<any | null>(null);
  const [vaultMessage, setVaultMessage] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchContentById, setSearchContentById] = useState<
    Record<string, string>
  >({});
  const [isEditingTextItem, setIsEditingTextItem] = useState(false);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [isSavingTextItem, setIsSavingTextItem] = useState(false);
  const [pendingPin, setPendingPin] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState("");
  const [canOpenOtpLink, setCanOpenOtpLink] = useState(false);
  const [autoOpenTriggered, setAutoOpenTriggered] = useState(false);
  const MFA_SETUP_SENTINEL = "__setup__";
  const handleBack = () => onBack?.();

  const resetAccessFlow = () => {
    setPendingPin(null);
    setMfaToken("");
    setAutoOpenTriggered(false);
    clearMfaOnboarding();
  };

  const handleAccessBack = () => {
    if (pendingPin) {
      resetAccessFlow();
      return;
    }
    handleBack();
  };

  const beginVaultAccess = () => {
    const task = isSetup ? unlock("", undefined, true) : setupVault("");
    task.then((result) => {
      if (result.requiresMfa) {
        setPendingPin(MFA_SETUP_SENTINEL);
        setMfaToken("");
        setAutoOpenTriggered(false);
      }
    });
  };

  const verifyVaultAccess = async () => {
    const result =
      pendingPin === MFA_SETUP_SENTINEL
        ? await unlock("", mfaToken, true)
        : await unlock(pendingPin || "", mfaToken, true);
    if (result.ok) {
      resetAccessFlow();
    }
  };

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!mfaOnboarding?.otpAuthUri) {
        if (active) setCanOpenOtpLink(false);
        return;
      }
      const supported = await platformLaunchService.canOpenOtpAuthUri(
        mfaOnboarding.otpAuthUri,
      );
      if (active) setCanOpenOtpLink(supported);
    };
    check();
    return () => {
      active = false;
    };
  }, [mfaOnboarding]);

  useEffect(() => {
    if (
      autoOpenTriggered ||
      Capacitor.getPlatform() !== "android" ||
      !mfaOnboarding?.otpAuthUri ||
      !canOpenOtpLink
    ) {
      return;
    }

    setAutoOpenTriggered(true);
    platformLaunchService
      .openOtpAuthUri(mfaOnboarding.otpAuthUri)
      .catch(() => {});
  }, [autoOpenTriggered, canOpenOtpLink, mfaOnboarding]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewFiles, setPreviewFiles] = useState<File[]>([]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setPreviewFiles((prev) => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const copyText = async (text: string) => {
    try {
      await Clipboard.write({ string: text });
    } catch (err) {
      console.error("Clipboard copy failed", err);
    }
  };

  const handleVaultFileSend = async (
    files: { file: File; caption: string }[],
  ) => {
    for (const { file, caption } of files) {
      const reader = new FileReader();
      reader.onload = async () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        const uint8 = new Uint8Array(arrayBuffer);
        // Use caption as filename if provided, else file.name
        const filename = caption.trim() || file.name;
        await addItem("file", uint8, {
          filename: filename,
          size: file.size,
          type: file.type,
        });
      };
      reader.readAsArrayBuffer(file);
    }
    setPreviewFiles([]);
  };

  // ... (render)

  const handleViewItem = async (item: any) => {
    try {
      const decrypted = await decryptItemContent(item);
      if (item.type === "password") {
        const data = JSON.parse(decrypted as string);
        setIsEditingTextItem(false);
        setEditingTextValue("");
        setViewingItem({ ...item, content: data });
      } else if (item.type === "text") {
        setIsEditingTextItem(false);
        setEditingTextValue(typeof decrypted === "string" ? decrypted : "");
        setViewingItem({ ...item, content: decrypted });
      } else if (item.type === "file") {
        setIsEditingTextItem(false);
        setEditingTextValue("");
        const decryptedBytes = decrypted as Uint8Array;
        const fileBuffer = decryptedBytes.buffer.slice(
          decryptedBytes.byteOffset,
          decryptedBytes.byteOffset + decryptedBytes.byteLength,
        ) as ArrayBuffer;
        const blob = new Blob([fileBuffer], {
          type: item.metadata.type,
        });
        const url = URL.createObjectURL(blob);
        setViewingItem({
          ...item,
          contentUrl: url,
          mimeType: item.metadata.type,
        });
      }
    } catch (e) {
      console.error("Failed to decrypt", e);
      alert("Failed to decrypt item");
    }
  };

  const closeView = () => {
    if (viewingItem?.contentUrl) {
      URL.revokeObjectURL(viewingItem.contentUrl);
    }
    setIsEditingTextItem(false);
    setEditingTextValue("");
    setIsSavingTextItem(false);
    setViewingItem(null);
  };

  const startEditingTextItem = () => {
    if (viewingItem?.type !== "text" || typeof viewingItem.content !== "string") {
      return;
    }

    setEditingTextValue(viewingItem.content);
    setIsEditingTextItem(true);
  };

  const cancelEditingTextItem = () => {
    setEditingTextValue(
      viewingItem?.type === "text" && typeof viewingItem.content === "string"
        ? viewingItem.content
        : "",
    );
    setIsEditingTextItem(false);
  };

  const saveEditingTextItem = async () => {
    if (
      !viewingItem ||
      viewingItem.type !== "text" ||
      typeof viewingItem.content !== "string"
    ) {
      return;
    }

    if (!editingTextValue.trim()) {
      alert("Saved message cannot be empty.");
      return;
    }

    setIsSavingTextItem(true);
    try {
      const updatedItem = await updateTextItem(viewingItem, editingTextValue);
      setViewingItem({
        ...viewingItem,
        ...updatedItem,
        content: editingTextValue,
      });
      setIsEditingTextItem(false);
    } catch (e) {
      console.error("Failed to update saved message", e);
      alert("Failed to update saved message.");
    } finally {
      setIsSavingTextItem(false);
    }
  };

  const handleStoreMessage = async () => {
    const message = vaultMessage.trim();
    if (!message) return;

    await addItem("text", message, {
      title: message.slice(0, 60),
    });
    setVaultMessage("");
  };

  useEffect(() => {
    let active = true;

    const buildSearchIndex = async () => {
      const index: Record<string, string> = {};

      for (const item of items) {
        const metadataParts = [
          item.metadata?.filename || "",
          item.metadata?.title || "",
          item.metadata?.username || "",
          item.metadata?.email || "",
          item.metadata?.url || "",
          item.type || "",
        ];

        if (item.type === "text" || item.type === "password") {
          try {
            const decrypted = await decryptItemContent(item);
            if (item.type === "text" && typeof decrypted === "string") {
              metadataParts.push(decrypted);
            }
            if (item.type === "password" && typeof decrypted === "string") {
              const parsed = JSON.parse(decrypted);
              metadataParts.push(
                parsed?.url || "",
                parsed?.username || "",
                parsed?.email || "",
                parsed?.password || "",
              );
            }
          } catch (e) {
            console.warn("Search indexing failed for vault item", item.id, e);
          }
        }

        index[item.id] = metadataParts.join(" ").toLowerCase();
      }

      if (active) {
        setSearchContentById(index);
      }
    };

    buildSearchIndex();
    return () => {
      active = false;
    };
  }, [items, decryptItemContent]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      (searchContentById[item.id] || "").includes(q),
    );
  }, [items, searchQuery, searchContentById]);

  const themeVars = {
    "--sc-bg-primary": colors.background.primary,
    "--sc-bg-secondary": colors.background.secondary,
    "--sc-surface-primary": colors.surface.primary,
    "--sc-text-primary": colors.text.primary,
    "--sc-text-secondary": colors.text.secondary,
    "--sc-text-inverse": colors.text.inverse,
    "--sc-border-subtle": colors.border.subtle,
    "--sc-primary-main": colors.primary.main,
    "--sc-status-error": colors.status.error,
  } as React.CSSProperties;

  if (!isUnlocked) {
    const accessTitle = pendingPin
      ? "Two-Factor Verification"
      : isSetup
        ? "Secure Vault Locked"
        : "Set Up Secure Vault";
    const accessSubtitle = pendingPin
      ? "Enter the 6-digit code from your authenticator app to continue."
      : isSetup
        ? "Unlock your encrypted vault using the authenticator already linked to your account."
        : "Protect your vault with your master key and one-time authenticator verification.";

    return (
      <div className="secure-chat-access" style={themeVars}>
        <button
          onClick={handleAccessBack}
          className="secure-chat-back-btn secure-chat-access-back"
        >
          Back
        </button>

        <div className="secure-chat-access-panel">
          <div className="secure-chat-access-badge">
            <IonIcon icon={shieldCheckmarkOutline} className="icon-18" />
            Secure Vault
          </div>

          <div className="secure-chat-access-icon">
            <IonIcon
              icon={pendingPin ? shieldCheckmarkOutline : lockClosedOutline}
              className="icon-32 icon-white"
            />
          </div>

          <h1 className="secure-chat-access-panel-title">{accessTitle}</h1>
          <p className="secure-chat-access-panel-subtitle">{accessSubtitle}</p>

          {!pendingPin ? (
            <div className="secure-chat-access-actions">
              <button
                onClick={beginVaultAccess}
                className="secure-chat-btn-primary secure-chat-access-primary"
              >
                {isSetup ? "Unlock Vault" : "Start Vault Setup"}
              </button>
            </div>
          ) : (
            <div className="secure-chat-access-verification">
              {(Capacitor.getPlatform() === "android" || canOpenOtpLink) &&
                mfaOnboarding?.otpAuthUri && (
                  <button
                    onClick={async () => {
                      const opened = await platformLaunchService.openOtpAuthUri(
                        mfaOnboarding.otpAuthUri,
                      );
                      if (!opened) {
                        alert(
                          "Could not open authenticator app. Use QR/manual setup.",
                        );
                      }
                    }}
                    className="secure-chat-primary-btn"
                  >
                    Open Authenticator App
                  </button>
                )}

              <input
                value={mfaToken}
                onChange={(e) =>
                  setMfaToken(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="Enter 6-digit code"
                inputMode="numeric"
                className="secure-chat-otp-input"
              />

              <button
                onClick={verifyVaultAccess}
                disabled={mfaToken.length !== 6}
                className={`secure-chat-verify-btn ${
                  mfaToken.length === 6 ? "enabled" : "disabled"
                }`}
              >
                Verify & Unlock
              </button>

              {mfaOnboarding && (
                <div className="secure-chat-access-onboarding">
                  {mfaOnboarding.qrDataUrl && (
                    <div className="secure-chat-card secure-chat-qr-wrap secure-chat-access-qr">
                      <img
                        src={mfaOnboarding.qrDataUrl}
                        alt="MFA QR"
                        className="secure-chat-qr"
                      />
                    </div>
                  )}
                  <div className="secure-chat-card">
                    <div className="secure-chat-secret-label">Authenticator Secret</div>
                    <div className="secure-chat-secret-row">
                      <code className="secure-chat-secret-code">
                        {mfaOnboarding.secret}
                      </code>
                      <button
                        onClick={() => copyText(mfaOnboarding.secret)}
                        aria-label="Copy secret"
                        className="secure-chat-icon-btn"
                      >
                        <IonIcon icon={copyOutline} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {vaultError && (
            <div className="secure-chat-access-error">
              <p>{vaultError}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="secure-chat-root" style={themeVars}>
      <div className="secure-chat-header">
        <div className="secure-chat-header-left">
          <button
            onClick={handleBack}
            aria-label="Back"
            className="secure-chat-back-icon-btn"
          >
            <IonIcon icon={arrowBackOutline} className="icon-18" />
          </button>
          <div className="secure-chat-shield">
            <IonIcon
              icon={shieldCheckmarkOutline}
              className="icon-20 icon-white"
            />
          </div>
          <div>
            <h2 className="secure-chat-title">Secure Vault</h2>
            <p className="secure-chat-caption">Encrypted & Local</p>
          </div>
        </div>
        <button
          onClick={() => {
            setShowSearch((prev) => {
              const next = !prev;
              if (!next) setSearchQuery("");
              return next;
            });
          }}
          aria-label="Search vault"
          className={`secure-chat-search-btn ${showSearch ? "active" : ""}`}
        >
          <IonIcon icon={searchOutline} className="icon-18" />
        </button>
      </div>
      {showSearch && (
        <div className="secure-chat-search-wrap">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files, usernames, messages..."
            className="secure-chat-search-input"
          />
        </div>
      )}

      <div className="secure-chat-content">
        <input
          type="file"
          ref={fileInputRef}
          className="secure-chat-hidden-input"
          onChange={handleFileSelect}
        />

        {filteredItems.length === 0 ? (
          <div className="secure-chat-empty">
            <div className="secure-chat-empty-icon-wrap">
              <IonIcon
                icon={lockClosedOutline}
                className="icon-32 icon-muted"
              />
            </div>
            <p className="secure-chat-empty-title">
              {searchQuery.trim() ? "No matching items" : "Vault is empty"}
            </p>
            <p className="secure-chat-empty-subtitle">
              {searchQuery.trim()
                ? "Try a different search term"
                : "Use the message bar or + to add vault items"}
            </p>
          </div>
        ) : (
          <div className="secure-chat-list">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleViewItem(item)}
                className="secure-chat-item"
              >
                <div
                  className={`secure-chat-item-icon ${
                    item.type === "password"
                      ? "type-password"
                      : item.type === "text"
                      ? "type-text"
                      : "type-file"
                  }`}
                >
                  <IonIcon
                    icon={
                      item.type === "password"
                        ? keyOutline
                        : documentTextOutline
                    }
                    className={`secure-chat-item-type-icon ${
                      item.type === "password"
                        ? "type-password"
                        : item.type === "text"
                        ? "type-text"
                        : "type-file"
                    }`}
                  />
                </div>

                <div className="secure-chat-item-content">
                  <h3 className="secure-chat-item-title">
                    {item.type === "password"
                      ? item.metadata.username || "Password"
                      : item.type === "text"
                      ? item.metadata.title || "Saved Message"
                      : item.metadata.filename || "File"}
                  </h3>
                  <p className="secure-chat-item-meta">
                    {item.type === "password"
                      ? item.metadata.url || "Credential"
                      : item.type === "text"
                      ? "Encrypted Message"
                      : "Encrypted File"}{" "}
                    • {new Date(item.timestamp).toLocaleDateString()}
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this item?")) removeItem(item.id);
                  }}
                  className="secure-chat-delete-btn"
                >
                  <IonIcon icon={trashOutline} className="icon-20" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="secure-chat-composer">
        <button
          onClick={() => setShowActionSheet(true)}
          aria-label="Add vault item"
          className="secure-chat-add-btn"
        >
          <IonIcon icon={add} className="icon-22" />
        </button>

        <input
          value={vaultMessage}
          onChange={(e) => setVaultMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleStoreMessage();
            }
          }}
          placeholder="Save an encrypted message..."
          className="secure-chat-message-input"
        />

        <button
          onClick={handleStoreMessage}
          disabled={!vaultMessage.trim()}
          aria-label="Save message"
          className="secure-chat-send-btn"
        >
          <IonIcon icon={paperPlaneOutline} className="icon-18" />
        </button>
      </div>

      <IonActionSheet
        isOpen={showActionSheet}
        onDidDismiss={() => setShowActionSheet(false)}
        buttons={[
          {
            text: "Store File",
            icon: documentTextOutline,
            handler: () => fileInputRef.current?.click(),
          },
          {
            text: "Save Password",
            icon: keyOutline,
            handler: () => setShowPasswordModal(true),
          },
          {
            text: "Cancel",
            role: "cancel",
          },
        ]}
      />

      <SavePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSave={async (data) => {
          const content = JSON.stringify(data);
          await addItem("password", content, {
            url: data.url,
            username: data.username,
            email: data.email,
          });
          setShowPasswordModal(false);
        }}
      />

      <IonModal
        isOpen={!!viewingItem}
        onDidDismiss={closeView}
        className="glass-modal secure-chat-modal"
      >
        <IonHeader className="ion-no-border">
          <IonToolbar className="secure-chat-modal-toolbar">
            <IonTitle>
              {viewingItem?.type === "password"
                ? "Password Details"
                : viewingItem?.type === "text"
                ? "Saved Message"
                : "File Preview"}
            </IonTitle>
            <IonButtons slot="end">
              {viewingItem?.type === "text" && !isEditingTextItem && (
                <IonButton onClick={startEditingTextItem} color="light">
                  Edit
                </IonButton>
              )}
              {viewingItem?.type === "text" && isEditingTextItem && (
                <IonButton onClick={cancelEditingTextItem} color="light">
                  Cancel
                </IonButton>
              )}
              {viewingItem?.type === "text" && isEditingTextItem && (
                <IonButton
                  onClick={saveEditingTextItem}
                  color="primary"
                  disabled={!editingTextValue.trim() || isSavingTextItem}
                >
                  {isSavingTextItem ? "Saving..." : "Save"}
                </IonButton>
              )}
              <IonButton onClick={closeView} color="light">
                Close
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>

        <IonContent className="ion-padding secure-chat-modal-content">
          {viewingItem &&
            viewingItem.type === "password" &&
            viewingItem.content && (
              <div className="secure-chat-modal-stack">
                <div className="secure-chat-modal-card">
                  <IonLabel className="secure-chat-modal-label">
                    Website URL
                  </IonLabel>
                  <IonInput
                    readonly
                    value={viewingItem.content.url}
                    className="secure-chat-modal-input"
                  />
                </div>

                <div className="secure-chat-modal-card-row">
                  <div className="secure-chat-modal-grow">
                    <IonLabel className="secure-chat-modal-label">
                      Username
                    </IonLabel>
                    <IonInput
                      readonly
                      value={viewingItem.content.username}
                      className="secure-chat-modal-input"
                    />
                  </div>
                  <IonButton
                    fill="clear"
                    onClick={() => copyText(viewingItem.content.username || "")}
                  >
                    <IonIcon
                      icon={copyOutline}
                      slot="icon-only"
                      color="primary"
                    />
                  </IonButton>
                </div>

                <div className="secure-chat-modal-card-row">
                  <div className="secure-chat-modal-grow">
                    <IonLabel className="secure-chat-modal-label">
                      Password
                    </IonLabel>
                    <IonInput
                      readonly
                      value={viewingItem.content.password}
                      className="secure-chat-modal-input"
                    />
                  </div>
                  <IonButton
                    fill="clear"
                    onClick={() => copyText(viewingItem.content.password || "")}
                  >
                    <IonIcon
                      icon={copyOutline}
                      slot="icon-only"
                      color="warning"
                    />
                  </IonButton>
                </div>
              </div>
            )}

          {viewingItem &&
            viewingItem.type === "file" &&
            viewingItem.contentUrl && (
              <div className="secure-chat-file-preview">
                <div className="secure-chat-file-preview-pane">
                  <FilePreviewPane
                    fileUrl={viewingItem.contentUrl}
                    fileName={viewingItem.metadata.filename}
                    mimeType={viewingItem.mimeType}
                    theme={{
                      ...darkFilePreviewTheme,
                      panelBackground: "rgba(255, 255, 255, 0.04)",
                      toolbarBackground: "rgba(255, 255, 255, 0.08)",
                      borderColor: "rgba(255, 255, 255, 0.1)",
                      textColor: colors.text.primary,
                      mutedTextColor: colors.text.secondary,
                      errorColor: colors.status.error,
                    }}
                    loadingLabel="Loading file preview..."
                    style={{ width: "100%", height: "100%" }}
                    mediaStyle={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      borderRadius: "8px",
                    }}
                    audioStyle={{ width: "100%" }}
                  />
                </div>

                <IonButton
                  href={viewingItem.contentUrl}
                  download={viewingItem.metadata.filename}
                  expand="block"
                  className="secure-chat-download-btn"
                >
                  Download File
                </IonButton>
              </div>
            )}

          {viewingItem &&
            viewingItem.type === "text" &&
            typeof viewingItem.content === "string" && (
              isEditingTextItem ? (
                <div className="secure-chat-text-edit-wrap">
                  <textarea
                    value={editingTextValue}
                    onChange={(e) => setEditingTextValue(e.target.value)}
                    className="secure-chat-text-editor"
                    placeholder="Edit saved message..."
                  />
                </div>
              ) : (
                <div className="secure-chat-text-preview">
                  {viewingItem.content}
                </div>
              )
            )}
        </IonContent>
      </IonModal>
      {previewFiles.length > 0 && (
        <FileUploadPreview
          files={previewFiles}
          onClose={() => setPreviewFiles([])}
          onSend={handleVaultFileSend}
          onAddMore={() => fileInputRef.current?.click()}
        />
      )}
    </div>
  );
};
