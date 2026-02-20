import React from "react";
import { SetupCard, InputField, PrimaryButton } from "./Overlay.styles";

interface ConnectionSetupProps {
  targetEmail: string;
  setTargetEmail: (val: string) => void;
  onConnect: () => void;
  isJoining: boolean;
}

import ChatClient from "../../../../services/core/ChatClient";
import { colors } from "../../../../theme/colors";

export const ConnectionSetup: React.FC<ConnectionSetupProps> = ({
  targetEmail,
  setTargetEmail,
  onConnect,
  isJoining,
}) => {
  const [pending, setPending] = React.useState<any[]>([]);

  React.useEffect(() => {
    const handleList = async (list: any[]) => {
      const decrypted = await Promise.all(
        list.map(async (item) => {
          try {
            const req = await ChatClient.sessionService.decryptFriendRequest(
              item.encryptedPacket,
              item.publicKey,
            );
            return { ...req, ...item };
          } catch (e) {
            return null;
          }
        }),
      );
      setPending(decrypted.filter(Boolean));
    };

    const handleNew = (req: any) => {
      setPending((prev) => {
        if (prev.find((p) => p.email === req.email)) return prev;
        return [...prev, req];
      });
    };

    ChatClient.on("pending_requests_list", handleList);
    ChatClient.on("inbound_request", handleNew);

    ChatClient.getPendingRequests();

    return () => {
      ChatClient.off("pending_requests_list", handleList);
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
        <InputField
          type="email"
          value={targetEmail}
          onChange={(e) => setTargetEmail(e.target.value)}
          placeholder="friend@example.com"
          onKeyDown={(e) => e.key === "Enter" && onConnect()}
        />

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
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
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
                  <div>
                    <div
                      style={{ color: colors.text.primary, fontWeight: 500 }}
                    >
                      {req.name || "Unknown"}
                    </div>
                    <div
                      style={{
                        color: colors.text.secondary,
                        fontSize: "0.8em",
                      }}
                    >
                      {req.email || "No Email"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => {
                      ChatClient.acceptFriend(req.email, req.publicKey, "");
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
                        prev.filter((p) => p.email !== req.email),
                      );
                    }}
                    style={{
                      background: "rgba(255,255,255,0.1)",
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px 12px",
                      color: colors.text.primary,
                      cursor: "pointer",
                      fontSize: "0.8em",
                    }}
                  >
                    Deny
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
