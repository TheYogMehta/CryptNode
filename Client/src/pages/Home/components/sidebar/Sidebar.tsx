import React from "react";
import { SidebarItem } from "./SidebarItem";
import { SessionData } from "../../types";
import ChatClient from "../../../../services/core/ChatClient";
import {
  Sparkles,
} from "lucide-react";
import {
  SidebarContainer,
  MobileOverlay,
  SidebarHeader,
  Logo,
  CloseButton,
  SessionList,
  SectionHeader,
  SectionLabel,
  SectionCount,
  EmptyText,
  SidebarFooter,
} from "./Sidebar.styles";
import { Button } from "../../../../components/ui/Button";
import { IconButton } from "../../../../components/ui/IconButton";

import { useAIStatus } from "../../hooks/useAIStatus";
import { Capacitor } from "@capacitor/core";

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
    onOpenVault: () => void;
    onGlobalSummary: () => void;
  }) => {
    const { isInstalled } = useAIStatus();
    const isAndroid = Capacitor.getPlatform() === "android";
    const toolsCount = isAndroid ? 1 : 2;

    return (
      <>
        {isOpen && isMobile && <MobileOverlay onClick={onClose} />}

        <SidebarContainer isOpen={isOpen} isMobile={isMobile}>
          <SidebarHeader>
            <Logo onClick={onLogoClick}>
              Crypt<span>Node</span>
            </Logo>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {isInstalled && !isAndroid && (
                <IconButton
                  title="Catch Up"
                  aria-label="Catch Up"
                  onClick={onGlobalSummary}
                  variant="ghost"
                  size="sm"
                >
                  <Sparkles size={16} />
                </IconButton>
              )}
              {isMobile && <CloseButton onClick={onClose}>✕</CloseButton>}
            </div>
          </SidebarHeader>

          <SessionList>
            <SectionHeader>
              <SectionLabel>TOOLS</SectionLabel>
              <SectionCount>{toolsCount}</SectionCount>
            </SectionHeader>
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
                lastTs: undefined,
                unread: 0,
                online: false,
              }}
              isActive={activeChat === "secure-vault"}
              onSelect={() => onOpenVault()}
            />

            {!isAndroid && (
              <SidebarItem
                key="local-llm"
                data={{
                  sid: "local-llm",
                  alias_name: "Local AI Agent",
                  alias_avatar: "",
                  peer_name: "Local AI Agent",
                  peer_avatar: "",
                  peerEmail: "llm@local",
                  lastMsg: "Offline Assistant",
                  lastMsgType: "text",
                  lastTs: undefined,
                  unread: 0,
                  online: false,
                }}
                isActive={activeChat === "local-llm"}
                onSelect={() => onSelect("local-llm")}
              />
            )}

            <SectionHeader>
              <SectionLabel>SECURE SESSIONS</SectionLabel>
              <SectionCount>{sessions.length}</SectionCount>
            </SectionHeader>

            {sessions.length === 0 ? (
               <EmptyText>No connected users. Add a friend to start chatting!</EmptyText>
            ) : (
              sessions.map((session) => (
                <SidebarItem
                  key={session.sid}
                  data={session}
                  isActive={activeChat === session.sid}
                  onSelect={onSelect}
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
    );
  },
);
