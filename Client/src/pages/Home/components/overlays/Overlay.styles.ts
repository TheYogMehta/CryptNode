import styled from "@emotion/styled";
import { colors, spacing, radii, shadows } from "../../../../theme/design-system";

export const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background-color: ${colors.background.overlay};
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 4000;
  backdrop-filter: blur(8px);
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
