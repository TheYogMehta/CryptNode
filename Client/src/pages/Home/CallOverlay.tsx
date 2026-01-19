import React from "react";
import { styles } from "./Home.styles";

export const CallOverlay = ({ callState, onAccept, onReject, onHangup }: any) => {
  if (callState.status === "idle") return null;

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.glassModal, maxWidth: "400px", padding: "40px" }}>
        <div style={styles.avatarLarge}>
          {callState.remoteSid?.[0].toUpperCase()}
        </div>
        <h2 style={{ marginTop: "20px" }}>Peer {callState.remoteSid?.slice(0, 6)}</h2>
        <p style={{ color: "#94a3b8", marginBottom: "30px" }}>
          {callState.status === "calling" && "Calling..."}
          {callState.status === "ringing" && `Incoming ${callState.type} call...`}
          {callState.status === "connected" && "00:05"}
        </p>

        <div style={{ display: "flex", gap: "20px", justifyContent: "center" }}>
          {callState.status === "ringing" ? (
            <>
              <button 
                onClick={onAccept} 
                style={{ ...styles.iconBtnLarge, backgroundColor: "#22c55e" }}
              >
                📞
              </button>
              <button 
                onClick={onReject} 
                style={{ ...styles.iconBtnLarge, backgroundColor: "#ef4444" }}
              >
                ✖
              </button>
            </>
          ) : (
            <button 
              onClick={onHangup} 
              style={{ ...styles.iconBtnLarge, backgroundColor: "#ef4444", width: "100%" }}
            >
              End Call
            </button>
          )}
        </div>
      </div>
    </div>
  );
};