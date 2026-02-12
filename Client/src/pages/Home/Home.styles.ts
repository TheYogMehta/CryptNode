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
  background-color: ${colors.background.primary};
  color: ${colors.text.primary};
  overflow: hidden;
  font-family: ${typography.fontFamily.sans};
  transition: background-color 0.3s ease, color 0.3s ease;
`;

export const MainContent = styled.main`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: ${colors.background.secondary};

  @media (max-width: 768px) {
    width: 100%;
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
