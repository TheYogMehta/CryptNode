import styled from "@emotion/styled";
import { colors, radii, shadows } from "../../theme/design-system";

export type IconButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success"
  | "glass";
export type IconButtonSize = "sm" | "md" | "lg" | "xl";

interface IconButtonProps {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  isActive?: boolean;
}

const getVariantStyles = (
  variant: IconButtonVariant = "primary",
  isActive: boolean = false,
) => {
  switch (variant) {
    case "primary":
      return `
        background: ${isActive ? "white" : colors.primary.DEFAULT};
        color: ${isActive ? colors.primary.DEFAULT : "white"};
        &:hover {
          background: ${
            isActive ? "rgba(255,255,255,0.9)" : colors.primary.hover
          };
          box-shadow: ${shadows.glow};
        }
      `;
    case "secondary":
      return `
        background: ${isActive ? "white" : colors.background.tertiary};
        color: ${isActive ? colors.text.inverse : colors.text.primary};
        border: 1px solid ${colors.border.subtle};
        &:hover {
          background: ${
            isActive ? "rgba(255,255,255,0.9)" : colors.border.subtle
          };
        }
      `;
    case "glass":
      return `
        background: ${isActive ? "white" : "rgba(255, 255, 255, 0.1)"};
        color: ${isActive ? "black" : "white"};
        backdrop-filter: blur(8px);
        border: 1px solid ${colors.border.subtle};
        &:hover {
          background: ${
            isActive ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.2)"
          };
        }
      `;
    case "danger":
      return `
        background: ${colors.status.error};
        color: white;
        &:hover {
          opacity: 0.9;
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
        }
      `;
    case "success":
      return `
        background: ${colors.status.success};
        color: white;
        &:hover {
          opacity: 0.9;
          box-shadow: 0 0 15px rgba(34, 197, 94, 0.4);
        }
      `;
    default:
      return "";
  }
};

const getSizeStyles = (size: IconButtonSize = "md") => {
  switch (size) {
    case "sm":
      return `
        width: 32px;
        height: 32px;
        font-size: 16px;
      `;
    case "md":
      return `
        width: 40px;
        height: 40px;
        font-size: 20px;
      `;
    case "lg":
      return `
        width: 48px;
        height: 48px;
        font-size: 24px;
      `;
    case "xl":
      return `
        width: 64px;
        height: 64px;
        font-size: 28px;
      `;
    default:
      return "";
  }
};

export const IconButton = styled.button<IconButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: ${radii.full};
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  flex-shrink: 0;

  ${(props) => getVariantStyles(props.variant, props.isActive)}
  ${(props) => getSizeStyles(props.size)}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
