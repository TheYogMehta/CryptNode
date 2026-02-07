import styled from "@emotion/styled";
import { colors, spacing, radii, shadows } from "../../../../theme/design-system";

export const SettingsContainer = styled.div`
  width: 800px;
  height: 600px;
  max-width: 95vw;
  max-height: 90vh;
  background-color: ${colors.background.primary};
  border-radius: ${radii.lg};
  display: flex;
  overflow: hidden;
  box-shadow: ${shadows["2xl"]};
  border: 1px solid ${colors.border.subtle};
`;

export const SettingsSidebar = styled.div`
  width: 250px;
  background-color: ${colors.background.secondary};
  padding: ${spacing[5]};
  border-right: 1px solid ${colors.border.subtle};
  display: flex;
  flex-direction: column;
`;

export const SettingsContent = styled.div`
  flex: 1;
  padding: ${spacing[8]};
  overflow-y: auto;
  background-color: ${colors.background.primary};
`;

export const CategoryButton = styled.button<{ isActive: boolean }>`
  padding: ${spacing[3]} ${spacing[4]};
  margin-bottom: ${spacing[2]};
  border-radius: ${radii.md};
  background-color: ${(props) =>
        props.isActive ? colors.primary.main : "transparent"};
  color: ${(props) => (props.isActive ? "white" : colors.text.secondary)};
  cursor: pointer;
  border: none;
  text-align: left;
  font-size: 1rem;
  font-weight: 500;
  transition: all 0.2s;

  &:hover {
    background-color: ${(props) =>
        props.isActive ? colors.primary.hover : colors.background.tertiary};
    color: ${(props) => (props.isActive ? "white" : colors.text.primary)};
  }
`;

export const ProfileSection = styled.div`
  margin-bottom: ${spacing[8]};
  padding: ${spacing[5]};
  background-color: ${colors.background.secondary};
  border-radius: ${radii.md};
`;

export const AccountItem = styled.div<{ isActive: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${spacing[4]};
  background-color: ${colors.background.secondary};
  border-radius: ${radii.md};
  margin-bottom: ${spacing[3]};
  border: 1px solid
    ${(props) => (props.isActive ? colors.primary.main : colors.border.subtle)};
`;

export const DangerZone = styled.div`
  display: flex;
  gap: ${spacing[3]};
  margin-top: ${spacing[4]};
`;

export const DangerButton = styled.button`
  padding: ${spacing[3]} ${spacing[5]};
  border-radius: ${radii.md};
  background-color: ${colors.status.error};
  color: white;
  border: none;
  cursor: pointer;
  font-weight: 600;

  &:hover {
    background-color: #dc2626;
  }
`;

export const CodeBlock = styled.div`
  padding: ${spacing[4]};
  background-color: ${colors.background.primary};
  border-radius: ${radii.md};
  border: 1px solid ${colors.border.subtle};
  display: flex;
  flex-wrap: wrap;
  gap: ${spacing[2]};
  font-family: monospace;
`;
