import styled from "@emotion/styled";
import {
  colors,
  spacing,
  typography,
  radii,
  shadows,
} from "../../../../theme/design-system";

export const SidebarContainer = styled.nav<{
  isOpen: boolean;
  isMobile: boolean;
}>`
  width: 336px;
  height: 100%;
  background:
    linear-gradient(180deg, ${colors.background.secondary} 0%, ${colors.background.primary} 100%);
  border: 1px solid ${colors.border.subtle};
  border-radius: ${radii["3xl"]};
  box-shadow: 0 26px 60px -42px rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(20px);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;

  ${(props) =>
    props.isMobile &&
    `
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(336px, calc(100vw - 20px));
    border-radius: 0 28px 28px 0;
    transform: translateX(${props.isOpen ? "0" : "-100%"});
    box-shadow: 0 0 40px rgba(0,0,0,0.5);
  `}
`;

export const MobileOverlay = styled.div`
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 1500;
`;

export const SidebarHeader = styled.div`
  padding: ${spacing[6]} ${spacing[6]} ${spacing[5]};
  padding-top: max(${spacing[6]}, env(safe-area-inset-top));
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid ${colors.border.subtle};
  background: linear-gradient(180deg, ${colors.background.overlay} 0%, transparent 100%);
`;

export const Logo = styled.h2`
  font-size: clamp(1.8rem, 1.2rem + 1vw, 2.2rem);
  font-weight: 800;
  color: ${colors.primary.DEFAULT};
  margin: 0;
  cursor: pointer;
  letter-spacing: -0.04em;

  span {
    color: ${colors.text.primary};
  }
`;

export const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${colors.text.secondary};
  font-size: 24px;
  cursor: pointer;
  padding: ${spacing[2]};

  &:hover {
    color: ${colors.text.primary};
  }
`;

export const SessionList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${spacing[5]} ${spacing[4]};
`;

export const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing[2]};
  margin-top: ${spacing[6]};
  margin-bottom: ${spacing[3]};
  padding: 0 ${spacing[2]};

  &:first-of-type {
    margin-top: 0;
  }
`;

export const SectionLabel = styled.p`
  font-size: 11px;
  font-weight: ${typography.fontWeight.bold};
  color: ${colors.text.tertiary};
  letter-spacing: 0.14em;
  margin: 0;
`;

export const SectionCount = styled.span`
  min-width: 26px;
  height: 26px;
  padding: 0 ${spacing[2]};
  border-radius: ${radii.full};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${colors.surface.primary};
  color: ${colors.text.secondary};
  border: 1px solid ${colors.border.subtle};
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.semibold};
`;

export const EmptyText = styled.p`
  color: ${colors.text.tertiary};
  text-align: center;
  font-size: ${typography.fontSize.sm};
  margin-top: ${spacing[8]};
`;

export const SidebarFooter = styled.div`
  padding: ${spacing[4]};
  padding-bottom: max(${spacing[4]}, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: ${spacing[3]};
  border-top: 1px solid ${colors.border.subtle};
  background: linear-gradient(180deg, transparent 0%, ${colors.background.overlay} 100%);
`;

// SidebarItem styling
export const ItemContainer = styled.div<{ isActive: boolean }>`
  display: flex;
  align-items: center;
  padding: ${spacing[3]} ${spacing[3]};
  border-radius: 20px;
  cursor: pointer;
  margin-bottom: ${spacing[2]};
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  background:
    ${(props) =>
      props.isActive
        ? `linear-gradient(135deg, ${colors.primary.subtle} 0%, ${colors.surface.primary} 100%)`
        : colors.surface.primary};
  border: 1px solid
    ${(props) => (props.isActive ? colors.primary.subtle : colors.border.subtle)};
  box-shadow: ${(props) =>
    props.isActive ? `0 22px 34px -28px rgba(99, 102, 241, 0.55)` : shadows.sm};

  &:hover {
    border-color: ${(props) =>
      props.isActive ? colors.primary.subtle : colors.border.highlight};
    background:
      ${(props) =>
        props.isActive
          ? `linear-gradient(135deg, ${colors.primary.subtle} 0%, ${colors.surface.primary} 100%)`
          : colors.background.secondary};
    transform: translateY(-1px);
    box-shadow: 0 24px 32px -28px rgba(15, 23, 42, 0.45);
  }
`;

export const ItemInfo = styled.div`
  flex: 1;
  min-width: 0; /* Truncation fix */
  margin-left: ${spacing[3]};
`;

export const ItemName = styled.div`
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  color: ${colors.text.primary};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${spacing[2]};
`;

export const ItemPreview = styled.div<{ isActive: boolean }>`
  font-size: ${typography.fontSize.xs};
  color: ${(props) =>
    props.isActive ? colors.primary.DEFAULT : colors.text.secondary};
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.35;
`;

export const UnreadBadge = styled.div`
  background: linear-gradient(135deg, ${colors.primary.DEFAULT} 0%, ${colors.primary.hover} 100%);
  color: white;
  border-radius: ${radii.full};
  height: 22px;
  min-width: 22px;
  padding: 0 7px;
  font-size: 11px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 20px -14px rgba(99, 102, 241, 0.75);
`;

export const SyncContainer = styled.div`
  margin: ${spacing[4]} ${spacing[4]} 0;
  padding: ${spacing[3]};
  background-color: ${colors.background.tertiary};
  border-radius: ${radii.md};
  border: 1px solid ${colors.border.subtle};
`;

export const SyncTitle = styled.div`
  font-size: ${typography.fontSize.xs};
  color: ${colors.text.secondary};
  margin-bottom: ${spacing[2]};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const SyncProgressBar = styled.div`
  height: 4px;
  background-color: ${colors.background.primary};
  border-radius: ${radii.full};
  overflow: hidden;
`;

export const SyncProgressFill = styled.div<{ progress: number }>`
  height: 100%;
  background-color: ${colors.primary.DEFAULT};
  width: ${(props) => Math.min(Math.max(props.progress, 0), 100)}%;
  transition: width 0.3s ease;
`;
