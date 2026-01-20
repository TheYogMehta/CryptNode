import React, { useEffect, useRef, useState } from "react";
import { styles } from "./Home.styles";
import { ChatMessage } from "./types";

export const ChatWindow = ({ messages, input, setInput, onSend }: any) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showPortModal, setShowPortModal] = useState(false);
  const [port, setPort] = useState("");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const attachments = [
    { label: "Document", icon: "📄", color: "#7f5af0" },
    { label: "Camera", icon: "📷", color: "#ff8906" },
    { label: "Gallery", icon: "🖼️", color: "#e53170" },
    { label: "Audio", icon: "🎧", color: "#2cb67d" },
    { label: "Live Share", icon: "🌐", color: "#3b82f6" }, // New Live Share Option
    { label: "Location", icon: "📍", color: "#34d399" },
  ];

  const handleSharePort = () => {
    if (port) {
      // Logic to send port info can be added here
      console.log("Sharing port:", port);
      setShowPortModal(false);
      setPort("");
    }
  };

  return (
    <div style={styles.chatContainer}>
      <div style={styles.messageArea} ref={scrollRef}>
        {messages.map((m: ChatMessage, i: number) => (
          <div
            key={i}
            style={{
              ...styles.messageRow,
              justifyContent: m.sender === "me" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                ...styles.bubble,
                background: m.sender === "me" 
                  ? "linear-gradient(135deg, #6366f1, #4f46e5)" 
                  : "#1e293b",
                borderRadius: m.sender === "me" ? "18px 18px 2px 18px" : "18px 18px 18px 2px",
              }}
            >
              <div>{m.text}</div>
              {m.sender === "me" && (
                <div style={{ fontSize: "0.65rem", marginTop: "4px", textAlign: "right", color: m.status === 3 ? "#38bdf8" : "#cbd5f5" }}>
                  {m.status === 1 ? "✓" : m.status === 2 ? "✓✓" : "✓✓"}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.inputWrapper}>
        {/* Attachment Grid */}
        {showMenu && (
          <div style={styles.attachmentGrid}>
            {attachments.map((item) => (
              <div 
                key={item.label} 
                style={styles.attachmentItem} 
                onClick={() => {
                  setShowMenu(false);
                  if (item.label === "Live Share") setShowPortModal(true);
                }}
              >
                <div style={{ ...styles.attachmentCircle, backgroundColor: item.color }}>
                  {item.icon}
                </div>
                <span style={styles.attachmentLabel}>{item.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Live Share Port Modal */}
        {showPortModal && (
          <div style={styles.portModal}>
            <div style={styles.portModalContent}>
              <h4 style={{ margin: "0 0 15px 0" }}>Live Share Config</h4>
              <p style={{ fontSize: "0.8rem", color: "#94a3b8", marginBottom: "15px" }}>Enter the port you want to expose:</p>
              <input 
                type="number" 
                placeholder="e.g. 3000" 
                value={port}
                onChange={(e) => setPort(e.target.value)}
                style={styles.portInput}
              />
              <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
                <button onClick={() => setShowPortModal(false)} style={styles.portCancelBtn}>Cancel</button>
                <button onClick={handleSharePort} style={styles.portSendBtn}>Send Invite</button>
              </div>
            </div>
          </div>
        )}

        <div style={styles.inputContainer}>
          <button 
            onClick={() => setShowMenu(!showMenu)} 
            style={{ 
              ...styles.plusBtn, 
              transform: showMenu ? "rotate(45deg)" : "rotate(0deg)",
            }}
          >
            ＋
          </button>
          
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Message..."
            style={styles.inputField}
          />
          <button onClick={onSend} style={styles.sendBtn}>🚀</button>
        </div>
      </div>
    </div>
  );
};