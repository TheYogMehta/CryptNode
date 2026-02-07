import styled from "@emotion/styled";
import { colors, spacing, typography, radii } from "../../../../theme/design-system";

export const SidebarContainer = styled.nav<{ isOpen: boolean; isMobile: boolean }>`
  width: 320px;
  height: 100%;
  background-color: ${colors.background.secondary};
  border-right: 1px solid ${colors.border.subtle};
  z-index: 2000;
  display: flex;
  flex-direction: column;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  ${props => props.isMobile && `
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
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
  padding: ${spacing[6]};
  padding-top: max(${spacing[6]}, env(safe-area-inset-top));
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid ${colors.border.subtle};
`;

export const Logo = styled.h2`
  font-size: ${typography.fontSize.xl};
  font-weight: 800;
  color: ${colors.primary.DEFAULT};
  margin: 0;
  cursor: pointer;
  
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
  padding: ${spacing[4]};
`;

export const SectionLabel = styled.p`
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.bold};
  color: ${colors.text.tertiary};
  letter-spacing: 1px;
  margin-bottom: ${spacing[3]};
  padding-left: ${spacing[2]};
  margin-top: ${spacing[6]};
  
  &:first-of-type {
    margin-top: 0;
  }
`;

export const EmptyText = styled.p`
  color: ${colors.text.tertiary};
  text-align: center;
  font-size: ${typography.fontSize.sm};
  margin-top: ${spacing[8]};
`;

export const SidebarFooter = styled.div`
  padding: ${spacing[4]};
  border-top: 1px solid ${colors.border.subtle};
  padding-bottom: max(${spacing[4]}, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};
`;

// SidebarItem styling
export const ItemContainer = styled.div<{ isActive: boolean }>`
  display: flex;
  align-items: center;
  padding: ${spacing[3]};
  border-radius: ${radii.lg};
  cursor: pointer;
  margin-bottom: ${spacing[1]};
  transition: all 0.2s ease;
  background-color: ${props => props.isActive ? colors.primary.subtle : "transparent"};
  border: 1px solid ${props => props.isActive ? colors.primary.subtle : "transparent"};

  &:hover {
    background-color: ${props => props.isActive ? colors.primary.subtle : colors.background.tertiary};
  }
`;

export const ItemInfo = styled.div`
  flex: 1;
  min-width: 0; /* Truncation fix */
  margin-left: ${spacing[3]};
`;

export const ItemName = styled.div`
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
  color: ${colors.text.primary};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const ItemPreview = styled.div<{ isActive: boolean }>`
  font-size: ${typography.fontSize.xs};
  color: ${props => props.isActive ? colors.primary.DEFAULT : colors.text.secondary};
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const UnreadBadge = styled.div`
  background-color: ${colors.status.error};
  color: white;
  border-radius: ${radii.full};
  height: 20px;
  min-width: 20px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
`;
