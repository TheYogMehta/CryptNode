import React from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { colors, radii, shadows } from "../../../../theme/design-system";
import { ModalOverlay } from "./Overlay.styles";

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const Spinner = styled.div`
  width: 28px;
  height: 28px;
  margin: 0 auto 12px;
  border-radius: 50%;
  border: 3px solid ${colors.border.subtle};
  border-top-color: ${colors.primary.main};
  animation: ${spin} 0.8s linear infinite;
`;

interface BlockingProgressOverlayProps {
  open?: boolean;
  title: string;
  description: string;
}

export const BlockingProgressOverlay: React.FC<BlockingProgressOverlayProps> = ({
  open = true,
  title,
  description,
}) => {
  if (!open) return null;

  return (
    <ModalOverlay
      style={{
        zIndex: 6000,
        background: "rgba(5, 10, 22, 0.55)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        style={{
          padding: "18px 22px",
          borderRadius: radii.lg,
          background: colors.surface.primary,
          border: `1px solid ${colors.border.subtle}`,
          color: colors.text.primary,
          minWidth: "240px",
          maxWidth: "min(92vw, 360px)",
          textAlign: "center",
          boxShadow: shadows.xl,
        }}
      >
        <Spinner />
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div
          style={{
            marginTop: "6px",
            fontSize: "12px",
            lineHeight: 1.55,
            color: colors.text.secondary,
          }}
        >
          {description}
        </div>
      </div>
    </ModalOverlay>
  );
};
