import React, { useState, useRef, useEffect } from "react";
import { Download, Play, Pause, Save } from "lucide-react";
import {
  AudioContainer,
  AudioControls,
  PlayPauseBtn,
  WaveformContainer,
  WaveformBar,
  SpeedButton,
  AudioTimeInfo,
} from "../Chat.styles";

interface AudioBubbleProps {
  src: string | null;
  onDownload: () => void;
  isDownloaded: boolean;
  isDownloading: boolean;
  progress: number;
  isMe: boolean;
  onSave: () => void;
}

export const AudioBubble: React.FC<AudioBubbleProps> = ({
  src,
  onDownload,
  isDownloaded,
  isDownloading,
  progress,
  isMe,
  onSave,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [waveform] = useState(() =>
    Array.from({ length: 40 }, () => Math.random() * 0.8 + 0.2),
  );

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const formatTime = (time: number) => {
    if (!Number.isFinite(time)) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? "0" : ""}${sec}`;
  };

  const handleSpeed = () => {
    setSpeed((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1));
  };

  return (
    <AudioContainer isMe={isMe}>
      {src ? (
        <audio
          ref={audioRef}
          src={src}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d)) setDuration(d);
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onEnded={() => setIsPlaying(false)}
          style={{ display: "none" }}
        />
      ) : null}

      <AudioControls isMe={isMe}>
        <PlayPauseBtn
          isMe={isMe}
          onClick={isDownloaded ? togglePlay : onDownload}
        >
          {!isDownloaded ? (
            isDownloading ? (
              <span style={{ fontSize: "10px", fontWeight: "bold" }}>
                {Math.round(progress * 100)}%
              </span>
            ) : (
              <Download size={20} />
            )
          ) : isPlaying ? (
            <Pause size={20} fill="currentColor" />
          ) : (
            <Play size={20} fill="currentColor" />
          )}
        </PlayPauseBtn>

        <WaveformContainer>
          {waveform.map((h, i) => (
            <WaveformBar
              key={i}
              height={h}
              isMe={isMe}
              active={i / waveform.length < currentTime / duration}
            />
          ))}
        </WaveformContainer>

        {isDownloaded && (
          <SpeedButton onClick={handleSpeed}>{speed}x</SpeedButton>
        )}
      </AudioControls>

      <AudioTimeInfo>
        <span>{isDownloaded ? formatTime(currentTime) : "0:00"}</span>
        <span>
          {isDownloaded
            ? formatTime(duration)
            : isDownloading
            ? "Downloading..."
            : "Voice Note"}
        </span>
      </AudioTimeInfo>

      {isDownloaded && !isMe && (
        <div
          style={{ position: "absolute", top: 4, right: 4 }}
          onClick={onSave}
        >
          <Save size={14} style={{ opacity: 0.5, cursor: "pointer" }} />
        </div>
      )}
    </AudioContainer>
  );
};
