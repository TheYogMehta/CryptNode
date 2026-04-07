import styled from "@emotion/styled";
import { Button, type ButtonVariant } from "../../../components/ui/Button";
import {
  colors,
  radii,
  spacing,
  typography,
} from "../../../theme/design-system";

const secondaryShadow = "0 14px 30px -24px rgba(15, 23, 42, 0.35)";
const primaryShadow = "0 18px 38px -24px rgba(99, 102, 241, 0.55)";

export const HomeActionButton = styled(Button)<{ variant?: ButtonVariant }>`
  height: 48px;
  padding: 0 ${spacing[6]};
  border-radius: ${radii.xl};
  font-size: ${typography.fontSize.base};
  font-weight: ${typography.fontWeight.semibold};
  box-shadow: ${(props) =>
    props.variant === "primary" ? primaryShadow : secondaryShadow};

  svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  &:hover {
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  ${(props) =>
    props.variant === "secondary" &&
    `
      background: ${colors.surface.primary};
      border: 1px solid ${colors.border.subtle};
      color: ${colors.text.primary};

      &:hover {
        background: ${colors.background.secondary};
        border-color: ${colors.border.highlight};
        box-shadow: ${secondaryShadow};
      }

      &:active {
        background: ${colors.background.tertiary};
      }
    `}
`;
