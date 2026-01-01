import React, { useState, useEffect, useRef } from "react";
import ChatClient from "../../services/ChatClient.ts";
import { queryDB } from "./../../services/sqliteService";

interface ChatMessage {
  sid: string;
  text: string;
  sender: "me" | "other";
}

interface InboundReq {
  sid: string;
  publicKey: string;
}

const Home = () => {
  // Navigation & UI State
  const [view, setView] = useState<"chat" | "add">("chat");
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [input, setInput] = useState("");

  // Handshake & Notification States
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [inboundReq, setInboundReq] = useState<InboundReq | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mobile sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const activeChatRef = useRef<string | null>(null);
  activeChatRef.current = activeChat;

  // --- INITIALIZATION ---
  useEffect(() => {
    const startup = async () => {
      await ChatClient.init();
      setSessions(Object.keys(ChatClient.sessions));
    };
    startup();

    const onSessionUpdate = () => setSessions(Object.keys(ChatClient.sessions));
    const onInviteReady = (code: string) => {
      setInviteCode(code);
      setIsGenerating(false);
    };
    const onInboundReq = (req: InboundReq) => setInboundReq(req);
    const onWaiting = (waiting: boolean) => setIsWaiting(waiting);
    const onJoined = (sid: string) => {
      setActiveChat(sid);
      setView("chat");
      setIsSidebarOpen(false); // close sidebar when joined
    };
    const onError = (msg: string) => {
      setError(msg);
      setIsGenerating(false);
      setTimeout(() => setError(null), 4000);
    };

    const onMessage = (msg: ChatMessage) => {
      if (msg.sid === activeChatRef.current) {
        setMessages((prev) => [...prev, msg]);
      }
    };

    ChatClient.on("session_updated", onSessionUpdate);
    ChatClient.on("invite_ready", onInviteReady);
    ChatClient.on("inbound_request", onInboundReq);
    ChatClient.on("waiting_for_accept", onWaiting);
    ChatClient.on("joined_success", onJoined);
    ChatClient.on("error", onError);
    ChatClient.on("message", onMessage);

    return () => {
      ChatClient.off("session_updated", onSessionUpdate);
      ChatClient.off("invite_ready", onInviteReady);
      ChatClient.off("inbound_request", onInboundReq);
      ChatClient.off("waiting_for_accept", onWaiting);
      ChatClient.off("joined_success", onJoined);
      ChatClient.off("error", onError);
      ChatClient.off("message", onMessage);
    };
  }, []);

  // --- LOAD MESSAGES FOR ACTIVE CHAT ---
  useEffect(() => {
    if (activeChat) {
      queryDB("SELECT * FROM messages WHERE sid = ?", [activeChat]).then(
        (rows: any) => setMessages(rows)
      );
    } else {
      setMessages([]);
    }
  }, [activeChat]);

  const handleSend = async () => {
    if (!input.trim() || !activeChat) return;
    const currentInput = input;
    setInput("");
    await ChatClient.sendMessage(activeChat, currentInput);
    setMessages((prev) => [
      ...prev,
      { sid: activeChat, text: currentInput, sender: "me" },
    ]);
  };

  return (
    <div style={styles.appContainer}>
      {/* ERROR TOAST */}
      {error && <div style={styles.errorToast}>{error}</div>}

      {/* OVERLAYS */}
      {(isWaiting || inboundReq) && (
        <div style={styles.overlay}>
          <div style={styles.glassCard}>
            {isWaiting ? (
              <>
                <div style={styles.loader}></div>
                <h3>Request Sent</h3>
                <p style={{ opacity: 0.7 }}>Waiting for host to accept...</p>
                <button
                  onClick={() => setIsWaiting(false)}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
              </>
            ) : inboundReq ? (
              <>
                <h3 style={{ color: "#818cf8" }}>Secure Connection</h3>
                <p>Accept encrypted link from {inboundReq.sid.slice(0, 8)}?</p>
                <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                  <button
                    onClick={async () => {
                      await ChatClient.acceptFriend(
                        inboundReq.sid,
                        inboundReq.publicKey
                      );
                      setInboundReq(null);
                    }}
                    style={styles.actionBtn}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => {
                      ChatClient.denyFriend(inboundReq.sid);
                      setInboundReq(null);
                    }}
                    style={styles.cancelBtn}
                  >
                    Decline
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* SIDEBAR (responsive for mobile) */}
      <nav
        style={{
          ...styles.sidebar,
          position: window.innerWidth < 768 ? "fixed" : "relative",
          left: window.innerWidth < 768 ? (isSidebarOpen ? 0 : "-100%") : 0,
          top: 0,
          height: "100vh",
          zIndex: 2000,
          transition: "left 0.3s ease",
        }}
      >
        {/* Mobile close button */}
        {window.innerWidth < 768 && (
          <button
            onClick={() => setIsSidebarOpen(false)}
            style={styles.mobileClose}
          >
            ✕
          </button>
        )}

        <div style={styles.sidebarHeader}>
          <h2 style={styles.logo}>
            Chat<span>App</span>
          </h2>
          <button
            onClick={() => setView(view === "chat" ? "add" : "chat")}
            style={styles.iconBtn}
          >
            {view === "chat" ? "➕" : "💬"}
          </button>
        </div>

        <div style={styles.sessionList}>
          {sessions.length === 0 && (
            <p style={styles.emptyText}>No secure links yet</p>
          )}
          {sessions.map((sid) => (
            <div
              key={sid}
              onClick={() => {
                setActiveChat(sid);
                setIsSidebarOpen(false); // close sidebar on selection
              }}
              style={{
                ...styles.sessionItem,
                backgroundColor:
                  activeChat === sid
                    ? "rgba(99, 102, 241, 0.2)"
                    : "transparent",
                borderLeft:
                  activeChat === sid
                    ? "4px solid #6366f1"
                    : "4px solid transparent",
              }}
            >
              <div style={styles.avatar}>{sid.slice(0, 1).toUpperCase()}</div>
              <div style={styles.sessionInfo}>
                <div style={styles.sessionName}>Peer-{sid.slice(0, 6)}</div>
                <div style={styles.sessionStatus}>End-to-End Encrypted</div>
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* MOBILE OVERLAY WHEN SIDEBAR OPEN */}
      {isSidebarOpen && window.innerWidth < 768 && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 1500,
          }}
        />
      )}

      {/* MAIN CONTENT AREA */}
      <main
        style={{
          ...styles.mainContent,
          display:
            !activeChat && window.innerWidth < 768 && view === "chat"
              ? "none"
              : "flex",
        }}
      >
        {activeChat ? (
          <div style={styles.chatWrapper}>
            <header style={styles.chatHeader}>
              {/* Mobile hamburger */}
              {window.innerWidth < 768 && (
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  style={styles.mobileHamburger}
                >
                  ☰
                </button>
              )}
              <div>
                <div style={styles.chatTitle}>Secure Session</div>
                <div style={styles.statusDot}>Active Link</div>
              </div>
            </header>

            <div style={styles.messageArea}>
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.messageRow,
                    justifyContent:
                      m.sender === "me" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      ...styles.bubble,
                      background:
                        m.sender === "me"
                          ? "linear-gradient(135deg, #6366f1, #a855f7)"
                          : "#2d2d3d",
                      borderBottomRightRadius: m.sender === "me" ? 4 : 18,
                      borderBottomLeftRadius: m.sender === "other" ? 4 : 18,
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.inputArea}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a message..."
                style={styles.chatInput}
              />
              <button onClick={handleSend} style={styles.sendIconBtn}>
                🚀
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.setupView}>
            {view === "add" ? (
              <div style={styles.setupContainer}>
                <h2 style={{ marginBottom: 10 }}>Invite Peer</h2>
                <p style={{ opacity: 0.6, marginBottom: 20 }}>
                  Generate a code to start a private session.
                </p>
                <button
                  onClick={() => {
                    setIsGenerating(true);
                    setInviteCode(null);
                    ChatClient.createInvite();
                  }}
                  disabled={isGenerating}
                  style={styles.actionBtnFull}
                >
                  {isGenerating ? "Handshaking..." : "Create Invite Code"}
                </button>

                {inviteCode && (
                  <div style={styles.codeBox}>
                    <p style={{ fontSize: 12, opacity: 0.5 }}>
                      SHARE THIS CODE
                    </p>
                    <h1 style={styles.inviteDisplay}>{inviteCode}</h1>
                  </div>
                )}

                <div style={styles.divider}>
                  <span>OR JOIN PEER</span>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="000000"
                    maxLength={6}
                    style={styles.joinInput}
                  />
                  <button
                    onClick={() => ChatClient.joinByCode(joinCode)}
                    style={styles.actionBtn}
                  >
                    Connect
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", opacity: 0.3 }}>
                <div style={{ fontSize: 64 }}>🔒</div>
                <h2>Select a chat to begin</h2>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
  appContainer: {
    display: "flex",
    height: "100vh",
    width: "100vw",
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    overflow: "hidden",
    fontFamily: "Inter, -apple-system, sans-serif",
  },
  sidebar: {
    width: "min(100%, 350px)",
    borderRight: "1px solid rgba(255,255,255,0.05)",
    flexDirection: "column",
    backgroundColor: "#1e293b",
  },
  sidebarHeader: {
    padding: "24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  logo: {
    fontSize: "1.4rem",
    fontWeight: 800,
    margin: 0,
    letterSpacing: "-1px",
  },
  iconBtn: {
    background: "rgba(255,255,255,0.05)",
    border: "none",
    color: "white",
    padding: "8px 12px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "1.2rem",
  },
  sessionList: { flex: 1, overflowY: "auto", padding: "12px" },
  sessionItem: {
    display: "flex",
    alignItems: "center",
    padding: "16px",
    borderRadius: "12px",
    cursor: "pointer",
    marginBottom: "8px",
    transition: "0.2s",
  },
  avatar: {
    width: "48px",
    height: "48px",
    borderRadius: "14px",
    background: "linear-gradient(135deg, #6366f1, #a855f7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    marginRight: "12px",
    fontSize: "1.2rem",
  },
  sessionInfo: { flex: 1 },
  sessionName: { fontSize: "1rem", fontWeight: "600" },
  sessionStatus: { fontSize: "0.75rem", opacity: 0.5, marginTop: "2px" },
  emptyText: { textAlign: "center", opacity: 0.3, marginTop: "40px" },
  mainContent: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: "#0f172a",
    position: "relative",
  },
  chatWrapper: { display: "flex", flexDirection: "column", height: "100%" },
  chatHeader: {
    padding: "16px 24px",
    display: "flex",
    alignItems: "center",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    backgroundColor: "rgba(30, 41, 59, 0.7)",
    backdropFilter: "blur(12px)",
  },
  chatTitle: { fontWeight: "bold", fontSize: "1.1rem" },
  statusDot: {
    fontSize: "0.7rem",
    color: "#10b981",
    display: "flex",
    alignItems: "center",
  },
  mobileBack: {
    background: "none",
    border: "none",
    color: "white",
    fontSize: "24px",
    marginRight: "16px",
    cursor: "pointer",
  },
  mobileHamburger: {
    background: "none",
    border: "none",
    color: "white",
    fontSize: "28px",
    marginRight: "16px",
    cursor: "pointer",
  },
  mobileClose: {
    background: "none",
    border: "none",
    color: "white",
    fontSize: "28px",
    position: "absolute",
    top: "20px",
    right: "20px",
    cursor: "pointer",
  },
  messageArea: {
    flex: 1,
    overflowY: "auto",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
  },
  messageRow: { display: "flex", marginBottom: "16px" },
  bubble: {
    padding: "12px 18px",
    borderRadius: "18px",
    maxWidth: "75%",
    fontSize: "0.95rem",
    lineHeight: "1.5",
    boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
  },
  inputArea: {
    padding: "20px 24px",
    display: "flex",
    gap: "12px",
    alignItems: "center",
    backgroundColor: "#0f172a",
  },
  chatInput: {
    flex: 1,
    padding: "14px 20px",
    borderRadius: "30px",
    border: "1px solid rgba(255,255,255,0.1)",
    backgroundColor: "#1e293b",
    color: "white",
    outline: "none",
    fontSize: "1rem",
  },
  sendIconBtn: {
    background: "#6366f1",
    border: "none",
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    cursor: "pointer",
    fontSize: "1.2rem",
    transition: "transform 0.2s",
  },
  setupView: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  setupContainer: { width: "100%", maxWidth: "400px", padding: "20px" },
  actionBtn: {
    padding: "12px 24px",
    background: "#6366f1",
    border: "none",
    color: "white",
    borderRadius: "12px",
    cursor: "pointer",
    fontWeight: "600",
  },
  actionBtnFull: {
    width: "100%",
    padding: "12px 0",
    background: "#6366f1",
    border: "none",
    color: "white",
    borderRadius: "12px",
    cursor: "pointer",
    fontWeight: "600",
    marginBottom: "12px",
  },
  cancelBtn: {
    padding: "12px 24px",
    border: "1px solid #818cf8",
    background: "transparent",
    color: "white",
    borderRadius: "12px",
    cursor: "pointer",
    fontWeight: "600",
  },
  codeBox: {
    marginTop: "20px",
    padding: "16px",
    background: "#1e293b",
    borderRadius: "12px",
    textAlign: "center",
  },
  inviteDisplay: { fontSize: "1.6rem", letterSpacing: "4px" },
  divider: {
    textAlign: "center",
    margin: "24px 0",
    position: "relative",
    opacity: 0.5,
  },
  joinInput: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.1)",
    backgroundColor: "#1e293b",
    color: "white",
    outline: "none",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(8px)",
    zIndex: 3000,
  },
  glassCard: {
    background: "rgba(30, 41, 59, 0.85)",
    borderRadius: "16px",
    padding: "32px",
    textAlign: "center",
    color: "white",
    width: "90%",
    maxWidth: "360px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
  },
  loader: {
    width: "48px",
    height: "48px",
    border: "5px solid #818cf8",
    borderTop: "5px solid transparent",
    borderRadius: "50%",
    margin: "0 auto 20px auto",
    animation: "spin 1s linear infinite",
  },
  errorToast: {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#ef4444",
    padding: "12px 24px",
    borderRadius: "12px",
    zIndex: 4000,
  },
};

export default Home;
