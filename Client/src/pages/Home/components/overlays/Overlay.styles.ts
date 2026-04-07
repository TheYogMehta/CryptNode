import styled from "@emotion/styled";
import { colors, spacing, radii, shadows } from "../../../../theme/design-system";

export const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background-color: ${colors.background.overlay};
  display: flex;
  justify-content: center;
  align-items: center;
  padding: ${spacing[4]};
  z-index: 4000;
  backdrop-filter: blur(8px);
`;

export const AppScreen = styled.div`
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  flex-direction: column;
  overflow: auto;
  background:
    radial-gradient(circle at top, rgba(99, 102, 241, 0.1), transparent 36%),
    ${colors.background.primary};
`;

export const AppScreenCenter = styled.div`
  flex: 1;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding:
    max(${spacing[6]}, env(safe-area-inset-top))
    max(${spacing[4]}, env(safe-area-inset-right))
    max(${spacing[6]}, env(safe-area-inset-bottom))
    max(${spacing[4]}, env(safe-area-inset-left));
`;

export const AppScreenPanel = styled.div`
  width: min(100%, 460px);
  background: ${colors.surface.primary};
  border: 1px solid ${colors.border.subtle};
  border-radius: ${radii["2xl"]};
  box-shadow: ${shadows["2xl"]};
  overflow: hidden;
  animation: slideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
`;

export const GlassModal = styled.div`
  background: ${colors.surface.primary};
  border: 1px solid ${colors.border.subtle};
  padding: ${spacing[6]};
  border-radius: ${radii["2xl"]};
  width: 90%;
  max-width: 340px;
  text-align: center;
  box-shadow: ${shadows["2xl"]};
  animation: scaleIn 0.2s ease-out;

  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
`;

export const DialogPanel = styled.div`
  width: min(100%, 420px);
  background: ${colors.surface.primary};
  border: 1px solid ${colors.border.subtle};
  border-radius: ${radii["2xl"]};
  box-shadow: ${shadows["2xl"]};
  overflow: hidden;
  animation: slideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
`;

export const DialogHeader = styled.div`
  padding: ${spacing[6]} ${spacing[6]} ${spacing[4]};
  border-bottom: 1px solid ${colors.border.subtle};
  background: linear-gradient(
    180deg,
    ${colors.background.secondary} 0%,
    ${colors.surface.primary} 100%
  );
`;

export const DialogTitle = styled.h3`
  margin: 0;
  color: ${colors.text.primary};
  font-size: 1.05rem;
  font-weight: 700;
`;

export const DialogDescription = styled.p`
  margin: ${spacing[2]} 0 0;
  color: ${colors.text.secondary};
  font-size: 0.94rem;
  line-height: 1.5;
`;

export const DialogBody = styled.div`
  padding: ${spacing[5]} ${spacing[6]};
  color: ${colors.text.primary};
`;

export const DialogFooter = styled.div`
  display: flex;
  gap: ${spacing[3]};
  padding: ${spacing[4]} ${spacing[6]} ${spacing[6]};

  @media (max-width: 480px) {
    flex-direction: column-reverse;
  }
`;

export const DialogBadge = styled.div<{ tone?: "default" | "danger" }>`
  display: inline-flex;
  align-items: center;
  gap: ${spacing[2]};
  padding: ${spacing[1]} ${spacing[3]};
  border-radius: ${radii.full};
  background: ${(props) =>
    props.tone === "danger" ? "rgba(239, 68, 68, 0.12)" : colors.primary.subtle};
  color: ${(props) =>
    props.tone === "danger" ? colors.status.error : colors.primary.main};
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  margin-bottom: ${spacing[3]};
`;

export const ModalButtons = styled.div`
  display: flex;
  gap: ${spacing[3]};
  margin-top: ${spacing[6]};
`;

export const PrimaryButton = styled.button`
  flex: 1;
  padding: ${spacing[3]} ${spacing[4]};
  background-color: ${colors.primary.main};
  border: none;
  color: white;
  border-radius: ${radii.md};
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${colors.primary.hover};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const CancelButton = styled.button`
  flex: 1;
  padding: ${spacing[3]} ${spacing[4]};
  background: transparent;
  border: 1px solid ${colors.border.subtle};
  color: ${colors.text.secondary};
  border-radius: ${radii.md};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: ${colors.surface.highlight};
    color: ${colors.text.primary};
  }
`;

export const InputField = styled.input`
  width: 100%;
  padding: ${spacing[3]};
  background-color: ${colors.background.tertiary};
  border: 1px solid ${colors.border.subtle};
  border-radius: ${radii.md};
  color: ${colors.text.primary};
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: ${colors.primary.main};
  }
`;

export const SetupCard = styled.div`
  max-width: 420px;
  width: 92%;
  align-self: center;
  margin: auto;
  padding: ${spacing[8]};
  border-radius: ${radii["2xl"]};
  background-color: ${colors.surface.primary};
  border: 1px solid ${colors.border.subtle};
  text-align: center;
  box-shadow: ${shadows.xl};
`;
