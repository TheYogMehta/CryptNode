// @ts-nocheck
import React from "react";
import { createPortal } from "react-dom";
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
    meta?: {
      sender?: string;
      senderName?: string;
      timestamp?: number;
      senderAvatar?: string;
    }
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
    <>
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
      {isOpen && media?.meta && createPortal(
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '80px', zIndex: 999999, display: 'flex', alignItems: 'center', padding: '0 24px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)', pointerEvents: 'none' }}>
            {media.meta.sender === 'me' ? (
              <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 'bold', color: 'white' }}>
                Y
              </div>
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 'bold', color: 'white' }}>
                {(media.meta.senderName || "").charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ marginLeft: '12px', color: 'white', fontWeight: 600, fontSize: '16px', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
              {media.meta.sender === 'me' ? "You" : (media.meta.senderName || "User")}
            </div>
          </div>
          
          {media.meta.timestamp && (
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '80px', zIndex: 999999, display: 'flex', alignItems: 'flex-end', padding: '0 24px 24px 24px', background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)', pointerEvents: 'none' }}>
              <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: '14px', textShadow: '0 1px 4px rgba(0,0,0,0.9)', fontWeight: 500 }}>
                {new Date(Number(media.meta.timestamp)).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}
              </div>
            </div>
          )}
        </>,
        document.body
      )}
    </>
  );
};
