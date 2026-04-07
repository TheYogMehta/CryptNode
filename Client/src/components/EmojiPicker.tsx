import React from "react";
import EmojiPickerReact, { EmojiClickData, Theme } from "emoji-picker-react";
import styled from "styled-components";
import { colors, radii, shadows } from "../theme/design-system";
import { useTheme } from "../theme/ThemeContext";

const PickerWrapper = styled.div`
  position: absolute;
  bottom: 60px;
  right: 20px;
  z-index: 1000;
  box-shadow: ${shadows.xl};
  border-radius: ${radii.lg};
  overflow: hidden;

  .EmojiPickerReact {
    border: 1px solid ${colors.border.subtle} !important;
    background: ${colors.surface.primary} !important;
    --epr-bg-color: ${colors.surface.primary} !important;
    --epr-category-label-bg-color: ${colors.surface.primary} !important;
    --epr-body-background-color: ${colors.surface.primary} !important;
    --epr-picker-border-color: ${colors.border.subtle} !important;
    --epr-hover-bg-color: ${colors.background.tertiary} !important;
    --epr-focus-bg-color: ${colors.primary.subtle} !important;
    --epr-search-input-bg-color: ${colors.background.tertiary} !important;
    --epr-search-border-color: ${colors.border.subtle} !important;
    --epr-text-color: ${colors.text.primary} !important;
    --epr-search-input-text-color: ${colors.text.primary} !important;
    --epr-category-icon-active-color: ${colors.primary.DEFAULT} !important;
    --epr-highlight-color: ${colors.primary.DEFAULT} !important;
  }
`;

interface EmojiPickerProps {
  onEmojiClick: (emojiData: EmojiClickData) => void;
  onClose: () => void;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  onEmojiClick,
  onClose,
}) => {
  const { theme } = useTheme();

  return (
    <PickerWrapper>
      <div
        style={{ position: "fixed", inset: 0, zIndex: -1 }}
        onClick={onClose}
      />
      <EmojiPickerReact
        theme={theme === "light" ? Theme.LIGHT : Theme.DARK}
        onEmojiClick={onEmojiClick}
        lazyLoadEmojis={true}
        autoFocusSearch={false}
      />
    </PickerWrapper>
  );
};
