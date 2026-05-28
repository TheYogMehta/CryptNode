import styled from "styled-components";
import { colors, spacing, radii, typography } from "../../../../theme/design-system";

export const Overlay = styled.div`
  position: absolute;
  inset: 0;
  background: ${colors.background.overlay};
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  animation: fadeIn 0.18s ease;

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

export const ModalContainer = styled.div`
  background: linear-gradient(
    160deg,
    ${colors.background.secondary} 0%,
    ${colors.surface.primary} 100%
  );
  border: 1px solid ${colors.border.subtle};
  border-radius: 20px;
  width: 100%;
  max-width: 600px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.24);
  animation: slideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
`;

export const Header = styled.div`
  display: flex;
  align-items: center;
  padding: 18px 20px 16px;
  border-bottom: 1px solid ${colors.border.subtle};
`;

export const HeaderTitle = styled.h2`
  flex: 1;
  font-family: ${typography.fontFamily.sans};
  font-size: 17px;
  font-weight: 600;
  color: ${colors.text.primary};
  margin: 0;
  letter-spacing: -0.01em;
`;

export const CloseButton = styled.button`
  background: ${colors.background.tertiary};
  border: none;
  color: ${colors.text.secondary};
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s;

  &:hover {
    background: ${colors.surface.highlight};
    color: ${colors.text.primary};
  }
`;

export const Content = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: ${colors.border.subtle};
    border-radius: 2px;
  }
`;

export const ProfileHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 0 8px;
`;

export const AvatarContainer = styled.div`
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);

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
  gap: 4px;
  min-width: 0;
`;

export const EditableInput = styled.input`
  background: ${colors.background.tertiary};
  border: 1px solid ${colors.border.subtle};
  border-radius: 10px;
  color: ${colors.text.primary};
  font-family: ${typography.fontFamily.sans};
  font-size: 16px;
  font-weight: 600;
  padding: 8px 12px;
  width: 100%;
  transition: border-color 0.2s, background 0.2s;

  &::placeholder { color: ${colors.text.tertiary}; }

  &:focus {
    outline: none;
    border-color: ${colors.primary.main};
    background: ${colors.primary.subtle};
  }
`;

export const SectionTitle = styled.h3`
  font-family: ${typography.fontFamily.sans};
  font-size: 11px;
  font-weight: 600;
  color: ${colors.text.tertiary};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 8px 2px;
`;

export const NotesArea = styled.textarea`
  background: ${colors.background.secondary};
  border: 1px solid ${colors.border.subtle};
  border-radius: 12px;
  color: ${colors.text.primary};
  font-family: ${typography.fontFamily.sans};
  font-size: 14px;
  line-height: 1.6;
  padding: 12px 14px;
  width: 100%;
  min-height: 90px;
  resize: vertical;
  transition: border-color 0.2s, background 0.2s;

  &::placeholder { color: ${colors.text.tertiary}; }

  &:focus {
    outline: none;
    border-color: ${colors.primary.main};
    background: ${colors.primary.subtle};
  }
`;

export const MediaGridHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
`;

export const GridControls = styled.div`
  display: flex;
  gap: 4px;
  background: ${colors.background.tertiary};
  border-radius: 8px;
  padding: 3px;
`;

export const GridButton = styled.button<{ active?: boolean }>`
  background: ${(props) => (props.active ? colors.surface.highlight : "transparent")};
  border: none;
  color: ${(props) => (props.active ? colors.text.primary : colors.text.tertiary)};
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &:hover {
    color: ${colors.text.primary};
    background: ${colors.background.secondary};
  }
`;

export const MediaGridContent = styled.div<{ columns: number }>`
  display: grid;
  grid-template-columns: repeat(${(props) => props.columns}, 1fr);
  gap: 6px;
  width: 100%;
  margin-bottom: 20px;
`;

export const MonthHeader = styled.div`
  font-family: ${typography.fontFamily.sans};
  font-size: 13px;
  font-weight: 600;
  color: ${colors.text.secondary};
  margin: 16px 0 8px 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

export const FilterPanel = styled.div`
  background: ${colors.background.secondary};
  border: 1px solid ${colors.border.subtle};
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: slideDown 0.2s ease-out;

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

export const FilterRow = styled.div`
  display: flex;
  gap: 16px;
  
  @media (max-width: 480px) {
    flex-direction: column;
    gap: 12px;
  }
`;

export const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
`;

export const FilterLabel = styled.label`
  font-size: 11px;
  font-weight: 600;
  color: ${colors.text.tertiary};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

