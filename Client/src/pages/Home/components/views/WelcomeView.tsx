import React, { useEffect, useState } from "react";
import { styles } from "../../Home.styles";
import { UserPlus, MessageSquare, Shield } from "lucide-react";

export const WelcomeView = ({ onAddFriend }: { onAddFriend: () => void }) => {
  const [greeting, setGreeting] = useState("Good Morning");

  useEffect(() => {
    const hours = new Date().getHours();
    if (hours < 12) setGreeting("Good Morning");
    else if (hours < 18) setGreeting("Good Afternoon");
    else setGreeting("Good Evening");
  }, []);

  return (
    <div
      style={{
        ...styles.chatWindow,
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        background: "radial-gradient(circle at 50% 10%, rgba(99, 102, 241, 0.1) 0%, transparent 50%)",
      }}
      className="animate-fade-up"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "24px",
          maxWidth: "500px",
          padding: "40px",
        }}
      >
        <div 
            className="animate-scale-in"
            style={{
                width: '80px',
                height: '80px',
                borderRadius: '24px',
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 20px 40px -10px rgba(99, 102, 241, 0.5)'
            }}
        >
            <MessageSquare size={40} color="white" />
        </div>

        <div style={{ marginTop: "16px" }}>
          <h1 className="title-large" style={{ 
              marginBottom: "8px", 
              fontSize: "3rem",
              background: "linear-gradient(to right, #fff, #818cf8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
          }}>
            {greeting}
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "1.1rem", lineHeight: "1.6" }}>
            Welcome to <span style={{ color: "white", fontWeight: 600 }}>Chatapp</span>. 
            Secure, fast, and private messaging for everyone.
          </p>
        </div>

        <div style={{ 
            display: 'flex', 
            gap: '16px', 
            marginTop: '24px',
            flexWrap: 'wrap',
            justifyContent: 'center'
        }}>
            <button
            onClick={onAddFriend}
            style={{
                padding: "16px 32px",
                borderRadius: "20px",
                border: "none",
                background: "#6366f1",
                color: "white",
                fontSize: "1rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
                transition: "transform 0.2s"
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.96)"}
            onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
            >
            <UserPlus size={20} />
            <span>Add Friend</span>
            </button>

             <div style={{
                padding: "16px 24px",
                borderRadius: "20px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.03)",
                color: "#94a3b8",
                fontSize: "0.9rem",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: "10px",
            }}>
                <Shield size={18} />
                <span>End-to-End Encrypted</span>
            </div>
        </div>

      </div>
    </div>
  );
};
