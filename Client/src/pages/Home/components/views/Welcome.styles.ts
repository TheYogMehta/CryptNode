import styled from "@emotion/styled";
import { colors, spacing, radii, typography } from "../../../../theme/design-system";

export const WelcomeContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
  width: 100%;
  background: radial-gradient(
    circle at 50% 10%,
    ${colors.primary.subtle} 0%,
    transparent 50%
  );
`;

export const WelcomeContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${spacing[6]};
  max-width: 500px;
  padding: ${spacing[10]};
`;

export const IconWrapper = styled.div`
  width: 80px;
  height: 80px;
  border-radius: ${radii["2xl"]};
  background: linear-gradient(135deg, ${colors.primary.DEFAULT} 0%, #a855f7 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 20px 40px -10px ${colors.primary.subtle};
`;

export const GreetingTitle = styled.h1`
  margin-bottom: ${spacing[2]};
  font-size: ${typography.fontSize["3xl"]};
  background: linear-gradient(to right, #fff, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`;

export const WelcomeMessage = styled.p`
  color: ${colors.text.secondary};
  font-size: 1.1rem;
  line-height: 1.6;

  span {
    color: ${colors.text.primary};
    font-weight: 600;
  }
`;

export const ActionButtons = styled.div`
  display: flex;
  gap: ${spacing[4]};
  margin-top: ${spacing[6]};
  flex-wrap: wrap;
  justify-content: center;
`;

export const AddFriendButton = styled.button`
  padding: ${spacing[4]} ${spacing[8]};
  border-radius: ${radii.xl};
  border: none;
  background: ${colors.primary.DEFAULT};
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  box-shadow: 0 4px 12px ${colors.primary.subtle};
  transition: transform 0.2s;

  &:active {
    transform: scale(0.96);
  }
`;

export const EncryptedBadge = styled.div`
  padding: ${spacing[4]} ${spacing[6]};
  border-radius: ${radii.xl};
  border: 1px solid ${colors.border.subtle};
  background: ${colors.border.subtle};
  color: ${colors.text.secondary};
  font-size: 0.9rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
`;
