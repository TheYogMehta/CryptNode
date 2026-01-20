import React, { useState, useEffect } from "react";
import { useChatLogic } from "./useChatLogic";
import { Sidebar } from "./Sidebar";
import { ChatWindow } from "./ChatWindow";
import { ConnectionSetup } from "./ConnectionSetup";
import { RequestModal } from "./RequestModal";
import { styles } from "./Home.styles";

const Home = () => {
  const { state, actions } = useChatLogic();
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div style={styles.appContainer}>
      {/* Error Toast Notifications */}
      {state.error && <div style={styles.errorToast}>{state.error}</div>}

      {/* Sidebar Navigation */}
      <Sidebar
        sessions={state.sessions}
        activeChat={state.activeChat}
        isOpen={state.isSidebarOpen}
        isMobile={isMobile}
        onSelect={(sid: string) => {
          actions.setActiveChat(sid);
          actions.setView("chat");
          actions.setIsSidebarOpen(false);
        }}
        onAddPeer={() => {
          actions.setView("add");
          actions.setActiveChat(null);
          actions.setIsSidebarOpen(false);
        }}
        onClose={() => actions.setIsSidebarOpen(false)}
        onLogoClick={actions.resetToHome}
      />

      <main style={styles.mainContent}>
        {/* Main Header */}
        <header style={styles.mainHeader}>
          {isMobile && (
            <button
              onClick={() => actions.setIsSidebarOpen(true)}
              style={styles.menuBtn}
            >
              ☰
            </button>
          )}

          <div
            onClick={actions.resetToHome}
            style={{ cursor: "pointer", flex: 1 }}
          >
            <h2 style={styles.headerTitle}>
              {state.activeChat
                ? `Peer ${state.activeChat.slice(0, 8)}`
                : "GhostTalk Secure"}
            </h2>
            {state.activeChat && (
              <div
                style={{
                  fontSize: "0.7rem",
                  color: state.peerOnline ? "#22c55e" : "#94a3b8",
                  marginTop: "2px",
                }}
              >
                {state.peerOnline ? "● Online" : "● Offline"}
              </div>
            )}
          </div>

          {/* Call Buttons */}
          {state.activeChat && !state.activeCall && (
            <div style={styles.callButtonsContainer}>
              <button
                style={styles.iconBtn}
                onClick={() => actions.startCall("Audio")}
                title="Audio Call"
              >
                📞
              </button>
              <button
                style={styles.iconBtn}
                onClick={() => actions.startCall("Video")}
                title="Video Call"
              >
                📹
              </button>
            </div>
          )}
        </header>

        {/* Content Body */}
        <div style={styles.contentBody}>
          {state.activeChat ? (
            <ChatWindow
              messages={state.messages}
              input={state.input}
              setInput={actions.setInput}
              onSend={actions.handleSend}
            />
          ) : state.view === "add" ? (
            <ConnectionSetup
              inviteCode={state.inviteCode}
              isGenerating={state.isGenerating}
              joinCode={state.joinCode}
              setJoinCode={actions.setJoinCode}
              onConnect={actions.handleConnect}
              setIsGenerating={actions.setIsGenerating}
              isJoining={state.isJoining}
            />
          ) : (
            <div style={styles.emptyState}>
              <div style={styles.heroIcon}>🛡️</div>
              <h2>Zero-Knowledge Encryption</h2>
              <p>Select a peer to begin or add a new one.</p>
            </div>
          )}
        </div>
      </main>

      {/* CALL OVERLAY */}
      {state.activeCall && (
        <div style={styles.modalOverlay}>
          <div style={styles.callCard}>
            <div style={styles.avatarLarge}>
              {state.activeChat ? state.activeChat[0].toUpperCase() : "P"}
            </div>
            <h2 style={{ marginBottom: "8px" }}>
              {state.activeChat
                ? `Peer ${state.activeChat.slice(0, 8)}`
                : "Unknown Peer"}
            </h2>

            <p style={styles.callStatus}>
              {state.activeCall.status === "outgoing" &&
                `${state.activeCall.type} calling...`}
              {state.activeCall.status === "ringing" &&
                `Incoming ${state.activeCall.type} call...`}
              {state.activeCall.status === "connected" && "00:00"}
            </p>

            <div
              style={{ display: "flex", justifyContent: "center", gap: "32px" }}
            >
              {state.activeCall.status === "ringing" ? (
                <>
                  <button
                    onClick={actions.rejectCall}
                    style={{
                      ...styles.actionCircle,
                      backgroundColor: "#ef4444",
                    }}
                  >
                    ✖
                  </button>
                  <button
                    onClick={actions.acceptCall}
                    style={{
                      ...styles.actionCircle,
                      backgroundColor: "#22c55e",
                    }}
                  >
                    ✔
                  </button>
                </>
              ) : (
                <button
                  onClick={actions.endCall}
                  style={{
                    ...styles.actionCircle,
                    backgroundColor: "#ef4444",
                    width: "120px",
                    borderRadius: "20px",
                  }}
                >
                  End Call
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Peer Connection Requests */}
      {(state.inboundReq || state.isWaiting) && (
        <RequestModal
          inboundReq={state.inboundReq}
          isWaiting={state.isWaiting}
          setInboundReq={actions.setInboundReq}
          setIsWaiting={actions.setIsWaiting}
        />
      )}
    </div>
  );
};

export default Home;
