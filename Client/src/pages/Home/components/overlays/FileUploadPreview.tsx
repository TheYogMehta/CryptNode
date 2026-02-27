import React, { useState, useRef, useCallback } from "react";
import styled from "@emotion/styled";
import {
  X,
  Edit2 as EditIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Send,
  Plus,
} from "lucide-react";
import FilerobotImageEditor, {
  TABS,
  TOOLS,
} from "react-filerobot-image-editor";
import {
  colors,
  radii,
  spacing,
  typography,
  shadows,
} from "../../../../theme/design-system";
import { IconButton } from "../../../../components/ui/IconButton";

const OverlayContainer = styled.div`
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.95);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  color: white;
  animation: fadeIn 0.2s ease-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${spacing[4]};
`;

const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
`;

const PreviewArea = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;

  img,
  video {
    max-width: 100%;
    max-height: 80vh;
    object-fit: contain;
    border-radius: ${radii.lg};
    box-shadow: ${shadows.xl};
  }
`;

const Footer = styled.div`
  padding: ${spacing[4]};
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  gap: ${spacing[4]};
`;

const CaptionInput = styled.input`
  width: 100%;
  padding: ${spacing[3]};
  border-radius: ${radii.full};
  border: 1px solid rgba(255, 255, 255, 0.2);
  background-color: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: ${typography.fontSize.base};
  outline: none;
  text-align: center;

  &:focus {
    border-color: ${colors.primary.DEFAULT};
    background-color: rgba(255, 255, 255, 0.15);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }
`;

const ThumbnailStrip = styled.div`
  display: flex;
  gap: ${spacing[2]};
  overflow-x: auto;
  padding: ${spacing[2]} 0;
  justify-content: center;
  max-width: 100%;

  &::-webkit-scrollbar {
    height: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
`;

const Thumbnail = styled.div<{ active: boolean }>`
  width: 60px;
  height: 60px;
  border-radius: ${radii.md};
  overflow: hidden;
  cursor: pointer;
  border: 2px solid
    ${(props) => (props.active ? colors.primary.DEFAULT : "transparent")};
  opacity: ${(props) => (props.active ? 1 : 0.6)};
  transition: all 0.2s;
  flex-shrink: 0;
  position: relative;

  img,
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &:hover {
    opacity: 1;
  }
`;

const AddMoreButton = styled.button`
  width: 60px;
  height: 60px;
  border-radius: ${radii.md};
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px dashed rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;

  &:hover {
    background-color: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.5);
  }
`;

const Controls = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
`;

const ActionButton = styled.button`
  background-color: ${colors.primary.DEFAULT};
  color: white;
  border: none;
  border-radius: ${radii.full};
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: ${shadows.lg};
  transition: transform 0.2s, background-color 0.2s;

  &:hover {
    transform: scale(1.05);
    background-color: ${colors.primary.hover};
  }

  &:active {
    transform: scale(0.95);
  }
`;

// Replaced CropControls with new components
const ControlsWrapper = styled.div`
  position: absolute;
  bottom: ${spacing[4]};
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: ${spacing[3]};
  align-items: center;
  z-index: 10;
  width: 90%;
  max-width: 600px;
`;

const AspectRow = styled.div`
  display: flex;
  gap: ${spacing[2]};
  background-color: rgba(0, 0, 0, 0.8);
  padding: ${spacing[2]} ${spacing[3]};
  border-radius: ${radii.full};
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const AspectButton = styled.button<{ active: boolean }>`
  background: ${(props) =>
    props.active ? colors.primary.DEFAULT : "transparent"};
  border: 1px solid
    ${(props) =>
      props.active ? colors.primary.DEFAULT : "rgba(255, 255, 255, 0.3)"};
  color: white;
  padding: 6px 12px;
  border-radius: ${radii.full};
  font-size: ${typography.fontSize.xs};
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;

  &:hover {
    background: ${(props) =>
      props.active ? colors.primary.hover : "rgba(255, 255, 255, 0.1)"};
  }
`;

const BottomBar = styled.div`
  background-color: rgba(0, 0, 0, 0.8);
  padding: ${spacing[3]};
  border-radius: ${radii.xl};
  display: flex;
  gap: ${spacing[4]};
  align-items: center;
  width: 100%;
  justify-content: space-between;
`;

const Slider = styled.input`
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.3);
  outline: none;
  flex: 1;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    cursor: pointer;
  }
`;

interface FileData {
  id: string;
  file: File;
  previewUrl: string;
  type: "image" | "video" | "unknown";
  caption: string;
}

interface FileUploadPreviewProps {
  files: File[];
  onClose: () => void;
  onSend: (processedFiles: { file: File; caption: string }[]) => void;
  onAddMore: () => void;
}

