import React, { useEffect, useRef } from "react";
import { styles } from "./Home.styles";
import { ChatMessage } from "./types";

export const ChatWindow = ({ messages, input, setInput, onSend }: any) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
                background:
                  m.sender === "me"
                    ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                    : "#1e293b",
                wordBreak: "break-word", // FIX: Long text wrap
                overflowWrap: "anywhere", // FIX: Break strings with no spaces
                whiteSpace: "pre-wrap", // FIX: Keep line breaks
              }}
            >
              <div>{m.text}</div>
              {m.sender === "me" && (
                <div
                  style={{
                    fontSize: "0.65rem",
                    marginTop: "4px",
                    textAlign: "right",
                    color: m.status === 3 ? "#38bdf8" : "#cbd5f5",
                  }}
                >
                  {m.status === 1 ? "✔" : m.status === 2 ? "✔✔" : "✔✔"}
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
            onKeyDown={(e) => e.key === "Enter" && onSend()}
            placeholder="Write an encrypted message..."
            style={styles.inputField}
          />
          <button onClick={onSend} style={styles.sendBtn}>
            🚀
          </button>
        </div>
      </div>
    </div>
  );
};
