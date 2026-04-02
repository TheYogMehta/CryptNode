import React, { useState } from "react";
import { AlertTriangle, ExternalLink, ShieldX } from "lucide-react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import { addTrustedDomain } from "../../../../utils/trustedDomains";

interface UnsafeLinkModalProps {
  url: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export const UnsafeLinkModal: React.FC<UnsafeLinkModalProps> = ({
  url,
  onConfirm,
  onCancel,
}) => {
  const [trustDomain, setTrustDomain] = useState(false);
  const domain = extractDomain(url);

  const handleConfirm = () => {
    if (trustDomain) {
      addTrustedDomain(domain);
    }
    onConfirm();
  };

  return (
    <Dialog
      open={true}
      onClose={onCancel}
      PaperProps={{
        style: {
          backgroundColor: "#0f0f17",
          border: "1px solid rgba(239,68,68,0.35)",
          borderRadius: "16px",
          color: "#e2e8f0",
          maxWidth: "420px",
          width: "100%",
          overflow: "hidden",
        },
      }}
    >
      {/* Red top accent bar */}
      <div
        style={{
          height: "3px",
          background: "linear-gradient(90deg, #ef4444, #f97316)",
        }}
      />

      <DialogContent style={{ padding: "28px 28px 24px" }}>
        {/* Icon + Title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: "20px",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              background: "rgba(239,68,68,0.12)",
              border: "1.5px solid rgba(239,68,68,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShieldX size={26} color="#ef4444" />
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: "#f1f5f9",
                marginBottom: "4px",
              }}
            >
              External Link Warning
            </div>
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              This link leads outside the app
            </div>
          </div>
        </div>

        {/* Warning message */}
        <div
          style={{
            background: "rgba(239,68,68,0.07)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: "10px",
            padding: "12px 14px",
            marginBottom: "16px",
            display: "flex",
            gap: "10px",
            alignItems: "flex-start",
          }}
        >
          <AlertTriangle
            size={16}
            color="#f97316"
            style={{ marginTop: "2px", flexShrink: 0 }}
          />
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: "#cbd5e1",
              lineHeight: "1.55",
            }}
          >
            You are about to visit an <strong style={{ color: "#f1f5f9" }}>untrusted external website</strong>.
            This site is not affiliated with this app and could be harmful.
            Only continue if you trust this link.
          </p>
        </div>

        {/* URL preview */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              color: "#64748b",
              marginBottom: "4px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 600,
            }}
          >
            Destination URL
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "#93c5fd",
              fontFamily: "monospace",
              wordBreak: "break-all",
              lineHeight: "1.4",
            }}
          >
            {url}
          </div>
        </div>

        {/* Trust domain checkbox */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "24px",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={trustDomain}
            onChange={(e) => setTrustDomain(e.target.checked)}
            style={{
              width: "16px",
              height: "16px",
              accentColor: "#3b82f6",
              cursor: "pointer",
            }}
          />
          <span style={{ fontSize: "13px", color: "#94a3b8" }}>
            Always trust links from{" "}
            <strong style={{ color: "#cbd5e1" }}>{domain}</strong>
          </span>
        </label>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.05)",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
              transition: "all 0.15s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              e.currentTarget.style.color = "#e2e8f0";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              e.currentTarget.style.color = "#94a3b8";
            }}
          >
            Go Back
          </button>
          <button
            onClick={handleConfirm}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "10px",
              border: "none",
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
              color: "white",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "opacity 0.15s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <ExternalLink size={15} />
            Open in Browser
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
