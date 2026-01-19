import React, { useEffect, useRef } from "react";
import { styles } from "./Home.styles";
import { ChatMessage } from "./types";

export const ChatWindow = ({ messages, input, setInput, onSend }: any) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize logic for textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

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
                wordBreak: "break-word",
                overflowWrap: "anywhere",
                whiteSpace: "pre-wrap",
                position: "relative",
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
        <div style={styles.inputContainer}>
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
            placeholder="Write an encrypted message..."
            style={styles.inputField}
          />
          <button onClick={onSend} style={styles.sendBtn}>🚀</button>
        </div>
      </div>
    </div>
  );
};