export const FileUploadPreview: React.FC<FileUploadPreviewProps> = ({
  files,
  onClose,
  onSend,
  onAddMore,
}) => {
  // Sync internal state with props when new files are added
  const [fileList, setFileList] = useState<FileData[]>(() =>
    files.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      previewUrl: URL.createObjectURL(f),
      type: (f.type.startsWith("image/")
        ? "image"
        : f.type.startsWith("video/")
        ? "video"
        : "unknown") as "image" | "video" | "unknown",
      caption: "",
    })),
  );

  // Sync files when new ones are added
  React.useEffect(() => {
    setFileList((prev) => {
      const existingFiles = new Set(prev.map((p) => p.file));
      const newFiles = files.filter((f) => !existingFiles.has(f));

      if (newFiles.length === 0) return prev;

      const newFileData = newFiles.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        previewUrl: URL.createObjectURL(f),
        type: (f.type.startsWith("image/")
          ? "image"
          : f.type.startsWith("video/")
          ? "video"
          : "unknown") as "image" | "video" | "unknown",
        caption: "",
      }));

      return [...prev, ...newFileData];
    });
  }, [files]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);

  const currentFile = fileList[currentIndex];

  const handleRemove = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (fileList.length === 1) {
      onClose();
      return;
    }
    const newList = fileList.filter((_, i) => i !== index);
    setFileList(newList);
    if (currentIndex >= newList.length) {
      setCurrentIndex(newList.length - 1);
    }
  };

  const updateCaption = (text: string) => {
    setFileList((prev) =>
      prev.map((f, i) => (i === currentIndex ? { ...f, caption: text } : f)),
    );
  };

  const startEdit = () => {
    if (currentFile.type === "image") {
      setIsEditing(true);
    }
  };

  const saveEdit = (editedImageObject: any) => {
    if (!currentFile) return;

    try {
      const dataUrl = editedImageObject.imageBase64;
      fetch(dataUrl)
        .then((res) => res.blob())
        .then((blob) => {
          const newFile = new File([blob], currentFile.file.name, {
            type: blob.type || "image/png",
            lastModified: Date.now(),
          });
          const newPreviewUrl = URL.createObjectURL(newFile);

          setFileList((prev) =>
            prev.map((f, i) =>
              i === currentIndex
                ? {
                    ...f,
                    file: newFile,
                    previewUrl: newPreviewUrl,
                  }
                : f,
            ),
          );
          setIsEditing(false);
        });
    } catch (e) {
      console.error("Failed to save edited image", e);
    }
  };

  const handleSend = () => {
    const processed = fileList.map((f) => ({
      file: f.file,
      caption: f.caption,
    }));
    onSend(processed);
  };

  return (
    <OverlayContainer>
      <Header>
        <IconButton variant="ghost" onClick={onClose}>
          <X size={24} color="white" />
        </IconButton>
        <div style={{ fontWeight: 600 }}>
          {currentIndex + 1} / {fileList.length}
        </div>
        {!isEditing && (
          <IconButton
            variant="ghost"
            onClick={(e) => handleRemove(e, currentIndex)}
          >
            <Trash2 size={24} color="#ef4444" />
          </IconButton>
        )}
      </Header>

      <MainContent>
        {isEditing ? (
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              backgroundColor: "#000",
            }}
          >
            <FilerobotImageEditor
              source={currentFile.previewUrl}
              onSave={saveEdit}
              onClose={() => setIsEditing(false)}
              annotationsCommon={{
                fill: "#ff0000",
              }}
              tabsIds={[
                TABS.ADJUST,
                TABS.ANNOTATE,
                TABS.WATERMARK,
                TABS.FILTERS,
                TABS.FINETUNE,
              ]}
              defaultTabId={TABS.ANNOTATE}
              defaultToolId={TOOLS.PEN}
              savingPixelRatio={4}
              previewPixelRatio={window.devicePixelRatio}
            />
          </div>
        ) : (
          <PreviewArea>
            {currentFile.type === "image" ? (
              <img src={currentFile.previewUrl} alt="Preview" />
            ) : (
              <video src={currentFile.previewUrl} controls />
            )}
            {currentIndex > 0 && (
              <IconButton
                variant="ghost"
                style={{
                  position: "absolute",
                  left: spacing[4],
                  backgroundColor: "rgba(0,0,0,0.5)",
                }}
                onClick={() => setCurrentIndex((prev) => prev - 1)}
              >
                <ChevronLeft color="white" />
              </IconButton>
            )}
            {currentIndex < fileList.length - 1 && (
              <IconButton
                variant="ghost"
                style={{
                  position: "absolute",
                  right: spacing[4],
                  backgroundColor: "rgba(0,0,0,0.5)",
                }}
                onClick={() => setCurrentIndex((prev) => prev + 1)}
              >
                <ChevronRight color="white" />
              </IconButton>
            )}
          </PreviewArea>
        )}
      </MainContent>

      {!isEditing && (
        <Footer>
          <div
            style={{ display: "flex", alignItems: "center", gap: spacing[3] }}
          >
            {currentFile.type === "image" && (
              <IconButton variant="ghost" onClick={startEdit} title="Edit">
                <EditIcon size={20} color="white" />
              </IconButton>
            )}
            <CaptionInput
              placeholder="Add a caption..."
              value={currentFile.caption}
              onChange={(e) => updateCaption(e.target.value)}
            />
          </div>

          <Controls>
            <ThumbnailStrip>
              {fileList.map((f, i) => (
                <Thumbnail
                  key={f.id}
                  active={i === currentIndex}
                  onClick={() => setCurrentIndex(i)}
                >
                  {f.type === "image" ? (
                    <img src={f.previewUrl} alt="" />
                  ) : (
                    <video src={f.previewUrl} />
                  )}
                </Thumbnail>
              ))}
              <AddMoreButton onClick={onAddMore} title="Add more">
                <Plus size={24} color="white" />
              </AddMoreButton>
            </ThumbnailStrip>

            <ActionButton onClick={handleSend}>
              <Send size={20} />
            </ActionButton>
          </Controls>
        </Footer>
      )}
    </OverlayContainer>
  );
};
