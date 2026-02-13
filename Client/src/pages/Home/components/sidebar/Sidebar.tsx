import React from "react";
import { SidebarItem } from "./SidebarItem";
import { SessionData } from "../../types";
import {
  SidebarContainer,
  MobileOverlay,
  SidebarHeader,
  Logo,
  CloseButton,
  SessionList,
  SectionLabel,
  EmptyText,
  SidebarFooter,
} from "./Sidebar.styles";
import { Button } from "../../../../components/ui/Button";

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
  }) => (
    <>
      {isOpen && isMobile && <MobileOverlay onClick={onClose} />}

      <SidebarContainer isOpen={isOpen} isMobile={isMobile}>
        <SidebarHeader>
          <Logo onClick={onLogoClick}>
            Crypt<span>Node</span>
          </Logo>
          {isMobile && <CloseButton onClick={onClose}>✕</CloseButton>}
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
  ),
);
