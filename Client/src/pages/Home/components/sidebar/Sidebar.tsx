import React from "react";
import { SidebarItem } from "./SidebarItem";
import { SessionData } from "../../types";
import ChatClient from "../../../../services/core/ChatClient";
import {
  SidebarContainer,
  MobileOverlay,
  SidebarHeader,
  Logo,
  CloseButton,
  SessionList,
  SectionLabel,
  EmptyText,
  SyncContainer,
  SyncTitle,
  SyncProgressBar,
  SyncProgressFill,
  SidebarFooter,
} from "./Sidebar.styles";
import { Button } from "../../../../components/ui/Button";

import { useAIStatus } from "../../hooks/useAIStatus";

export const Sidebar = React.memo(
  ({
    sessions,
    activeChat,
    onSelect,
    onAddPeer,
    isOpen,
    isMobile,
    onClose,
    onLogoClick,
    onSettings,
    onRename,
    onOpenVault,
    onGlobalSummary,
  }: {
    sessions: SessionData[];
    activeChat: string | null;
    onSelect: (sid: string) => void;
    onAddPeer: () => void;
    isOpen: boolean;
    isMobile: boolean;
    onClose: () => void;
    onLogoClick: () => void;
    onSettings: () => void;
    onRename: (sid: string, currentName: string) => void;
    onOpenVault: () => void;
    onGlobalSummary: () => void;
  }) => {
    const { isLoaded } = useAIStatus();
    const [syncProgress, setSyncProgress] = React.useState({
      isSyncing: false,
      currentSession: null as string | null,
      syncedMessages: 0,
      totalMessages: 0,
    });

    React.useEffect(() => {
      const handleProgress = (progress: any) => {
        setSyncProgress(progress);
      };

      const syncManager = ChatClient.messageService?.syncManager;
      if (syncManager) {
        setSyncProgress(syncManager.getProgress());
        syncManager.on("progress_update", handleProgress);
      }

      return () => {
        if (syncManager) {
          syncManager.off("progress_update", handleProgress);
        }
      };
    }, []);

    return (
      <>
        {isOpen && isMobile && <MobileOverlay onClick={onClose} />}

        <SidebarContainer isOpen={isOpen} isMobile={isMobile}>
          <SidebarHeader>
            <Logo onClick={onLogoClick}>
              Crypt<span>Node</span>
            </Logo>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {isLoaded && (
                <button
                  title="Catch Up"
                  onClick={onGlobalSummary}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "1.2rem",
                    padding: "0 5px",
                  }}
                >
                  ✨
                </button>
              )}
              {isMobile && <CloseButton onClick={onClose}>✕</CloseButton>}
            </div>
          </SidebarHeader>

          <SessionList>
            <SectionLabel>PINNED</SectionLabel>
            <SidebarItem
              key="secure-chat"
              data={{
                sid: "secure-vault",
                alias_name: "Secure Vault",
                alias_avatar: "",
                peer_name: "Secure Vault",
                peer_avatar: "",
                peerEmail: "vault@local",
                lastMsg: "Encrypted Storage",
                lastMsgType: "text",
                lastTs: Date.now(),
                unread: 0,
                online: true,
              }}
              isActive={activeChat === "secure-vault"}
              onSelect={() => onOpenVault()}
              onRename={() => {}}
            />

            <SectionLabel>SECURE SESSIONS</SectionLabel>

            {sessions.length === 0 ? (
              <EmptyText>No active links</EmptyText>
            ) : (
              sessions.map((session) => (
                <SidebarItem
                  key={session.sid}
                  data={session}
                  isActive={activeChat === session.sid}
                  onSelect={onSelect}
                  onRename={onRename}
                />
              ))
            )}
          </SessionList>

          {syncProgress.isSyncing && syncProgress.totalMessages > 0 && (
            <SyncContainer>
              <SyncTitle>
                <span>Syncing Messages...</span>
                <span>
                  {Math.round(
                    (syncProgress.syncedMessages / syncProgress.totalMessages) *
                      100,
                  )}
                  %
                </span>
              </SyncTitle>
              <SyncProgressBar>
                <SyncProgressFill
                  progress={
                    (syncProgress.syncedMessages / syncProgress.totalMessages) *
                    100
                  }
                />
              </SyncProgressBar>
            </SyncContainer>
          )}

          <SidebarFooter>
            <Button onClick={onAddPeer} fullWidth variant="primary">
              + Connect
            </Button>
            <Button onClick={onSettings} fullWidth variant="secondary">
              ⚙ Settings
            </Button>
          </SidebarFooter>
        </SidebarContainer>
      </>
    );
  },
);
