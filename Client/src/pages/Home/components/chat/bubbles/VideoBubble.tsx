import React from "react";
import { Download, Play } from "lucide-react";
import { MediaContainer } from "../Chat.styles";

interface VideoBubbleProps {
  src: string | null;
  isDownloaded: boolean;
  isDownloading: boolean;
  isRequestingDownload: boolean;
  progress: number;
  onDownload: () => void;
  onMediaClick?: (
    url: string,
    type: "image" | "video",
    description?: string,
  ) => void;
  text: string | null;
}

export const VideoBubble: React.FC<VideoBubbleProps> = ({
  src,
  isDownloaded,
  isDownloading,
  isRequestingDownload,
  progress,
  onDownload,
  onMediaClick,
  text,
}) => {
  if (isDownloaded && src) {
    return (
      <MediaContainer>
        <video
          src={src}
          controls={false}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMediaClick?.(src || "", "video", text || "");
          }}
          style={{
            maxWidth: "100%",
            borderRadius: "12px",
            cursor: "pointer",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "rgba(0,0,0,0.5)",
              borderRadius: "50%",
              padding: "12px",
              backdropFilter: "blur(4px)",
            }}
          >
            <Play size={24} fill="white" color="white" />
          </div>
        </div>
      </MediaContainer>
    );
  }
  return (
    <MediaContainer>
      {isDownloading ? (
        <div style={{ color: "white" }}>
          {isRequestingDownload ? "0%" : `${Math.round(progress * 100)}%`}
        </div>
      ) : (
        <button
          onClick={onDownload}
          style={{
            padding: "8px 16px",
            borderRadius: "20px",
            border: "none",
            backgroundColor: "rgba(255,255,255,0.2)",
            color: "white",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Download size={16} /> <span>Video</span>
        </button>
      )}
    </MediaContainer>
  );
};
