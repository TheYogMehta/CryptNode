import React, { useState, useRef } from "react";
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonTitle,
  IonList,
  IonItem,
  IonLabel,
  IonFab,
  IonFabButton,
  IonActionSheet,
  IonModal,
  IonInput,
} from "@ionic/react";
import {
  add,
  documentTextOutline,
  keyOutline,
  lockClosedOutline,
  trashOutline,
  copyOutline,
  shieldCheckmarkOutline,
} from "ionicons/icons";
import { useSecureChat } from "./hooks/useSecureChat";
import SavePasswordModal from "./SavePasswordModal";
import { AppLockScreen } from "../Home/components/overlays/AppLockScreen";
import { styles } from "../Home/Home.styles"; // Reuse Home styles
import UserAvatar from "../../components/UserAvatar";
import { colors } from "../../theme/colors";

const SecureChatWindow: React.FC = () => {
  const {
    isUnlocked,
    isSetup,
    unlock,
    setupVault,
    items,
    error: vaultError,
    addItem,
    removeItem,
    decryptItemContent,
  } = useSecureChat();

  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [viewingItem, setViewingItem] = useState<any | null>(null);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        const uint8 = new Uint8Array(arrayBuffer);
        await addItem("file", uint8, {
          filename: file.name,
          size: file.size,
          type: file.type,
        });
      };
      reader.readAsArrayBuffer(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleViewItem = async (item: any) => {
    try {
      const decrypted = await decryptItemContent(item);
      if (item.type === "password") {
        const data = JSON.parse(decrypted as string);
        setViewingItem({ ...item, content: data });
      } else if (item.type === "text") {
        setViewingItem({ ...item, content: decrypted });
      } else if (item.type === "file") {
        const blob = new Blob([decrypted as any], {
          type: item.metadata.type,
        });
        const url = URL.createObjectURL(blob);

        // For media types, we kept the url to render inline
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
    setViewingItem(null);
  };

  if (!isUnlocked) {
    return (
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <AppLockScreen
          mode="input"
          isOverlay={false}
          title={isSetup ? "Secure Vault Locked" : "Setup Vault PIN"}
          description={
            isSetup
              ? "Enter your PIN to access the vault"
              : "Create a PIN for your secure vault"
          }
          onSuccess={(pin) => {
            if (isSetup) {
              unlock(pin || "");
            } else {
              setupVault(pin || "");
            }
          }}
        />
        {vaultError && (
          <div
            style={{
              position: "absolute",
              bottom: "100px",
              width: "100%",
              textAlign: "center",
              color: "#ef4444",
            }}
          >
            <p>{vaultError}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--ion-background-color)",
        position: "relative",
      }}
    >
      <div
        style={{
          ...styles.mainHeader,
          background: "rgba(18, 18, 18, 0.95)",
          borderBottom: `1px solid ${colors.border}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: "12px",
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
            }}
          >
            <IonIcon
              icon={shieldCheckmarkOutline}
              style={{ color: "white", fontSize: "20px" }}
            />
          </div>
          <div>
            <h2 style={{ ...styles.chatTitle, color: "white" }}>
              Secure Vault
            </h2>
            <p style={{ ...styles.statusText, color: "#10b981" }}>
              Encrypted & Local
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          paddingBottom: "80px",
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />

        {items.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              opacity: 0.5,
              marginTop: "-40px",
            }}
          >
            <div
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "20px",
              }}
            >
              <IonIcon
                icon={lockClosedOutline}
                style={{ fontSize: "32px", color: "white" }}
              />
            </div>
            <p style={{ color: "white", fontSize: "1.1rem", fontWeight: 500 }}>
              Vault is empty
            </p>
            <p
              style={{ color: "#94a3b8", fontSize: "0.9rem", marginTop: "8px" }}
            >
              Tap + to add passwords or files
            </p>
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {items.map((item, index) => (
              <div
                key={item.id}
                onClick={() => handleViewItem(item)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "16px",
                  borderRadius: "16px",
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  cursor: "pointer",
                  transition: "transform 0.2s, background-color 0.2s",
                  animation: `slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards`,
                  animationDelay: `${index * 50}ms`,
                  opacity: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(255, 255, 255, 0.08)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(255, 255, 255, 0.03)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "14px",
                    backgroundColor:
                      item.type === "password"
                        ? "rgba(245, 158, 11, 0.15)"
                        : "rgba(59, 130, 246, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: "16px",
                    flexShrink: 0,
                  }}
                >
                  <IonIcon
                    icon={
                      item.type === "password"
                        ? keyOutline
                        : documentTextOutline
                    }
                    style={{
                      color: item.type === "password" ? "#fbbf24" : "#60a5fa",
                      fontSize: "24px",
                    }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3
                    style={{
                      margin: "0 0 4px 0",
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "white",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.type === "password"
                      ? item.metadata.username || "Password"
                      : item.metadata.filename || "File"}
                  </h3>
                  <p
                    style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}
                  >
                    {item.type === "password"
                      ? item.metadata.url || "Credential"
                      : "Encrypted File"}{" "}
                    • {new Date(item.timestamp).toLocaleDateString()}
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this item?")) removeItem(item.id);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#ef4444",
                    width: "32px",
                    height: "32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "8px",
                    cursor: "pointer",
                    opacity: 0.6,
                    transition: "opacity 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
                >
                  <IonIcon icon={trashOutline} style={{ fontSize: "20px" }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Floating Action Button */}
      <div
        style={{
          position: "absolute",
          bottom: "24px",
          right: "24px",
          zIndex: 100,
        }}
      >
        <button
          onClick={() => setShowActionSheet(true)}
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
            border: "none",
            boxShadow: "0 4px 20px rgba(79, 70, 229, 0.4)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "transform 0.2s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.transform = "scale(1.05)")
          }
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <IonIcon icon={add} style={{ fontSize: "28px" }} />
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

      {/* View Item Modal with Media Support */}
      <IonModal
        isOpen={!!viewingItem}
        onDidDismiss={closeView}
        className="glass-modal"
        style={{
          "--background": "rgba(20, 20, 20, 0.95)",
          "--backdrop-opacity": "0.8",
        }}
      >
        <IonHeader className="ion-no-border">
          <IonToolbar style={{ "--background": "transparent", color: "white" }}>
            <IonTitle>
              {viewingItem?.type === "password"
                ? "Password Details"
                : "File Preview"}
            </IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={closeView} color="light">
                Close
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent
          className="ion-padding"
          style={{ "--background": "transparent" }}
        >
          {viewingItem &&
            viewingItem.type === "password" &&
            viewingItem.content && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                  marginTop: "10px",
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    padding: "16px",
                    borderRadius: "16px",
                  }}
                >
                  <IonLabel
                    style={{
                      fontSize: "0.85rem",
                      color: "#94a3b8",
                      display: "block",
                      marginBottom: "8px",
                    }}
                  >
                    Website URL
                  </IonLabel>
                  <IonInput
                    readonly
                    value={viewingItem.content.url}
                    style={{ color: "white", "--padding-start": "0" }}
                  />
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    padding: "16px",
                    borderRadius: "16px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <IonLabel
                      style={{
                        fontSize: "0.85rem",
                        color: "#94a3b8",
                        display: "block",
                        marginBottom: "8px",
                      }}
                    >
                      Username
                    </IonLabel>
                    <IonInput
                      readonly
                      value={viewingItem.content.username}
                      style={{ color: "white", "--padding-start": "0" }}
                    />
                  </div>
                  <IonButton
                    fill="clear"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        viewingItem.content.username,
                      )
                    }
                  >
                    <IonIcon
                      icon={copyOutline}
                      slot="icon-only"
                      color="primary"
                    />
                  </IonButton>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    padding: "16px",
                    borderRadius: "16px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <IonLabel
                      style={{
                        fontSize: "0.85rem",
                        color: "#94a3b8",
                        display: "block",
                        marginBottom: "8px",
                      }}
                    >
                      Password
                    </IonLabel>
                    <IonInput
                      readonly
                      value={viewingItem.content.password}
                      style={{ color: "white", "--padding-start": "0" }}
                    />
                  </div>
                  <IonButton
                    fill="clear"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        viewingItem.content.password,
                      )
                    }
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
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "80%",
                }}
              >
                {viewingItem.mimeType?.startsWith("image/") ? (
                  <img
                    src={viewingItem.contentUrl}
                    alt="preview"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "400px",
                      borderRadius: "8px",
                    }}
                  />
                ) : viewingItem.mimeType?.startsWith("video/") ? (
                  <video
                    controls
                    src={viewingItem.contentUrl}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "400px",
                      borderRadius: "8px",
                    }}
                  />
                ) : viewingItem.mimeType?.startsWith("audio/") ? (
                  <audio
                    controls
                    src={viewingItem.contentUrl}
                    style={{ width: "100%" }}
                  />
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <IonIcon
                      icon={documentTextOutline}
                      style={{
                        fontSize: "64px",
                        color: "#94a3b8",
                        marginBottom: "16px",
                      }}
                    />
                    <p style={{ color: "white" }}>
                      {viewingItem.metadata.filename}
                    </p>
                  </div>
                )}

                <IonButton
                  href={viewingItem.contentUrl}
                  download={viewingItem.metadata.filename}
                  expand="block"
                  style={{ marginTop: "24px", width: "100%" }}
                >
                  Download File
                </IonButton>
              </div>
            )}
        </IonContent>
      </IonModal>
    </div>
  );
};

export default SecureChatWindow;
