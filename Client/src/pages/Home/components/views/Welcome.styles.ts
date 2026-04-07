import styled from "@emotion/styled";
import { colors, spacing, radii, typography } from "../../../../theme/design-system";

export const WelcomeContainer = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
  width: 100%;
  overflow: hidden;
  padding: clamp(80px, 10vh, 120px) 0 clamp(20px, 3.5vh, 40px) 0;
  background: radial-gradient(
    circle at 50% 10%,
    ${colors.primary.subtle} 0%,
    transparent 50%
  );

  @media (max-width: 768px), (max-height: 900px) {
    overflow-y: auto;
    overflow-x: hidden;
    justify-content: flex-start;
    padding:
      ${spacing[5]}
      0
      max(${spacing[6]}, env(safe-area-inset-bottom))
      0;
  }
`;

export const WelcomeContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(${spacing[5]}, 2.4vh, ${spacing[6]});
  max-width: 760px;
  width: 100%;
  padding: clamp(${spacing[6]}, 3vw, ${spacing[10]});
  margin: 0 auto;

  @media (max-width: 768px) {
    padding: ${spacing[5]};
  }
`;

export const WelcomeHero = styled.div`
  width: min(100%, 760px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(${spacing[5]}, 2.4vh, ${spacing[6]});
  margin: 0 auto;
  text-align: center;
`;

export const WelcomeEyebrow = styled.div`
  padding: ${spacing[1]} ${spacing[3]};
  border-radius: ${radii.full};
  background: ${colors.background.tertiary};
  border: 1px solid ${colors.border.subtle};
  color: ${colors.text.secondary};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.semibold};
  letter-spacing: 0.06em;
`;

export const IconWrapper = styled.div`
  width: 80px;
  height: 80px;
  margin: 0 auto;
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
  color: ${colors.text.primary};
`;

export const WelcomeMessage = styled.p`
  color: ${colors.text.secondary};
  font-size: 1.1rem;
  line-height: 1.6;
  max-width: 620px;

  span {
    color: ${colors.text.primary};
    font-weight: 600;
  }
`;

export const ActionButtons = styled.div`
  display: flex;
  gap: ${spacing[4]};
  margin-top: ${spacing[2]};
  flex-wrap: wrap;
  justify-content: center;
`;

export const AddFriendButton = styled.button`
  padding: ${spacing[4]} ${spacing[8]};
  border-radius: ${radii.xl};
  border: 1px solid ${colors.border.subtle};
  background: ${colors.surface.primary};
  color: ${colors.text.primary};
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  transition: transform 0.2s;

  &:hover {
    background: ${colors.background.tertiary};
  }

  &:active {
    transform: scale(0.96);
  }
`;

export const SecondaryActionButton = styled.button`
  padding: ${spacing[4]} ${spacing[6]};
  border-radius: ${radii.xl};
  border: 1px solid ${colors.border.subtle};
  background: ${colors.surface.primary};
  color: ${colors.text.primary};
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};

  &:hover {
    background: ${colors.background.tertiary};
  }
`;

export const HighlightsSection = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: ${spacing[4]};
  margin-top: ${spacing[2]};
`;

export const HighlightsHeader = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${spacing[2]};
  text-align: left;
`;

export const HighlightsEyebrow = styled.div`
  padding: ${spacing[2]} ${spacing[4]};
  border-radius: ${radii.full};
  background: ${colors.surface.secondary};
  border: 1px solid ${colors.border.subtle};
  color: ${colors.text.secondary};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  letter-spacing: 0.08em;
`;

export const HighlightsHeading = styled.h2`
  margin: 0;
  color: ${colors.text.primary};
  font-size: ${typography.fontSize.xl};
  font-weight: ${typography.fontWeight.semibold};
`;

export const HighlightsSubtext = styled.p`
  margin: 0;
  color: ${colors.text.secondary};
  font-size: ${typography.fontSize.sm};
  line-height: 1.6;
  max-width: 560px;
`;

export const HighlightsGrid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: ${spacing[4]};

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

export const HighlightCard = styled.div`
  padding: ${spacing[5]};
  border-radius: ${radii.xl};
  border: 1px solid ${colors.border.subtle};
  background: ${colors.surface.primary};
  text-align: left;
  box-shadow: 0 12px 30px -18px rgba(0, 0, 0, 0.3);
`;

export const HighlightTitle = styled.div`
  color: ${colors.text.primary};
  font-size: ${typography.fontSize.base};
  font-weight: ${typography.fontWeight.semibold};
  margin-bottom: ${spacing[2]};
`;

export const HighlightText = styled.div`
  color: ${colors.text.secondary};
  font-size: ${typography.fontSize.sm};
  line-height: 1.55;
`;

export const StatsGrid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: ${spacing[3]};

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

export const StatCard = styled.div`
  padding: ${spacing[4]};
  border-radius: ${radii.xl};
  background: ${colors.background.secondary};
  border: 1px solid ${colors.border.subtle};
  text-align: center;
`;

export const StatValue = styled.div`
  color: ${colors.text.primary};
  font-size: ${typography.fontSize["2xl"]};
  font-weight: ${typography.fontWeight.bold};
`;

export const StatLabel = styled.div`
  color: ${colors.text.tertiary};
  font-size: ${typography.fontSize.xs};
  margin-top: ${spacing[1]};
  letter-spacing: 0.04em;
  line-height: 1.4;
`;
