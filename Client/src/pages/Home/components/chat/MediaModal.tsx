// @ts-nocheck
import React from "react";
import { createPortal } from "react-dom";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

// Plugins
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Video from "yet-another-react-lightbox/plugins/video";
import Download from "yet-another-react-lightbox/plugins/download";
import { videoTranscoder } from "../../../../services/media/VideoTranscoder";
import { CircularProgress, Button, Box, Typography } from "@mui/material";
import { AlertTriangle, RefreshCw } from "lucide-react";

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
  const [transcoding, setTranscoding] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [transcodedUrl, setTranscodedUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [hasCodecError, setHasCodecError] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      if (transcodedUrl) URL.revokeObjectURL(transcodedUrl);
      setTranscodedUrl(null);
      setTranscoding(false);
      setProgress(0);
      setError(null);
      setHasCodecError(false);
    }
  }, [isOpen]);

  const handleTranscode = async () => {
    if (!media || media.type !== "video" || transcoding) return;
    
    setTranscoding(true);
    setError(null);
    setProgress(0);

    try {
      const response = await fetch(media.url);
      const blob = await response.blob();
      
      const transcodedBlob = await videoTranscoder.transcodeToH264(blob, (p) => {
        setProgress(p * 100);
      });
      
      const newUrl = URL.createObjectURL(transcodedBlob);
      setTranscodedUrl(newUrl);
      setHasCodecError(false);
    } catch (err: any) {
      console.error("Transcoding failed:", err);
      setError("Transcoding failed. The video might be too large or corrupted.");
    } finally {
      setTranscoding(false);
    }
  };

  if (!isOpen || !media) return null;

  const currentUrl = transcodedUrl || media.url;

  const slides = [
    media.type === "video"
      ? {
          type: "video" as const,
          src: currentUrl,
          alt: media.description || "Media Viewer",
          sources: [
            {
              src: currentUrl,
              type: "video/mp4",
            },
          ],
        }
      : {
          type: "image" as const,
          src: currentUrl,
          alt: media.description || "Media Viewer",
          downloadUrl: currentUrl,
        },
  ] as import("yet-another-react-lightbox").Slide[];

  return (
    <>
      <Lightbox
        open={isOpen}
        close={onClose}
        slides={slides}
        plugins={[Zoom, Video, Download]}
        render={{
          video: ({ slide, offset, rect }) => {
            return (
              <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <video
                  src={slide.src}
                  controls
                  autoPlay
                  style={{ maxWidth: '100%', maxHeight: '100%' }}
                  onError={(e) => {
                    console.warn("Video playback error detected", e);
                    if (!transcodedUrl) setHasCodecError(true);
                  }}
                />
                
                {(hasCodecError || error) && !transcoding && (
                  <Box sx={{ 
                    position: 'absolute', 
                    inset: 0, 
                    bgcolor: 'rgba(0,0,0,0.8)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    p: 4,
                    zIndex: 10
                  }}>
                    <AlertTriangle color="#f87171" size={48} />
                    <Typography variant="h6" color="white" sx={{ mt: 2, textAlign: 'center' }}>
                      {error || "This video format is not natively supported."}
                    </Typography>
                    <Typography variant="body2" color="rgba(255,255,255,0.7)" sx={{ mb: 3, textAlign: 'center' }}>
                      We can fix this by transcoding it to a compatible format.
                    </Typography>
                    <Button 
                      variant="contained" 
                      startIcon={<RefreshCw size={18} />}
                      onClick={handleTranscode}
                      sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
                    >
                      Fix Video (Transcode)
                    </Button>
                  </Box>
                )}

                {transcoding && (
                  <Box sx={{ 
                    position: 'absolute', 
                    inset: 0, 
                    bgcolor: 'rgba(0,0,0,0.8)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    zIndex: 10
                  }}>
                    <CircularProgress variant="determinate" value={progress} size={64} sx={{ color: '#6366f1' }} />
                    <Typography color="white" sx={{ mt: 2, fontWeight: 'bold' }}>
                      Fixing Video... {Math.round(progress)}%
                    </Typography>
                    <Typography variant="body2" color="rgba(255,255,255,0.6)" sx={{ mt: 1 }}>
                      This may take a minute on mobile devices.
                    </Typography>
                  </Box>
                )}
              </Box>
            );
          }
        }}
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
