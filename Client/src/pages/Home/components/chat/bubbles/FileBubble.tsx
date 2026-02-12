import React from "react";
import { Download, Save, FileIcon } from "lucide-react";
import { FileAttachment, FileInfo, FileName, FileStatus } from "../Chat.styles";

interface FileBubbleProps {
  text: string | null;
  isDownloaded: boolean;
  isDownloading: boolean;
  progress: number;
  onDownload: () => void;
  onSave: () => void;
}

export const FileBubble: React.FC<FileBubbleProps> = ({
  text,
  isDownloaded,
  isDownloading,
  progress,
  onDownload,
  onSave,
}) => {
  return (
    <FileAttachment>
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
        <button
          onClick={onSave}
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            opacity: 0.8,
          }}
        >
          <Save size={20} />
        </button>
      ) : (
        !isDownloading && (
          <button
            onClick={onDownload}
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
