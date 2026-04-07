import styled from "@emotion/styled";
import {
  colors,
  spacing,
  radii,
  typography,
  glassEffect,
} from "../../../../theme/design-system";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background-color: ${colors.background.secondary};
  position: relative;
  overflow: hidden;
`;

export const Header = styled.div`
  ${glassEffect}
  padding: ${spacing[4]} ${spacing[6]};
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 10;
  border-bottom: 1px solid ${colors.border.subtle};
`;

export const HeaderInfo = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
`;

export const Avatar = styled.div<{ bg?: string }>`
  width: 44px;
  height: 44px;
  border-radius: ${radii.full};
  background: ${(props) =>
    props.bg || "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)"};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${typography.fontSize.lg};
  font-weight: ${typography.fontWeight.bold};
  color: white;
  box-shadow: ${(props) =>
    props.theme === "light"
      ? "0 2px 8px rgba(0,0,0,0.1)"
      : "0 0 15px rgba(99, 102, 241, 0.3)"};
`;

export const Name = styled.h3`
  margin: 0;
  font-size: ${typography.fontSize.base};
  font-weight: ${typography.fontWeight.semibold};
  color: ${colors.text.primary};
`;

export const Status = styled.span<{ isOnline?: boolean }>`
  font-size: ${typography.fontSize.xs};
  color: ${(props) =>
    props.isOnline ? colors.status.success : colors.text.tertiary};
  display: flex;
  align-items: center;
  gap: 4px;

  &::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: ${(props) =>
      props.isOnline ? colors.status.success : colors.text.tertiary};
  }
`;

export const MessagesArea = styled.div`
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: ${spacing[6]};
  display: flex;
  flex-direction: column;
  gap: ${spacing[4]};

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background-color: ${colors.surface.highlight};
    border-radius: ${radii.full};
  }
`;

export const InputArea = styled.div`
  padding: ${spacing[4]};
  background-color: ${colors.background.secondary};
  border-top: none;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow-x: hidden;
`;

export const InputWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  min-width: 0;
  background-color: ${colors.surface.primary};
  padding: ${spacing[2]} ${spacing[4]};
  border-radius: ${radii["2xl"]};
  border: none;
  transition: background-color 0.2s;
`;

export const Input = styled.input`
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  color: ${colors.text.primary};
  padding: ${spacing[2]} 0;
  font-size: ${typography.fontSize.base};
  outline: none;

  &:focus-visible {
    outline: none;
    box-shadow: none;
  }

  &::placeholder {
    color: ${colors.text.tertiary};
  }
`;

export const ActionButton = styled.button`
  background: none;
  border: none;
  color: ${colors.text.secondary};
  cursor: pointer;
  padding: ${spacing[2]};
  border-radius: ${radii.full};
  transition: all 0.2s;

  &:hover {
    background-color: ${colors.background.tertiary};
    color: ${colors.text.primary};
  }
`;

export const SendButton = styled.button`
  background-color: ${colors.primary.main};
  color: white;
  border: none;
  border-radius: ${radii.full};
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s, background-color 0.2s;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);

  &:hover {
    background-color: ${colors.primary.hover};
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
`;

export const DateSeparator = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin: ${spacing[4]} 0;
  font-size: ${typography.fontSize.xs};
  color: ${colors.text.tertiary};
  font-weight: ${typography.fontWeight.medium};

  &::before,
  &::after {
    content: "";
    flex: 1;
    height: 1px;
    background-color: ${colors.border.subtle};
    margin: 0 ${spacing[4]};
  }
`;

export const ReplyContainer = styled.div`
  padding: 8px 12px;
  margin-bottom: 8px;
  background-color: ${colors.surface.secondary};
  border-left: 3px solid ${colors.primary.main};
  border-radius: ${radii.md};
  font-size: ${typography.fontSize.sm};
  color: ${colors.text.secondary};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const CloseReplyButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${colors.text.tertiary};
`;
