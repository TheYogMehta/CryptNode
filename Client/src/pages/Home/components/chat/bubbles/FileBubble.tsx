import React from "react";
import { Download, Save, FileIcon, Eye } from "lucide-react";
import { FileAttachment, FileInfo, FileName, FileStatus } from "../Chat.styles";

interface FileBubbleProps {
  text: string | null;
  isDownloaded: boolean;
  isDownloading: boolean;
  progress: number;
  onDownload: () => void;
  onSave: () => void;
  onOpen?: () => void;
}

export const FileBubble: React.FC<FileBubbleProps> = ({
  text,
  isDownloaded,
  isDownloading,
  progress,
  onDownload,
  onSave,
  onOpen,
}) => {
  return (
    <FileAttachment 
      onClick={isDownloaded && onOpen ? onOpen : undefined} 
      style={{ cursor: isDownloaded && onOpen ? "pointer" : "default" }}
    >
      <div
        style={{
          padding: "10px",
          backgroundColor: "rgba(255,255,255,0.1)",
          borderRadius: "8px",
        }}
      >
        <FileIcon size={24} />
      </div>
      <FileInfo>
        <FileName>{text || "File"}</FileName>
        <FileStatus>{isDownloaded ? "Downloaded" : "Attachment"}</FileStatus>
      </FileInfo>
      {isDownloaded ? (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
            title="Save to Device"
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              opacity: 0.8,
              display: "flex",
            }}
          >
            <Save size={20} />
          </button>
        </div>
      ) : (
        !isDownloading && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              opacity: 0.8,
            }}
          >
            <Download size={20} />
          </button>
        )
      )}
      {isDownloading && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 12,
            right: 12,
            height: "3px",
            backgroundColor: "rgba(255,255,255,0.1)",
          }}
        >
          <div
            style={{
              width: `${progress * 100}%`,
              height: "100%",
              backgroundColor: "#4ade80",
            }}
          />
        </div>
      )}
    </FileAttachment>
  );
};
