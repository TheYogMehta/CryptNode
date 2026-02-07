import React from "react";
import styled from "@emotion/styled";
import { colors, radii, typography } from "../../theme/design-system";

export type AvatarSize = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

interface AvatarProps {
    src?: string;
    name?: string;
    size?: AvatarSize;
    status?: "online" | "offline" | "busy" | "away";
}

const sizeMap = {
    sm: "32px",
    md: "40px",
    lg: "48px",
    xl: "64px",
    "2xl": "96px",
    "3xl": "128px",
};

const fontSizeMap = {
    sm: "12px",
    md: "14px",
    lg: "16px",
    xl: "24px",
    "2xl": "36px",
    "3xl": "48px",
};

const Container = styled.div<{ size: AvatarSize }>`
  position: relative;
  width: ${(props) => sizeMap[props.size]};
  height: ${(props) => sizeMap[props.size]};
  border-radius: ${radii.full};
  flex-shrink: 0;
`;

const Image = styled.img`
  width: 100%;
  height: 100%;
  border-radius: ${radii.full};
  object-fit: cover;
  border: 2px solid ${colors.background.tertiary};
`;

const Fallback = styled.div<{ size: AvatarSize }>`
  width: 100%;
  height: 100%;
  border-radius: ${radii.full};
  background: linear-gradient(135deg, ${colors.primary.DEFAULT}, ${colors.primary.active});
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: ${typography.fontWeight.bold};
  font-size: ${(props) => fontSizeMap[props.size]};
  border: 2px solid ${colors.background.tertiary};
  text-transform: uppercase;
`;

const StatusIndicator = styled.div<{ status: string }>`
  position: absolute;
  bottom: 0;
  right: 0;
  width: 25%;
  height: 25%;
  min-width: 10px;
  min-height: 10px;
  border-radius: 50%;
  border: 2px solid ${colors.background.primary};
  background-color: ${(props) =>
        props.status === "online"
            ? colors.status.success
            : props.status === "busy"
                ? colors.status.error
                : props.status === "away"
                    ? colors.status.warning
                    : colors.text.tertiary};
`;

export const Avatar: React.FC<AvatarProps> = ({ src, name, size = "md", status }) => {
    const initials = name
        ? name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")
        : "?";

    return (
        <Container size={size}>
            {src ? (
                <Image src={src} alt={name || "Avatar"} />
            ) : (
                <Fallback size={size}>{initials}</Fallback>
            )}
            {status && <StatusIndicator status={status} />}
        </Container>
    );
};
