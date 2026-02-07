import React from "react";
import { colors } from "../../../../theme/colors";
import { SetupCard, InputField, PrimaryButton } from "./Overlay.styles";

interface ConnectionSetupProps {
  targetEmail: string;
  setTargetEmail: (val: string) => void;
  onConnect: () => void;
  isJoining: boolean;
}

export const ConnectionSetup: React.FC<ConnectionSetupProps> = ({
  targetEmail,
  setTargetEmail,
  onConnect,
  isJoining,
}) => (
  <SetupCard>
    <h3 className="title-large" style={{ marginTop: 0 }}>Establish Connection</h3>
    <p style={{ color: colors.text.secondary, marginBottom: '24px' }}>Enter your friend's email address to start a secure chat.</p>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <InputField
        type="email"
        value={targetEmail}
        onChange={(e) => setTargetEmail(e.target.value)}
        placeholder="friend@example.com"
        onKeyDown={(e) => e.key === 'Enter' && onConnect()}
      />

      <PrimaryButton
        onClick={onConnect}
        disabled={isJoining || !targetEmail.trim()}
      >
        {isJoining ? "Sending Request..." : "Connect"}
      </PrimaryButton>
    </div>
  </SetupCard>
);