export const FilterSelect = styled.select`
  background: ${colors.background.tertiary};
  border: 1px solid ${colors.border.subtle};
  border-radius: 8px;
  color: ${colors.text.primary};
  padding: 8px 12px;
  font-family: inherit;
  font-size: 13px;
  width: 100%;
  outline: none;
  cursor: pointer;

  &:focus { border-color: ${colors.primary.main}; }
  
  option { background: ${colors.surface.primary}; color: ${colors.text.primary}; }
`;

export const FilterInput = styled.input`
  background: ${colors.background.tertiary};
  border: 1px solid ${colors.border.subtle};
  border-radius: 8px;
  color: ${colors.text.primary};
  padding: 8px 12px;
  font-family: inherit;
  font-size: 13px;
  width: 100%;
  outline: none;

  &:focus { border-color: ${colors.primary.main}; }
  &::-webkit-calendar-picker-indicator {
    filter: none;
    opacity: 0.6;
    cursor: pointer;
  }
`;

export const MediaItem = styled.div`
  aspect-ratio: 1;
  background: ${colors.background.secondary};
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  border: 1px solid ${colors.border.subtle};
  transition: transform 0.18s, border-color 0.18s;

  img, video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.22s;
  }

  &:hover {
    transform: scale(1.02);
    border-color: ${colors.primary.main};
  }

  &:hover img, &:hover video {
    transform: scale(1.06);
  }

  .file-icon {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: ${colors.text.tertiary};
    font-size: 11px;
    gap: 6px;
    padding: 4px;
    text-align: center;
  }
`;

export const SaveButtonContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid ${colors.border.subtle};
  background: ${colors.background.secondary};
`;

export const SaveButton = styled.button`
  background: linear-gradient(135deg, ${colors.primary.main}, ${colors.primary.hover});
  color: white;
  border: none;
  border-radius: 10px;
  padding: 9px 20px;
  font-family: ${typography.fontFamily.sans};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  transition: all 0.18s;
  box-shadow: 0 2px 10px rgba(99, 102, 241, 0.18);

  &:hover {
    filter: brightness(1.1);
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.24);
    transform: translateY(-1px);
  }

  &:active { transform: translateY(0); }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

export const RemoveConnectionButton = styled.button`
  background: transparent;
  color: ${colors.status.error};
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 10px;
  padding: 9px 16px;
  font-family: ${typography.fontFamily.sans};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  transition: all 0.18s;

  &:hover {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.45);
    color: ${colors.status.error};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export const SendRequestButton = styled.button`
  background: transparent;
  color: ${colors.status.success};
  border: 1px solid rgba(34, 197, 94, 0.28);
  border-radius: 10px;
  padding: 9px 16px;
  font-family: ${typography.fontFamily.sans};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  transition: all 0.18s;
  white-space: nowrap;

  &:hover {
    background: rgba(34, 197, 94, 0.08);
    border-color: rgba(34, 197, 94, 0.45);
    color: ${colors.status.success};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: ${colors.text.tertiary};
    border-color: ${colors.border.subtle};
  }
`;

export const MembersSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: ${colors.background.secondary};
  border: 1px solid ${colors.border.subtle};
  border-radius: 14px;
  padding: 14px;
`;

export const MemberRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  transition: background 0.15s;

  &:hover {
    background: ${colors.surface.highlight};
  }
`;

export const MemberAvatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, ${colors.primary.main}, ${colors.primary.hover});
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 13px;
  flex-shrink: 0;
`;

export const MemberInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

export const MemberName = styled.span`
  color: ${colors.text.primary};
  font-weight: 500;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const MemberEmail = styled.span`
  color: ${colors.text.tertiary};
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const RemoveMemberButton = styled.button`
  background: transparent;
  border: none;
  color: ${colors.text.tertiary};
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &:hover {
    color: ${colors.status.error};
    background: rgba(239, 68, 68, 0.08);
  }
`;

export const AddMemberSection = styled.div`
  position: relative;
  margin-top: 4px;
`;

export const AddMemberDropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 6px;
  background: ${colors.surface.primary};
  border: 1px solid ${colors.border.subtle};
  border-radius: 12px;
  max-height: 200px;
  overflow-y: auto;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  z-index: 100;
  display: flex;
  flex-direction: column;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: ${colors.border.subtle};
    border-radius: 2px;
  }
`;

export const AddMemberRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: ${colors.surface.highlight};
  }
`;

