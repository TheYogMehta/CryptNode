import React from "react";
import { SetupCard, InputField, PrimaryButton } from "./Overlay.styles";

interface ConnectionSetupProps {
  targetEmail: string;
  setTargetEmail: (val: string) => void;
  onConnect: () => void;
  isJoining: boolean;
}

import ChatClient from "../../../../services/core/ChatClient";
import { getPendingRequests } from "../../../../services/storage/sqliteService";
import { colors } from "../../../../theme/colors";

export const ConnectionSetup: React.FC<ConnectionSetupProps> = ({
  targetEmail,
  setTargetEmail,
  onConnect,
  isJoining,
}) => {
  const [pending, setPending] = React.useState<any[]>([]);

  React.useEffect(() => {
    let mounted = true;

    const loadRequests = async () => {
      try {
        const reqs = await getPendingRequests();
        if (mounted) setPending(reqs);
      } catch (err) {
        console.error("Failed to load local friend requests", err);
      }
    };

    const handleNew = () => {
      if (!mounted) return;
      loadRequests();
    };

    ChatClient.on("inbound_request", handleNew);

    loadRequests();

    return () => {
      mounted = false;
      ChatClient.off("inbound_request", handleNew);
    };
  }, []);

  return (
    <SetupCard>
      <h3 className="title-large" style={{ marginTop: 0 }}>
        Establish Connection
      </h3>
      <p style={{ color: colors.text.secondary, marginBottom: "24px" }}>
        Enter your friend's email address to start a secure chat.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          background: colors.surfaceHighlight, 
          borderRadius: "8px", 
          border: `1px solid ${colors.border}`, 
          overflow: "hidden" 
        }}>
          <input
            type="text"
            value={targetEmail}
            onChange={(e) => setTargetEmail(e.target.value.replace(/@.*$/, "").trim())}
            placeholder="username"
            onKeyDown={(e) => e.key === "Enter" && onConnect()}
            style={{ 
              flex: 1, 
              padding: "12px", 
              background: "transparent", 
              border: "none", 
              color: colors.text.primary, 
              outline: "none", 
              fontSize: "1rem" 
            }}
          />
          <span style={{ 
            padding: "0 12px", 
            color: colors.text.secondary,
            borderLeft: `1px solid ${colors.border}`,
            whiteSpace: "nowrap",
            flexShrink: 0
          }}>
            @gmail.com
          </span>
        </div>

        <PrimaryButton
          onClick={onConnect}
          disabled={isJoining || !targetEmail.trim()}
        >
          {isJoining ? "Sending Request..." : "Connect"}
        </PrimaryButton>
      </div>

      {pending.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <h4
            style={{
              color: colors.text.primary,
              borderBottom: `1px solid ${colors.border}`,
              paddingBottom: "8px",
            }}
          >
            Pending Requests
          </h4>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {pending.map((req, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(255,255,255,0.05)",
                  padding: "10px",
                  borderRadius: "8px",
                  gap: "10px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}
                >
                  {req.avatar ? (
                    <img
                      src={
                        req.avatar.startsWith("data:")
                          ? req.avatar
                          : `data:image/jpeg;base64,${req.avatar}`
                      }
                      alt={req.name}
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        background: colors.primary,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontWeight: "bold",
                      }}
                    >
                      {req.name?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{ 
                        color: colors.text.primary, 
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                      }}
                    >
                      {req.name || "Unknown"}
                    </div>
                    <div
                      style={{
                        color: colors.text.secondary,
                        fontSize: "0.8em",
                        wordBreak: "break-all"
                      }}
                    >
                      {req.email || "No Email"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      ChatClient.acceptFriend(
                        req.email,
                        req.publicKey,
                        req.senderHash,
                      );
                      setPending((prev) =>
                        prev.filter((p) => p.email !== req.email),
                      );
                    }}
                    style={{
                      background: colors.primary,
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px 12px",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: "0.8em",
                    }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => {
                      ChatClient.denyFriend(req.email);
                      setPending((prev) =>
                        prev.filter(
                          (p) =>
                            p.email === req.email ||
                            p.senderHash === req.senderHash,
                        ),
                      );
                    }}
                    style={{
                      background: "rgba(255, 255, 255, 0.15)",
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px 12px",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: "0.8em",
                    }}
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => {
                      ChatClient.blockUser(req.email);
                      setPending((prev) =>
                        prev.filter(
                          (p) =>
                            p.email === req.email ||
                            p.senderHash === req.senderHash,
                        ),
                      );
                    }}
                    style={{
                      background: "rgba(255, 60, 60, 0.15)",
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px 12px",
                      color: "#ff3c3c",
                      cursor: "pointer",
                      fontSize: "0.8em",
                    }}
                  >
                    Block
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SetupCard>
  );
};
