import React from "react";
import { styles } from "./Home.styles";
import ChatClient from "../../services/ChatClient.ts";

export const Sidebar = ({
  sessions,
  activeChat,
  onSelect,
  onAddPeer,
  isOpen,
  isMobile,
  onClose,
  onLogoClick,
}: any) => (
  <>
    {isOpen && isMobile && (
      <div onClick={onClose} style={styles.mobileOverlay} />
    )}
    <nav
      style={{
        ...styles.sidebar,
        left: isMobile ? (isOpen ? 0 : "-100%") : 0,
        position: isMobile ? "fixed" : "relative",
      }}
    >
      <div style={styles.sidebarHeader}>
        <h2 style={styles.logo} onClick={onLogoClick}>
          Ghost<span>Talk</span>
        </h2>
        {isMobile && (
          <button onClick={onClose} style={styles.closeBtn}>
            ✕
          </button>
        )}
      </div>
      <div style={styles.sessionList}>
        <p style={styles.sectionLabel}>SECURE SESSIONS</p>
        {sessions.length === 0 && (
          <p style={styles.emptyText}>No active links</p>
        )}
        {sessions.map((sid: string) => (
          <div
            key={sid}
            onClick={() => onSelect(sid)}
            style={{
              ...styles.sessionItem,
              background:
                activeChat === sid ? "rgba(99, 102, 241, 0.15)" : "transparent",
            }}
          >
            <div
              style={{
                ...styles.avatar,
                borderColor: ChatClient.sessions[sid]?.online
                  ? "#22c55e"
                  : "#334155",
              }}
            >
              {sid[0].toUpperCase()}
            </div>
            <div style={styles.sessionInfo}>
              <div style={styles.sessionName}>Peer {sid.slice(0, 6)}</div>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: ChatClient.sessions[sid]?.online
                    ? "#22c55e"
                    : "#64748b",
                  marginTop: "2px",
                }}
              >
                ● {ChatClient.sessions[sid]?.online ? "Online" : "Offline"}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={styles.sidebarFooter}>
        <button onClick={onAddPeer} style={styles.addBtn}>
          <span>+</span> Add New Peer
        </button>
      </div>
    </nav>
  </>
);
