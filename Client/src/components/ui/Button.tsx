import styled from "@emotion/styled";
import { colors, radii, spacing, typography, shadows } from "../../theme/design-system";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
}

const getVariantStyles = (variant: ButtonVariant = "primary") => {
    switch (variant) {
        case "primary":
            return `
        background: ${colors.primary.DEFAULT};
        color: white;
        &:hover {
          background: ${colors.primary.hover};
          box-shadow: ${shadows.glow};
        }
        &:active {
          background: ${colors.primary.active};
        }
      `;
        case "secondary":
            return `
        background: ${colors.background.tertiary};
        color: ${colors.text.primary};
        border: 1px solid ${colors.border.subtle};
        &:hover {
          background: ${colors.border.subtle};
          border-color: ${colors.text.tertiary};
        }
      `;
        case "ghost":
            return `
        background: transparent;
        color: ${colors.text.secondary};
        &:hover {
          background: ${colors.border.subtle};
          color: ${colors.text.primary};
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

const getSizeStyles = (size: ButtonSize = "md") => {
    switch (size) {
        case "sm":
            return `
        height: 32px;
        padding: 0 ${spacing[3]};
        font-size: ${typography.fontSize.xs};
      `;
        case "md":
            return `
        height: 40px;
        padding: 0 ${spacing[4]};
        font-size: ${typography.fontSize.sm};
      `;
        case "lg":
            return `
        height: 48px;
        padding: 0 ${spacing[6]};
        font-size: ${typography.fontSize.base};
      `;
        default:
            return "";
    }
};

export const Button = styled.button<ButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing[2]};
  border: none;
  border-radius: ${radii.md};
  font-family: ${typography.fontFamily.sans};
  font-weight: ${typography.fontWeight.medium};
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  white-space: nowrap;
  width: ${(props) => (props.fullWidth ? "100%" : "auto")};

  ${(props) => getVariantStyles(props.variant)}
  ${(props) => getSizeStyles(props.size)}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }
`;
