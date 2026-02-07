import styled from "@emotion/styled";
import { colors, spacing, radii } from "../../theme/design-system";

export const SecureContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: ${colors.background.primary};
  position: relative;
`;

export const SecureHeader = styled.div`
  background: rgba(18, 18, 18, 0.95);
  border-bottom: 1px solid ${colors.border.subtle};
  flex-shrink: 0;
  padding: ${spacing[3]} ${spacing[4]};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${spacing[3]};
`;

export const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
`;

export const TitleContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

export const SecureTitle = styled.h2`
  margin: 0;
  font-size: 1.1rem;
  color: ${colors.text.primary};
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
`;

export const StatusText = styled.span`
  color: ${colors.text.tertiary};
  font-size: 0.8rem;
`;

export const HeaderActions = styled.div`
  display: flex;
  gap: ${spacing[3]};
`;

export const VaultButton = styled.button<{ isActive?: boolean }>`
  background: ${(props) => (props.isActive ? colors.primary.subtle : "transparent")};
  color: ${(props) => (props.isActive ? colors.primary.main : colors.text.secondary)};
  border: 1px solid ${(props) => (props.isActive ? colors.primary.main : colors.border.subtle)};
  padding: ${spacing[2]} ${spacing[3]};
  border-radius: ${radii.md};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  font-size: 0.9rem;
  transition: all 0.2s;

  &:hover {
    background: ${colors.surface.highlight};
    color: ${colors.text.primary};
  }
`;

export const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${spacing[4]};
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};
`;

export const InputArea = styled.div`
  padding: ${spacing[3]};
  background: ${colors.background.secondary};
  border-top: 1px solid ${colors.border.subtle};
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
`;

export const TextInput = styled.input`
  flex: 1;
  padding: ${spacing[3]};
  border-radius: ${radii.full};
  background: ${colors.background.tertiary};
  border: 1px solid ${colors.border.subtle};
  color: white;
  outline: none;

  &:focus {
    border-color: ${colors.primary.main};
  }
`;

export const SendButton = styled.button`
  background: ${colors.primary.main};
  color: white;
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: ${colors.primary.hover};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

export const VaultDrawer = styled.div<{ isOpen: boolean }>`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  background: ${colors.background.secondary};
  border-left: 1px solid ${colors.border.subtle};
  transform: translateX(${(props) => (props.isOpen ? "0" : "100%")});
  transition: transform 0.3s ease-in-out;
  z-index: 100;
  display: flex;
  flex-direction: column;
  box-shadow: -5px 0 20px rgba(0,0,0,0.5);
`;

export const VaultHeader = styled.div`
  padding: ${spacing[4]};
  border-bottom: 1px solid ${colors.border.subtle};
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: ${colors.background.primary};

  h3 {
    margin: 0;
    color: white;
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    gap: ${spacing[2]};
  }
`;

export const VaultContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${spacing[3]};
`;

export const VaultItem = styled.div`
  background: ${colors.background.tertiary};
  border-radius: ${radii.md};
  padding: ${spacing[3]};
  margin-bottom: ${spacing[2]};
  border: 1px solid ${colors.border.subtle};
  cursor: pointer;
  transition: border-color 0.2s;
  
  &:hover {
    border-color: ${colors.primary.main};
  }
`;
