import styled from "styled-components";
import { colors, spacing, radii, typography } from "../../../../theme/design-system";

export const Overlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: ${spacing[4]}px;
`;

export const ModalContainer = styled.div`
  background-color: ${colors.background.secondary};
  border-radius: ${radii.lg};
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
`;

export const Header = styled.div`
  display: flex;
  align-items: center;
  padding: ${spacing[4]}px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

export const HeaderTitle = styled.h2`
  flex: 1;
  font-family: ${typography.fontFamily.sans};
  font-size: ${typography.fontSize.xl}px;
  font-weight: ${typography.fontWeight.semibold};
  color: ${colors.text.primary};
  margin: 0;
`;

export const CloseButton = styled.button`
  background: transparent;
  border: none;
  color: ${colors.text.secondary};
  cursor: pointer;
  padding: ${spacing[2]}px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
    color: ${colors.text.primary};
  }
`;

export const Content = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${spacing[4]}px;
  display: flex;
  flex-direction: column;
  gap: ${spacing[6]}px;
`;

export const ProfileHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[4]}px;
`;

export const AvatarContainer = styled.div`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  background-color: ${colors.primary.main};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: #fff;
  flex-shrink: 0;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

export const ProfileInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]}px;
`;

export const EditableInput = styled.input`
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: ${radii.md};
  color: ${colors.text.primary};
  font-family: ${typography.fontFamily.sans};
  font-size: ${typography.fontSize.lg}px;
  padding: ${spacing[2]}px ${spacing[3]}px;
  width: 100%;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: ${colors.primary.main};
  }
`;

export const SectionTitle = styled.h3`
  font-family: ${typography.fontFamily.sans};
  font-size: ${typography.fontSize.base};
  font-weight: ${typography.fontWeight.medium};
  color: ${colors.text.secondary};
  margin: 0 0 ${spacing[2]}px 0;
`;

export const NotesArea = styled.textarea`
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: ${radii.md};
  color: ${colors.text.primary};
  font-family: ${typography.fontFamily.sans};
  font-size: ${typography.fontSize.base};
  padding: ${spacing[3]}px;
  width: 100%;
  min-height: 100px;
  resize: vertical;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: ${colors.primary.main};
  }
`;

export const MediaGridHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${spacing[2]}px;
`;

export const GridControls = styled.div`
  display: flex;
  gap: ${spacing[2]}px;
`;

export const GridButton = styled.button<{ active?: boolean }>`
  background: ${(props) => (props.active ? "rgba(255, 255, 255, 0.15)" : "transparent")};
  border: 1px solid ${(props) => (props.active ? "rgba(255, 255, 255, 0.3)" : "rgba(255, 255, 255, 0.1)")};
  color: ${(props) => (props.active ? colors.text.primary : colors.text.secondary)};
  border-radius: ${radii.sm};
  padding: ${spacing[1]}px ${spacing[2]}px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: ${colors.text.primary};
  }
`;

export const MediaGridContent = styled.div<{ columns: number }>`
  display: grid;
  grid-template-columns: repeat(${(props) => props.columns}, 1fr);
  gap: ${spacing[2]}px;
  width: 100%;
`;

export const MediaItem = styled.div`
  aspect-ratio: 1;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: ${radii.sm};
  overflow: hidden;
  cursor: pointer;
  position: relative;
  
  img, video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.2s;
  }

  &:hover img, &:hover video {
    transform: scale(1.05);
  }

  .file-icon {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: ${colors.text.secondary};
    font-size: 12px;
    gap: 8px;
  }
`;

export const SaveButtonContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: ${spacing[4]}px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background-color: ${colors.background.secondary};
`;

export const SaveButton = styled.button`
  background-color: ${colors.primary.main};
  color: white;
  border: none;
  border-radius: ${radii.md};
  padding: ${spacing[2]} ${spacing[4]};
  font-family: ${typography.fontFamily.sans};
  font-size: ${typography.fontSize.base};
  font-weight: ${typography.fontWeight.medium};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]}px;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${colors.primary.hover};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const RemoveConnectionButton = styled.button`
  background-color: transparent;
  color: ${colors.error.main};
  border: 1px solid ${colors.error.main};
  border-radius: ${radii.md};
  padding: ${spacing[2]} ${spacing[4]};
  font-family: ${typography.fontFamily.sans};
  font-size: ${typography.fontSize.base};
  font-weight: ${typography.fontWeight.medium};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]}px;
  transition: all 0.2s;
  margin-right: auto;

  &:hover {
    background-color: ${colors.error.main}1A;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
