import styled from "@emotion/styled";
import {
  colors,
  spacing,
  typography,
  radii,
  shadows,
} from "../../theme/design-system";

export const AppContainer = styled.div`
  display: flex;
  height: 100vh;
  padding: 14px;
  gap: 14px;
  background:
    radial-gradient(circle at top left, ${colors.primary.subtle} 0%, transparent 28%),
    radial-gradient(circle at bottom right, rgba(56, 189, 248, 0.1) 0%, transparent 24%),
    ${colors.background.primary};
  color: ${colors.text.primary};
  overflow: hidden;
  font-family: ${typography.fontFamily.sans};
  transition: background-color 0.3s ease, color 0.3s ease;

  @media (max-width: 768px) {
    padding: 0;
    gap: 0;
    background: ${colors.background.primary};
  }
`;

export const MainContent = styled.main`
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(circle at top, ${colors.primary.subtle} 0%, transparent 38%),
    linear-gradient(180deg, ${colors.background.secondary} 0%, ${colors.background.primary} 100%);
  border: 1px solid ${colors.border.subtle};
  border-radius: ${radii["3xl"]};
  box-shadow: 0 32px 80px -44px rgba(15, 23, 42, 0.45);

  @media (max-width: 768px) {
    width: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }
`;

export const MobileHeader = styled.div`
  position: sticky;
  top: 0;
  z-index: 100;
  padding: ${spacing[4]} ${spacing[6]};
  padding-top: max(${spacing[4]}, env(safe-area-inset-top));
  min-height: 64px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid ${colors.border.subtle};
  background-color: ${colors.background.overlay};
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
`;

export const HeaderTitle = styled.h2`
  font-size: ${typography.fontSize.lg};
  font-weight: ${typography.fontWeight.bold};
  margin: 0;
  cursor: pointer;
  color: ${colors.text.primary};
`;

export const MenuButton = styled.button`
  background: none;
  border: none;
  color: ${colors.text.primary};
  font-size: 24px;
  margin-right: ${spacing[4]};
  padding: ${spacing[2]};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${radii.md};
  transition: background-color 0.2s;

  &:hover {
    background-color: ${colors.background.tertiary};
  }
`;

export const ErrorToast = styled.div`
  position: fixed;
  top: 20px;
  right: 20px;
  background-color: ${colors.status.error};
  padding: ${spacing[3]} ${spacing[6]};
  border-radius: ${radii.lg};
  z-index: 5000;
  font-weight: ${typography.fontWeight.bold};
  color: white;
  box-shadow: ${shadows.lg};
  animation: slideIn 0.3s ease-out;

  @keyframes slideIn {
    from {
      transform: translateY(-20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
`;
