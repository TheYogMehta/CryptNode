import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  User,
  PhoneOff,
  Mic,
  MicOff,
  Minimize2,
  Maximize2,
  Video,
  VideoOff,
  Phone,
} from "lucide-react";

import { IconButton } from "../../../../components/ui/IconButton";
import { colors, shadows } from "../../../../theme/design-system";

import { ChatClient } from "../../../../services/core/ChatClient";
import { avatarCacheService } from "../../../../services/storage/AvatarCacheService";
import {
  OverlayContainer,
  CallCard,
  AvatarContainer,
  CallerInfo,
  CallerName,
  CallStatus,
  ControlsRow,
  MinimizedContainer,
  MaximizeButton,
  FullScreenContainer,
  MainVideoArea,
  MinimizeButton,
} from "./CallOverlay.styles";

interface CallOverlayProps {
  callState: any;
  localStream: MediaStream | null;
  isMobile?: boolean;
  isMinimized?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  callState,
  localStream,
  isMobile = false,
  isMinimized: controlledIsMinimized,
  onAccept,
  onReject,
  onHangup,
  onMinimize,
  onMaximize,
}) => {
  const [duration, setDuration] = useState(0);
  const [internalIsMinimized, setInternalIsMinimized] = useState(false);
  const client = ChatClient.getInstance();
  const [isMuted, setIsMuted] = useState(!client.isMicEnabled);
  const [isVideoEnabled, setIsVideoEnabled] = useState(client.isVideoEnabled);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localPreviewRef = useRef<HTMLVideoElement | null>(null);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const isMinimized = controlledIsMinimized ?? internalIsMinimized;

  const [resolvedPeerAvatar, setResolvedPeerAvatar] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    const fetch = () => {
      avatarCacheService.getAvatar(callState?.peerAvatar).then((src) => {
        if (active) setResolvedPeerAvatar(src);
      }).catch(e => console.warn("Failed to resolve call avatar", e));
    };

    fetch();

    const unsub = avatarCacheService.onBust((cleanUrl) => {
      const myClean = (callState?.peerAvatar || "").replace(/\.jpg$/, "");
      if (myClean && cleanUrl === myClean) fetch();
    });

    return () => {
      active = false;
      unsub();
    };
  }, [callState?.peerAvatar]);

  useEffect(() => {
    const handleVideoToggle = (data: { enabled: boolean }) => {
      setIsVideoEnabled(data.enabled);
    };

    client.on("video_toggled", handleVideoToggle);

    return () => {
      client.off("video_toggled", handleVideoToggle);
    };
  }, [client]);

  useEffect(() => {
    if (callState?.status !== "connected") {
      setDuration(0);
      return;
    }
    const interval = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(interval);
  }, [callState?.status]);

  useEffect(() => {
    if (!localPreviewRef.current || !localStream) return;

    localPreviewRef.current.srcObject = localStream;
    localPreviewRef.current.muted = true;

    localPreviewRef.current.play().catch(e => {
      console.warn("Failed to auto-play local stream PIP", e);
    });
  }, [localStream, isVideoEnabled, isMinimized]);

  useEffect(() => {
    const handleRemoteStream = (stream: MediaStream | null) => {
      if (remoteVideoRef.current) {
        if (stream) {
          if (remoteVideoRef.current.srcObject !== stream) {
            remoteVideoRef.current.srcObject = stream;
          }
          // Always ensure play is called just in case
          remoteVideoRef.current.play().catch((err) => {
            console.error("Error playing remote video:", err);
          });

          const checkRemoteVideo = () => {
            const hasActiveVideo = stream.getVideoTracks().some(track => track.enabled && track.readyState === 'live');
            setHasRemoteVideo(hasActiveVideo);
          };

          checkRemoteVideo();
          stream.onaddtrack = checkRemoteVideo;
          stream.onremovetrack = checkRemoteVideo;
        } else {
          remoteVideoRef.current.srcObject = null;
          setHasRemoteVideo(false);
        }
      }
    };

    client.on("remote_stream_ready", handleRemoteStream);

    const existingStream = client.getRemoteStream();
    if (existingStream) {
      handleRemoteStream(existingStream);
    }

    return () => {
      client.off("remote_stream_ready", handleRemoteStream);
    };
  }, [client]);

  useEffect(() => {
    const existingStream = client.getRemoteStream();
    if (existingStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = existingStream;
      remoteVideoRef.current.play().catch(() => { });
    }
  }, [isMinimized, client]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStart.current = { x: clientX - position.x, y: clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    setPosition({
      x: clientX - dragStart.current.x,
      y: clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const toggleMic = () => {
    client.toggleMic();
    setIsMuted(!isMuted);
  };

  const toggleVideo = async () => {
    await client.toggleVideo(!isVideoEnabled);
  };

  const displayName = callState?.peerName || "Unknown";

  const activeMode =
    isVideoEnabled || callState?.type === "Video" ? "Video Call" : "Voice Call";

  const shouldShowRemoteVideo = hasRemoteVideo;
  const avatarImageStyle = {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    display: "block",
  };
  const neutralCallButtonVariant = "secondary" as const;
  const controlTrayStyle = {
    padding: 12,
    borderRadius: 999,
    background: colors.surface.primary,
    border: `1px solid ${colors.border.subtle}`,
    boxShadow: shadows.lg,
  };
  const minimizeCall = () => {
    if (onMinimize) {
      onMinimize();
      return;
    }
    setInternalIsMinimized(true);
  };
  const maximizeCall = () => {
    if (onMaximize) {
      onMaximize();
      return;
    }
    setInternalIsMinimized(false);
  };

  const renderInPortal = (node: React.ReactNode) => {
    if (typeof document === "undefined") return node;
    return createPortal(node, document.body);
  };

  if (!callState || callState.status === "idle") return null;

  if (
    callState.status === "ringing" ||
    callState.status === "outgoing" ||
    callState.status === "connecting"
  ) {
    const isIncoming = callState.status === "ringing";
    return renderInPortal(
      <OverlayContainer isMobile={isMobile}>
        <CallCard>
          <AvatarContainer isCalling>
            {resolvedPeerAvatar ? (
              <img
                src={resolvedPeerAvatar}
                style={avatarImageStyle}
              />
            ) : (
              callState.remoteSid?.[0]?.toUpperCase() || <User size={48} />
            )}
          </AvatarContainer>
          <CallerInfo>
            <CallerName>{displayName}</CallerName>
            <CallStatus>
              {callState.status === "connecting"
                ? "Connecting..."
                : isIncoming
                  ? "Incoming Call..."
                  : "Ringing..."}
            </CallStatus>
          </CallerInfo>

          <ControlsRow>
            {isIncoming ? (
              <>
                <IconButton variant="success" size="xl" onClick={onAccept}>
                  <Phone size={32} />
                </IconButton>
                <IconButton variant="danger" size="xl" onClick={onReject}>
                  <PhoneOff size={32} />
                </IconButton>
              </>
            ) : callState.status === "connecting" ? (
              <div style={{ color: colors.text.secondary, fontSize: "14px" }}>
                Establishing connection...
              </div>
            ) : (
              <IconButton variant="danger" size="xl" onClick={onHangup}>
                <PhoneOff size={32} />
              </IconButton>
            )}
          </ControlsRow>
        </CallCard>
      </OverlayContainer>
    );
  }

  // Minimized Active Call
  if (isMinimized) {
    return renderInPortal(
      <MinimizedContainer
        isMobile={isMobile}
        position={position}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onMouseMove={handleMouseMove}
        onTouchMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            flex: 1,
            position: "relative",
            backgroundColor: shouldShowRemoteVideo
              ? "black"
              : colors.surface.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: colors.text.primary,
          }}
        >
          {shouldShowRemoteVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <AvatarContainer
                style={{ width: 56, height: 56, marginBottom: 0 }}
              >
                {resolvedPeerAvatar ? (
                  <img
                    src={resolvedPeerAvatar}
                    style={avatarImageStyle}
                  />
                ) : (
                  displayName?.[0]?.toUpperCase() || <User size={24} />
                )}
              </AvatarContainer>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{displayName}</div>
              <div style={{ fontSize: 12, color: colors.text.secondary }}>
                {activeMode}
              </div>
            </div>
          )}
          <MaximizeButton
            onClick={(e) => {
              e.stopPropagation();
              maximizeCall();
            }}
          >
            <Maximize2 size={16} />
          </MaximizeButton>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            padding: 8,
            justifyContent: "center",
            background: colors.surface.secondary,
            borderTop: `1px solid ${colors.border.subtle}`,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <IconButton
            variant={isMuted ? "primary" : neutralCallButtonVariant}
            size="sm"
            onClick={toggleMic}
          >
            {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
          </IconButton>

          {(isVideoEnabled || callState.type === "Video") && (
            <IconButton
              variant={isVideoEnabled ? "primary" : neutralCallButtonVariant}
              size="sm"
              onClick={toggleVideo}
            >
              {isVideoEnabled ? <Video size={16} /> : <VideoOff size={16} />}
            </IconButton>
          )}



          <IconButton variant="danger" size="sm" onClick={onHangup}>
            <PhoneOff size={16} />
          </IconButton>
        </div>
      </MinimizedContainer>
    );
  }

  return renderInPortal(
    <OverlayContainer isMobile={isMobile} style={{ flexDirection: "column" }}>
      <FullScreenContainer>
        <MinimizeButton onClick={minimizeCall}>
          <Minimize2 size={32} />
        </MinimizeButton>

        <MainVideoArea hasRemoteVideo={shouldShowRemoteVideo}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: shouldShowRemoteVideo ? "block" : "none",
            }}
          />

          {/* Local Video PiP */}
          {isVideoEnabled && (
            <div
              style={{
                position: "absolute",
                top: "80px",
                right: "20px",
                width: "120px",
                height: "160px",
                borderRadius: "12px",
                overflow: "hidden",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                border: `1px solid ${colors.border.subtle}`,
                zIndex: 10,
              }}
            >
              <video
                ref={localPreviewRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: "scaleX(-1)",
                }}
              />
            </div>
          )}

          {!shouldShowRemoteVideo && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                textAlign: "center",
                color: colors.text.primary,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <AvatarContainer style={{ width: 150, height: 150 }}>
                {resolvedPeerAvatar ? (
                  <img
                    src={resolvedPeerAvatar}
                    style={avatarImageStyle}
                  />
                ) : (
                  callState.peerName?.[0]?.toUpperCase() ||
                  callState.remoteSid?.[0]?.toUpperCase() || <User size={48} />
                )}
              </AvatarContainer>
              <CallerName style={{ fontSize: 24, marginBottom: 0 }}>
                {displayName}
              </CallerName>
              <CallStatus
                style={{
                  color: colors.text.secondary,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {formatDuration(duration)} • {activeMode}
                {callState.peerMicMuted && (
                  <MicOff size={16} color={colors.status.error} />
                )}
              </CallStatus>
            </div>
          )}
        </MainVideoArea>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          {shouldShowRemoteVideo && (
            <>
              <CallerName
                style={{
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                }}
              >
                {displayName}
                {callState.peerMicMuted && (
                  <MicOff size={16} color={colors.status.error} />
                )}
              </CallerName>
              <CallStatus
                style={{ color: colors.text.secondary, marginBottom: 16 }}
              >
                {formatDuration(duration)} • {activeMode}
              </CallStatus>
            </>
          )}

          <ControlsRow style={controlTrayStyle}>
            <IconButton
              variant={isMuted ? "primary" : neutralCallButtonVariant}
              size="xl"
              onClick={toggleMic}
            >
              {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
            </IconButton>

            <IconButton
              variant={isVideoEnabled ? "primary" : neutralCallButtonVariant}
              size="xl"
              onClick={toggleVideo}
            >
              {isVideoEnabled ? <Video size={28} /> : <VideoOff size={28} />}
            </IconButton>



            <IconButton variant="danger" size="xl" onClick={onHangup}>
              <PhoneOff size={28} />
            </IconButton>
          </ControlsRow>
        </div>
      </FullScreenContainer>
    </OverlayContainer>
  );
};
