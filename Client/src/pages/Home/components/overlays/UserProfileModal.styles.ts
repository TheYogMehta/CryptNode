import styled from "styled-components";
import { colors, spacing, radii, typography } from "../../../../theme/design-system";

export const Overlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
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
  background: linear-gradient(160deg, #1a1f2e 0%, #141820 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  width: 100%;
  max-width: 600px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.04);
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
`;

export const HeaderTitle = styled.h2`
  flex: 1;
  font-family: ${typography.fontFamily.sans};
  font-size: 17px;
  font-weight: 600;
  color: #f1f5f9;
  margin: 0;
  letter-spacing: -0.01em;
`;

export const CloseButton = styled.button`
  background: rgba(255, 255, 255, 0.06);
  border: none;
  color: #94a3b8;
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
    background: rgba(255, 255, 255, 0.12);
    color: #f1f5f9;
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
    background: rgba(255,255,255,0.1);
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
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #f1f5f9;
  font-family: ${typography.fontFamily.sans};
  font-size: 16px;
  font-weight: 600;
  padding: 8px 12px;
  width: 100%;
  transition: border-color 0.2s, background 0.2s;

  &::placeholder { color: rgba(255,255,255,0.3); }

  &:focus {
    outline: none;
    border-color: #6366f1;
    background: rgba(99, 102, 241, 0.08);
  }
`;

export const SectionTitle = styled.h3`
  font-family: ${typography.fontFamily.sans};
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 8px 2px;
`;

export const NotesArea = styled.textarea`
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  color: #cbd5e1;
  font-family: ${typography.fontFamily.sans};
  font-size: 14px;
  line-height: 1.6;
  padding: 12px 14px;
  width: 100%;
  min-height: 90px;
  resize: vertical;
  transition: border-color 0.2s, background 0.2s;

  &::placeholder { color: rgba(255,255,255,0.2); }

  &:focus {
    outline: none;
    border-color: rgba(99, 102, 241, 0.5);
    background: rgba(99, 102, 241, 0.06);
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
  background: rgba(255,255,255,0.04);
  border-radius: 8px;
  padding: 3px;
`;

export const GridButton = styled.button<{ active?: boolean }>`
  background: ${(props) => (props.active ? "rgba(255, 255, 255, 0.12)" : "transparent")};
  border: none;
  color: ${(props) => (props.active ? "#f1f5f9" : "#64748b")};
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &:hover {
    color: #f1f5f9;
    background: rgba(255, 255, 255, 0.08);
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
  color: #94a3b8;
  margin: 16px 0 8px 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

export const FilterPanel = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
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
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

export const FilterSelect = styled.select`
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #e2e8f0;
  padding: 8px 12px;
  font-family: inherit;
  font-size: 13px;
  width: 100%;
  outline: none;
  cursor: pointer;

  &:focus { border-color: #6366f1; }
  
  option { background: #1e293b; color: #e2e8f0; }
`;

export const FilterInput = styled.input`
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #e2e8f0;
  padding: 8px 12px;
  font-family: inherit;
  font-size: 13px;
  width: 100%;
  outline: none;

  &:focus { border-color: #6366f1; }
  &::-webkit-calendar-picker-indicator {
    filter: invert(1);
    opacity: 0.6;
    cursor: pointer;
  }
`;

export const MediaItem = styled.div`
  aspect-ratio: 1;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  border: 1px solid rgba(255,255,255,0.06);
  transition: transform 0.18s, border-color 0.18s;

  img, video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.22s;
  }

  &:hover {
    transform: scale(1.02);
    border-color: rgba(99, 102, 241, 0.4);
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
    color: #64748b;
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
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(0, 0, 0, 0.2);
`;

export const SaveButton = styled.button`
  background: linear-gradient(135deg, #6366f1, #4f46e5);
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
  box-shadow: 0 2px 10px rgba(99, 102, 241, 0.3);

  &:hover {
    filter: brightness(1.1);
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.45);
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
  color: #f87171;
  border: 1px solid rgba(248, 113, 113, 0.3);
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
    background: rgba(248, 113, 113, 0.1);
    border-color: rgba(248, 113, 113, 0.6);
    color: #fca5a5;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export const SendRequestButton = styled.button`
  background: transparent;
  color: #34d399;
  border: 1px solid rgba(52, 211, 153, 0.3);
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
    background: rgba(52, 211, 153, 0.1);
    border-color: rgba(52, 211, 153, 0.6);
    color: #6ee7b7;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: #94a3b8;
    border-color: rgba(148, 163, 184, 0.2);
  }
`;
