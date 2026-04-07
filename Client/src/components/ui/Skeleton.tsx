import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { colors, radii } from "../../theme/design-system";

const shimmer = keyframes`
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
`;

const SkeletonBase = styled.div<{ width?: string; height?: string; borderRadius?: string }>`
  background: ${colors.background.tertiary};
  background-image: linear-gradient(
    90deg,
    ${colors.background.tertiary} 0px,
    ${colors.background.secondary} 40px,
    ${colors.background.tertiary} 80px
  );
  background-size: 1000px 100%;
  animation: ${shimmer} 2s infinite linear;
  width: ${(props) => props.width || "100%"};
  height: ${(props) => props.height || "20px"};
  border-radius: ${(props) => props.borderRadius || radii.md};
`;

export const Skeleton = ({ width, height, borderRadius }: { width?: string; height?: string; borderRadius?: string }) => {
  return <SkeletonBase width={width} height={height} borderRadius={borderRadius} />;
};

export const SidebarSkeleton = () => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "12px" }}>
      {[...Array(15)].map((_, i) => (
        <div key={i} style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <Skeleton width="48px" height="48px" borderRadius="24px" />
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
            <Skeleton width="60%" height="16px" />
            <Skeleton width="40%" height="12px" />
          </div>
        </div>
      ))}
    </div>
  );
};
