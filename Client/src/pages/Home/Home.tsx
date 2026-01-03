import React, { useState, useEffect, useRef } from "react";
import ChatClient from "../../services/ChatClient.ts";
import { queryDB } from "../../services/sqliteService";

interface ChatMessage {
  sid: string;
  text: string;
  sender: "me" | "other";
  status?: 1 | 2 | 3;
}

interface InboundReq {
  sid: string;
  publicKey: string;
}

const Home = () => {
  const [view, setView] = useState<"chat" | "add">("chat");
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [input, setInput] = useState("");

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [inboundReq, setInboundReq] = useState<InboundReq | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [peerOnline, setPeerOnline] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  const activeChatRef = useRef<string | null>(null);
  activeChatRef.current = activeChat;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const onPresence = ({ sid, online }: any) => {
      if (sid === activeChat) {
        setPeerOnline(online);

        if (online) {
          setMessages((prev) =>
            prev.map((m) =>
              m.sender === "me" && m.status === 1 ? { ...m, status: 2 } : m
            )
          );
        }
      }
    };
  }, [activeChat]);

  useEffect(() => {
    if (!activeChat) {
      setPeerOnline(false);
      return;
    }

    const session = ChatClient.sessions[activeChat];
    setPeerOnline(session?.online ?? false);
  }, [activeChat]);

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
    const onWaiting = (waiting: boolean) => {
      setIsWaiting(waiting);
      if (!waiting) setIsJoining(false);
    };
    const onJoined = (sid: string) => {
      setActiveChat(sid);
      setView("chat");
      setIsSidebarOpen(false);
      setIsJoining(false);
    };
    const onError = (msg: string) => {
      setError(msg);
      setIsGenerating(false);
      setIsJoining(false);
      setTimeout(() => setError(null), 4000);
    };

    const onMessage = (msg: ChatMessage) => {
      if (msg.sid === activeChatRef.current) {
        setMessages((prev): ChatMessage[] => [
          ...prev.map((m) =>
            m.sender === "me" && m.status === 2 ? { ...m, status: 3 as 3 } : m
          ),
          msg,
        ]);
      }
    };

    ChatClient.on("session_updated", onSessionUpdate);
    ChatClient.on("invite_ready", onInviteReady);
    ChatClient.on("inbound_request", onInboundReq);
    ChatClient.on("waiting_for_accept", onWaiting);
    ChatClient.on("joined_success", onJoined);
    ChatClient.on("error", onError);
    ChatClient.on("message", onMessage);
    ChatClient.on("message_delivered", (sid) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.sender === "me" && m.sid === sid && m.status === 1
            ? { ...m, status: 2 }
            : m
        )
      );
    });
    ChatClient.on("message_read", (sid) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.sender === "me" && m.sid === sid ? { ...m, status: 3 } : m
        )
      );
    });

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

  useEffect(() => {
    if (activeChat) {
      queryDB("SELECT * FROM messages WHERE sid = ?", [activeChat]).then(
        (rows: any) => setMessages(rows)
      );
    }
  }, [activeChat]);

  const handleSend = async () => {
    if (!input.trim() || !activeChat) return;
    const currentInput = input;
    setInput("");
    await ChatClient.sendMessage(activeChat, currentInput);
    setMessages((prev) => [
      ...prev,
      {
        sid: activeChat,
        text: currentInput,
        sender: "me",
        status: ChatClient.sessions[activeChat]?.online ? 2 : 1,
      },
    ]);
  };

  const handleConnect = async () => {
    if (joinCode.length < 6) return;
    setIsJoining(true);
    await ChatClient.joinByCode(joinCode);
  };

  const resetToHome = () => {
    setActiveChat(null);
    setView("chat");
    setIsSidebarOpen(false);
  };

  return (
    <div style={styles.appContainer}>
      {error && <div style={styles.errorToast}>{error}</div>}

      {/* SIDEBAR OVERLAY */}
      {isSidebarOpen && isMobile && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          style={styles.mobileOverlay}
        />
      )}

      {/* SIDEBAR */}
      <nav
        style={{
          ...styles.sidebar,
          left: isMobile ? (isSidebarOpen ? 0 : "-100%") : 0,
          position: isMobile ? "fixed" : "relative",
        }}
      >
        <div style={styles.sidebarHeader}>
          <h2 style={styles.logo} onClick={resetToHome}>
            Ghost<span>Talk</span>
          </h2>
          {isMobile && (
            <button
              onClick={() => setIsSidebarOpen(false)}
              style={styles.closeBtn}
            >
              ✕
            </button>
          )}
        </div>

        <div style={styles.sessionList}>
          <p style={styles.sectionLabel}>SECURE SESSIONS</p>
          {sessions.length === 0 && (
            <p style={styles.emptyText}>No active links</p>
          )}
          {sessions.map((sid) => (
            <div
              key={sid}
              onClick={() => {
                setActiveChat(sid);
                setView("chat");
                setIsSidebarOpen(false);
              }}
              style={{
                ...styles.sessionItem,
                background:
                  activeChat === sid
                    ? "rgba(99, 102, 241, 0.15)"
                    : "transparent",
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
                {sid.slice(0, 1).toUpperCase()}
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
          <button
            onClick={() => {
              setView("add");
              setActiveChat(null);
              setIsSidebarOpen(false);
            }}
            style={styles.addBtn}
          >
            <span>+</span> Add New Peer
          </button>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main style={styles.mainContent}>
        <header style={styles.mainHeader}>
          {isMobile && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              style={styles.menuBtn}
            >
              ☰
            </button>
          )}
          <div onClick={resetToHome} style={{ cursor: "pointer" }}>
            <h2 style={styles.headerTitle}>
              {activeChat
                ? `Session ${activeChat.slice(0, 8)}`
                : "Secure Gateway"}
            </h2>

            {activeChat && (
              <div
                style={{
                  fontSize: "0.7rem",
                  color: peerOnline ? "#22c55e" : "#94a3b8",
                  marginTop: "2px",
                }}
              >
                {peerOnline ? "● Online" : "● Offline"}
              </div>
            )}
          </div>
        </header>

        <div style={styles.contentBody}>
          {activeChat ? (
            <div style={styles.chatContainer}>
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
                            ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                            : "#1e293b",
                      }}
                    >
                      <div>{m.text}</div>

                      {m.sender === "me" && (
                        <div
                          style={{
                            fontSize: "0.65rem",
                            marginTop: "4px",
                            textAlign: "right",
                            color:
                              m.status === 1
                                ? "#cbd5f5" // grey single tick
                                : m.status === 2
                                ? "#cbd5f5" // grey double tick
                                : "#38bdf8", // blue double tick
                          }}
                        >
                          {m.status === 1 && "✔"}
                          {m.status === 2 && "✔✔"}
                          {m.status === 3 && "✔✔"}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div style={styles.inputWrapper}>
                <div style={styles.inputContainer}>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Write an encrypted message..."
                    style={styles.inputField}
                  />
                  <button onClick={handleSend} style={styles.sendBtn}>
                    🚀
                  </button>
                </div>
              </div>
            </div>
          ) : view === "add" ? (
            <div style={styles.setupCard}>
              <h3>Establish Connection</h3>
              <p style={styles.setupSub}>
                Create a gateway or join an existing peer.
              </p>

              <button
                onClick={() => {
                  setIsGenerating(true);
                  ChatClient.createInvite();
                }}
                style={styles.primaryBtn}
                disabled={isGenerating}
              >
                {isGenerating ? "Generating..." : "Generate Invite Code"}
              </button>

              {inviteCode && (
                <div
                  style={styles.inviteCodeContainer}
                  onClick={() => navigator.clipboard.writeText(inviteCode)}
                >
                  <p style={styles.codeLabel}>TAP TO COPY CODE</p>
                  <h1 style={styles.codeText}>{inviteCode}</h1>
                </div>
              )}

              <div style={styles.divider}>
                <span>OR JOIN PEER</span>
              </div>

              <div style={styles.joinRow}>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  style={styles.joinInput}
                />
                <button
                  onClick={handleConnect}
                  style={styles.connectBtn}
                  disabled={isJoining}
                >
                  {isJoining ? "..." : "Connect"}
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.emptyState}>
              <div style={styles.heroIcon}>🛡️</div>
              <h2>Zero-Knowledge Encryption</h2>
              <p>Select a peer to begin or add a new one.</p>
            </div>
          )}
        </div>
      </main>

      {/* OVERLAY FOR REQUESTS */}
      {(inboundReq || isWaiting) && (
        <div style={styles.modalOverlay}>
          <div style={styles.glassModal}>
            {isWaiting ? (
              <>
                <div style={styles.spinner}></div>
                <h3>Waiting for Peer...</h3>
                <p>Establishing secure handshake.</p>
                <button
                  onClick={() => setIsWaiting(false)}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <h3>Peer Request</h3>
                <p>Accept link from {inboundReq?.sid.slice(0, 8)}?</p>
                <div style={styles.modalButtons}>
                  <button
                    onClick={async () => {
                      await ChatClient.acceptFriend(
                        inboundReq!.sid,
                        inboundReq!.publicKey
                      );
                      setInboundReq(null);
                    }}
                    style={styles.primaryBtn}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => setInboundReq(null)}
                    style={styles.cancelBtn}
                  >
                    Decline
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  appContainer: {
    display: "flex",
    height: "100vh",
    backgroundColor: "#020617",
    color: "#f8fafc",
    fontFamily: "'Inter', sans-serif",
  },
  sidebar: {
    width: "320px",
    height: "100%",
    backgroundColor: "#0b1120",
    borderRight: "1px solid #1e293b",
    zIndex: 2000,
    transition: "0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    display: "flex",
    flexDirection: "column",
  },
  sidebarHeader: {
    padding: "24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #1e293b",
  },
  logo: {
    fontSize: "1.2rem",
    fontWeight: 800,
    color: "#6366f1",
    margin: 0,
    cursor: "pointer",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "white",
    fontSize: 24,
  },
  sessionList: { flex: 1, overflowY: "auto", padding: "16px" },
  sectionLabel: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "#475569",
    letterSpacing: "1px",
    marginBottom: "12px",
    paddingLeft: "8px",
  },
  sessionItem: {
    display: "flex",
    alignItems: "center",
    padding: "12px",
    borderRadius: "12px",
    cursor: "pointer",
    marginBottom: "4px",
    transition: "0.2s",
  },
  avatar: {
    width: "40px",
    height: "40px",
    borderRadius: "10px",
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    marginRight: "12px",
    color: "#818cf8",
  },
  sessionInfo: { flex: 1 },
  sessionName: { fontSize: "0.9rem", fontWeight: 600 },
  sessionStatus: { fontSize: "0.7rem", color: "#10b981", marginTop: "2px" },
  sidebarFooter: { padding: "16px", borderTop: "1px solid #1e293b" },
  addBtn: {
    width: "100%",
    padding: "14px",
    borderRadius: "10px",
    backgroundColor: "#6366f1",
    border: "none",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
  },

  mainContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    position: "relative",
  },
  mainHeader: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    paddingTop: "env(safe-area-inset-top, 16px)",
    paddingLeft: 24,
    paddingRight: 24,
    minHeight: 64,
    display: "flex",
    alignItems: "center",
    borderBottom: "1px solid #1e293b",
    backgroundColor: "rgba(11, 17, 32, 0.8)",
    backdropFilter: "blur(12px)",
  },
  headerTitle: {
    fontSize: "1rem",
    fontWeight: 700,
    margin: 0,
    cursor: "pointer",
  },
  menuBtn: {
    background: "none",
    border: "none",
    color: "white",
    fontSize: 24,
    marginRight: "16px",
    padding: "8px",
    touchAction: "manipulation",
  },
  contentBody: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    overflow: "hidden",
  },
  chatContainer: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  messageArea: { flex: 1, overflowY: "auto", padding: "24px" },
  messageRow: { display: "flex", marginBottom: "12px" },
  bubble: {
    padding: "12px 16px",
    borderRadius: "16px",
    maxWidth: "80%",
    fontSize: "0.95rem",
    lineHeight: "1.5",
  },
  inputWrapper: { padding: "16px 24px 24px" },
  inputContainer: {
    display: "flex",
    backgroundColor: "#0f172a",
    borderRadius: "14px",
    border: "1px solid #1e293b",
    padding: "4px",
  },
  inputField: {
    flex: 1,
    background: "none",
    border: "none",
    padding: "12px 16px",
    color: "white",
    outline: "none",
  },
  sendBtn: {
    background: "#6366f1",
    border: "none",
    color: "white",
    width: "40px",
    height: "40px",
    borderRadius: "10px",
    cursor: "pointer",
  },

  setupCard: {
    maxWidth: "420px",
    width: "92%",
    alignSelf: "center",
    padding: "32px",
    borderRadius: "24px",
    backgroundColor: "#0b1120",
    border: "1px solid #1e293b",
    textAlign: "center" as "center",
  },
  setupSub: { color: "#94a3b8", fontSize: "0.85rem", marginBottom: "24px" },
  primaryBtn: {
    width: "100%",
    padding: "14px",
    borderRadius: "10px",
    backgroundColor: "#6366f1",
    border: "none",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
  inviteCodeContainer: {
    marginTop: "20px",
    padding: "20px",
    borderRadius: "12px",
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    border: "1px dashed #6366f1",
    cursor: "pointer",
  },
  codeLabel: {
    fontSize: "0.6rem",
    fontWeight: 800,
    color: "#818cf8",
    marginBottom: "4px",
  },
  codeText: {
    fontSize: "2.2rem",
    letterSpacing: "6px",
    margin: 0,
    color: "white",
  },
  divider: {
    margin: "32px 0",
    textAlign: "center",
    borderBottom: "1px solid #1e293b",
    lineHeight: "0.1em",
  },
  joinRow: { display: "flex", gap: "10px" },
  joinInput: {
    flex: 1,
    backgroundColor: "#020617",
    border: "1px solid #1e293b",
    borderRadius: "10px",
    padding: "12px",
    color: "white",
    textAlign: "center",
    fontSize: "1.1rem",
  },
  connectBtn: {
    padding: "0 20px",
    borderRadius: "10px",
    backgroundColor: "#6366f1",
    border: "none",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
  },

  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.3,
    textAlign: "center",
  },
  heroIcon: { fontSize: "64px", marginBottom: "16px" },
  mobileOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 1500,
    backdropFilter: "blur(4px)",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 3000,
  },
  glassModal: {
    background: "#0b1120",
    border: "1px solid #1e293b",
    padding: "32px",
    borderRadius: "24px",
    width: "90%",
    maxWidth: "340px",
    textAlign: "center",
  },
  modalButtons: { display: "flex", gap: "12px", marginTop: "24px" },
  cancelBtn: {
    flex: 1,
    padding: "12px",
    background: "transparent",
    border: "1px solid #334155",
    color: "white",
    borderRadius: "10px",
    cursor: "pointer",
  },
  errorToast: {
    position: "fixed",
    top: 20,
    right: 20,
    backgroundColor: "#ef4444",
    padding: "12px 24px",
    borderRadius: "12px",
    zIndex: 5000,
    fontWeight: 700,
  },
  spinner: {
    width: "30px",
    height: "30px",
    border: "3px solid rgba(255,255,255,0.1)",
    borderTopColor: "#6366f1",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    margin: "0 auto 15px",
  },
};

export default Home;
