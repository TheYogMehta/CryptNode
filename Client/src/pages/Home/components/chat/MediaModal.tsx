// @ts-nocheck
import React from "react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

// Plugins
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Video from "yet-another-react-lightbox/plugins/video";
import Download from "yet-another-react-lightbox/plugins/download";

interface MediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  media: {
    type: "image" | "video";
    url: string;
    description?: string;
    mimeType?: string;
  } | null;
}

export const MediaModal: React.FC<MediaModalProps> = ({
  isOpen,
  onClose,
  media,
}) => {
  if (!isOpen || !media) return null;

  const slides = [
    media.type === "video"
      ? {
          type: "video" as const,
          src: media.url,
          alt: media.description || "Media Viewer",
          sources: [
            {
              src: media.url,
              type: media.mimeType || "video/mp4",
            },
          ],
        }
      : {
          type: "image" as const,
          src: media.url,
          alt: media.description || "Media Viewer",
          downloadUrl: media.url,
        },
  ] as import("yet-another-react-lightbox").Slide[];

  return (
    <Lightbox
      open={isOpen}
      close={onClose}
      slides={slides}
      plugins={[Zoom, Video, Download]}
      carousel={{ finite: true }}
      controller={{ closeOnBackdropClick: true }}
      styles={{
        root: { "--yarl__color_backdrop": "rgba(0, 0, 0, 0.95)" },
      }}
      zoom={{
        maxZoomPixelRatio: 4,
      }}
    />
  );
};
