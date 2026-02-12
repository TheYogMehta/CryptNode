import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from "../theme/design-system";

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const scaleIn = keyframes`
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

export const LoginContainer = styled.div`
  display: flex;
  height: 100vh;
  flex-direction: column;
  padding: max(40px, env(safe-area-inset-top)) 20px 20px;
  justify-content: center;
  align-items: center;
  gap: 2rem;
  background: radial-gradient(
      circle at 50% 10%,
      rgba(99, 102, 241, 0.15) 0%,
      transparent 60%
    ),
    ${colors.background.primary};
  color: ${colors.text.primary};
  overflow: hidden;
  font-family: ${typography.fontFamily.sans};
`;

export const HeaderSection = styled.div`
  text-align: center;
  animation: ${fadeIn} 0.6s ease-out;
`;

export const Title = styled.h1`
  margin-bottom: 0.5rem;
  font-size: 3.5rem;
  font-weight: ${typography.fontWeight.bold};
  color: ${colors.text.primary};

  span {
    color: ${colors.primary.main};
  }
`;

export const Subtitle = styled.p`
  color: ${colors.text.secondary};
  margin-bottom: 2rem;
  letter-spacing: 0.5px;
  font-size: ${typography.fontSize.base};
`;

export const LoginCard = styled.div`
  padding: 2.5rem;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  width: 90%;
  max-width: 380px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  background-color: ${colors.background.overlay};
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid ${colors.border.subtle};
  animation: ${scaleIn} 0.5s ease-out 0.2s backwards;
`;

export const LogoIcon = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  font-size: 32px;
  font-weight: bold;
  color: white;
`;

export const WelcomeTitle = styled.h3`
  margin: 0;
  font-weight: 700;
  color: ${colors.text.primary};
  font-size: 1.5rem;
`;

export const WelcomeText = styled.p`
  font-size: 0.95rem;
  color: ${colors.text.secondary};
  text-align: center;
  line-height: 1.6;
  margin: 0;
`;

export const GoogleButton = styled.button<{ isLoading?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background-color: white;
  color: #3c4043;
  border: none;
  border-radius: 24px;
  padding: 12px 24px;
  font-size: 1rem;
  font-weight: 500;
  cursor: ${(props) => (props.isLoading ? "not-allowed" : "pointer")};
  width: 100%;
  max-width: 260px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.1s, opacity 0.2s;
  opacity: ${(props) => (props.isLoading ? 0.7 : 1)};

  &:active {
    transform: ${(props) => !props.isLoading && "scale(0.98)"};
  }

  &:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }
`;

export const LoadingSpinner = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid #3c4043;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`;

export const LoadingText = styled.p`
  margin-top: 1rem;
  font-size: 0.85rem;
  color: ${colors.text.secondary};
  animation: ${pulse} 1.5s infinite;
`;
