import styled from "@emotion/styled";
import { colors, radii, spacing, shadows } from "../../theme/design-system";

export const Card = styled.div<{ noPadding?: boolean; hoverable?: boolean }>`
  background: ${colors.background.secondary};
  border: 1px solid ${colors.border.subtle};
  border-radius: ${radii.xl};
  overflow: hidden;
  box-shadow: ${shadows.sm};
  transition: all 0.2s ease-in-out;
  display: flex;
  flex-direction: column;

  ${(props) =>
        props.hoverable &&
        `
    &:hover {
      box-shadow: ${shadows.lg};
      border-color: ${colors.border.highlight};
      transform: translateY(-2px);
    }
  `}

  ${(props) =>
        !props.noPadding &&
        `
    padding: ${spacing[6]};
  `}
`;

export const GlassCard = styled(Card)`
  background: ${colors.background.glass};
  backdrop-filter: blur(12px);
  box-shadow: ${shadows.glass};
`;

export const CardHeader = styled.div`
  padding: ${spacing[6]};
  border-bottom: 1px solid ${colors.border.subtle};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const CardTitle = styled.h3`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

export const CardBody = styled.div<{ noPadding?: boolean }>`
  padding: ${(props) => (props.noPadding ? "0" : spacing[6])};
  flex: 1;
`;

export const CardFooter = styled.div`
  padding: ${spacing[4]} ${spacing[6]};
  border-top: 1px solid ${colors.border.subtle};
  background: ${colors.background.tertiary};
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${spacing[2]};
`;
