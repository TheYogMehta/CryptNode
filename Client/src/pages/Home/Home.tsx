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
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div style={styles.appContainer}>
      {state.error && <div style={styles.errorToast}>{state.error}</div>}

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
        <header style={styles.mainHeader}>
          {isMobile && (
            <button
              onClick={() => actions.setIsSidebarOpen(true)}
              style={styles.menuBtn}
            >
              ☰
            </button>
          )}
          <div onClick={actions.resetToHome} style={{ cursor: "pointer" }}>
            <h2 style={styles.headerTitle}>
              {state.activeChat
                ? `Session ${state.activeChat.slice(0, 8)}`
                : "Secure Gateway"}
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
        </header>

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
