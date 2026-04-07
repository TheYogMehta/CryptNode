import React from "react";
import Modal from "@mui/material/Modal";
import { FileText, X } from "lucide-react";

import { FilePreviewPane } from "../../../../components/files/FilePreviewPane";
import {
  colors,
  radii,
  shadows,
} from "../../../../theme/design-system";

interface FileViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string | null;
  fileName: string;
  mimeType: string;
  originalPath?: string | null;
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({
  isOpen,
  onClose,
  fileUrl,
  fileName,
  mimeType,
  originalPath,
}) => {
  const modalSurface = colors.surface.primary;
  const modalHeaderSurface = colors.background.secondary;
  const modalBorder = colors.border.subtle;
  const modalText = colors.text.primary;
  const modalMutedText = colors.text.secondary;

  if (!isOpen) return null;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      aria-labelledby="file-viewer-modal"
      aria-describedby="file-viewer-modal-description"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "90%",
          maxWidth: "1000px",
          height: "85vh",
          backgroundColor: modalSurface,
          borderRadius: radii.lg,
          display: "flex",
          flexDirection: "column",
          boxShadow: shadows["2xl"],
          border: `1px solid ${modalBorder}`,
          overflow: "hidden",
          outline: "none",
          isolation: "isolate",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: `1px solid ${modalBorder}`,
            backgroundColor: modalHeaderSurface,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: modalText,
            }}
          >
            <FileText size={20} color={colors.primary.DEFAULT} />
            <h2
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "60vw",
              }}
            >
              {fileName}
            </h2>
          </div>

          <button
            onClick={onClose}
            style={{
              border: "none",
              background: colors.background.tertiary,
              color: modalMutedText,
              cursor: "pointer",
              padding: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radii.sm,
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = String(colors.text.primary);
              e.currentTarget.style.background = String(colors.surface.highlight);
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = String(colors.text.secondary);
              e.currentTarget.style.background = String(colors.background.tertiary);
            }}
          >
            <X size={20} />
          </button>
        </div>

        <FilePreviewPane
          fileUrl={fileUrl}
          fileName={fileName}
          mimeType={mimeType}
          originalPath={originalPath}
          theme={{
            panelBackground: colors.background.secondary,
            textColor: colors.text.primary,
            mutedTextColor: colors.text.secondary,
            borderColor: colors.border.subtle,
            toolbarBackground: colors.background.tertiary,
            docxWorkspaceBackground: "#f8f9fa",
            docxPaperBackground: "#ffffff",
            errorColor: colors.status.error,
            pageShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}
          loadingLabel="Loading document viewer..."
          style={{ flex: 1 }}
        />
ChatWindowModern      </div>
    </Modal>
  );
};
