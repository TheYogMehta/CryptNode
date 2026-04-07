import styled from "@emotion/styled";
import { colors, radii, shadows, spacing, typography } from "../../../../theme/design-system";

export const OverlayContainer = styled.div<{ isMobile?: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 12000;
  background:
    linear-gradient(rgba(2, 6, 23, 0.94), rgba(2, 6, 23, 0.96)),
    ${colors.background.primary};
  display: flex;
  align-items: center;
  justify-content: center;
  isolation: isolate;
  contain: paint;
`;

export const CallCard = styled.div`
  background: ${colors.surface.primary};
  border: 1px solid ${colors.border.subtle};
  padding: ${spacing[10]};
  border-radius: ${radii.xl};
  width: 100%;
  max-width: 400px;
  text-align: center;
  box-shadow: ${shadows.xl};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${spacing[6]};
  isolation: isolate;
`;

export const AvatarContainer = styled.div<{ isCalling?: boolean }>`
  width: 120px;
  height: 120px;
  border-radius: ${radii.full};
  background: linear-gradient(
    135deg,
    ${colors.primary.DEFAULT},
    ${colors.primary.active}
  );
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${typography.fontSize["3xl"]};
  font-weight: ${typography.fontWeight.bold};
  color: white;
  border: 4px solid ${colors.background.secondary};
  margin-bottom: ${spacing[4]};
`;

export const CallerInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};
`;

export const CallerName = styled.h2`
  margin: 0;
  font-size: ${typography.fontSize["2xl"]};
  font-weight: ${typography.fontWeight.bold};
  color: ${colors.text.primary};
`;

export const CallStatus = styled.p`
  margin: 0;
  font-size: ${typography.fontSize.base};
  color: ${colors.text.secondary};
`;

export const ControlsRow = styled.div`
  display: flex;
  gap: ${spacing[8]};
  justify-content: center;
  align-items: center;
  margin-top: ${spacing[4]};
`;

export const MinimizedContainer = styled.div<{
  isMobile?: boolean;
  position: { x: number; y: number };
}>`
  position: fixed;
  left: ${(props) => props.position.x}px;
  top: ${(props) => props.position.y}px;
  width: 260px;
  height: 220px;
  background-color: ${colors.background.secondary};
  border-radius: ${radii.lg};
  box-shadow: ${shadows.lg};
  border: 1px solid ${colors.border.subtle};
  z-index: 12001;
  overflow: hidden;
  cursor: grab;
  display: flex;
  flex-direction: column;
  isolation: isolate;
  contain: paint;

  &:active {
    cursor: grabbing;
    box-shadow: ${shadows.xl};
  }
`;

export const VideoPlaceholder = styled.div`
  width: 100%;
  height: 100%;
  background-color: black;
  position: relative;
`;

export const MaximizeButton = styled.button`
  position: absolute;
  top: ${spacing[2]};
  right: ${spacing[2]};
  background: rgba(0, 0, 0, 0.5);
  border: none;
  color: white;
  border-radius: ${radii.sm};
  padding: ${spacing[1]};
  cursor: pointer;
  z-index: 10;

  &:hover {
    background: rgba(0, 0, 0, 0.7);
  }
`;

// Full Screen Video View
export const FullScreenContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding-bottom: ${spacing[10]};
`;

export const MainVideoArea = styled.div<{ hasRemoteVideo?: boolean }>`
  flex: 1;
  width: 100%;
  max-width: 1200px;
  max-height: 80vh;
  margin: ${spacing[4]} 0;
  background-color: ${(props) =>
    props.hasRemoteVideo ? "black" : colors.surface.primary};
  border-radius: ${radii.xl};
  overflow: hidden;
  position: relative;
  box-shadow: ${shadows.xl};
  display: flex;
  align-items: center;
  justify-content: center;
  isolation: isolate;
`;

export const RemoteVideo = styled.div`
  width: 100%;
  height: 100%;

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

export const MinimizeButton = styled.div`
  position: absolute;
  top: ${spacing[10]};
  left: ${spacing[10]};
  cursor: pointer;
  color: white;
  opacity: 0.7;
  z-index: 10;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }
`;
