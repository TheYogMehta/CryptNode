import React from "react";
import styled from "@emotion/styled";
import {
  Inbox,
  QrCode,
  Smartphone,
  Camera,
  Upload,
  Copy,
  Check,
  Search,
  Wifi,
} from "lucide-react";
import { InputField } from "./Overlay.styles";
import { Button } from "../../../../components/ui/Button";
import ChatClient from "../../../../services/core/ChatClient";
import {
  getOutboundRequestHistory,
  getPendingRequests,
  type OutboundRequestHistoryEntry,
  type OutboundRequestStatus,
} from "../../../../services/storage/sqliteService";
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from "../../../../theme/design-system";
import jsQR from "jsqr";
import { qrService } from "../../../../services/mfa/qr.service";
import toast from "react-hot-toast";

interface ConnectionSetupProps {
  targetEmail: string;
  setTargetEmail: (val: string) => void;
  onConnect: () => void;
  isJoining: boolean;
}

interface BtDevice {
  id: string;
  name: string;
  email: string;
  x: number;
  y: number;
  status: "idle" | "sending" | "sent" | "failed";
}

const TabContainer = styled.div`
  display: flex;
  background: ${colors.background.tertiary};
  border: 1px solid ${colors.border.subtle};
  border-radius: ${radii.lg};
  padding: 4px;
  gap: 4px;
  width: 100%;
`;

const TabButton = styled.button<{ $active: boolean }>`
  flex: 1;
  background: ${({ $active }) => ($active ? colors.primary.main : "transparent")};
  color: ${({ $active }) => ($active ? colors.text.inverse : colors.text.secondary)};
  border: none;
  border-radius: ${radii.md};
  padding: 10px 14px;
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease-in-out;

  &:hover {
    color: ${({ $active }) => ($active ? colors.text.inverse : colors.text.primary)};
    background: ${({ $active }) => ($active ? colors.primary.main : "rgba(255, 255, 255, 0.05)")};
  }
`;

const TabContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[5]};
  margin-top: ${spacing[2]};
  animation: connection-fadeIn 0.3s ease-in-out;

  @keyframes connection-fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

const SubTabContainer = styled.div`
  display: flex;
  justify-content: center;
  gap: ${spacing[4]};
  margin-bottom: ${spacing[2]};
`;

const SubTabButton = styled.button<{ $active: boolean }>`
  background: transparent;
  color: ${({ $active }) => ($active ? colors.primary.main : colors.text.tertiary)};
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? colors.primary.main : "transparent")};
  padding: 8px 16px;
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    color: ${colors.text.primary};
  }
`;

const QRCodeWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${spacing[5]};
  padding: ${spacing[6]} 0;
`;

const QRCodeContainer = styled.div`
  background: #ffffff;
  padding: ${spacing[4]};
  border-radius: 20px;
  box-shadow: 0 8px 30px rgba(99, 102, 241, 0.15);
  border: 4px solid ${colors.primary.subtle};
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 240px;
  height: 240px;
  overflow: hidden;
`;

const QRCodeImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

const CopyButtonContainer = styled.div`
  display: flex;
  gap: ${spacing[3]};
  width: 100%;
  max-width: 320px;
`;

const ScannerContainer = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  max-width: 400px;
  margin: 0 auto;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid ${colors.border.subtle};
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ScannerLaser = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: ${colors.primary.main};
  box-shadow: 0 0 8px ${colors.primary.main}, 0 0 15px ${colors.primary.main};
  z-index: 10;
  animation: qr-scan-laser 2.5s infinite linear;

  @keyframes qr-scan-laser {
    0% { top: 0%; }
    50% { top: 100%; }
    100% { top: 0%; }
  }
`;

const ScannerOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 40px solid rgba(0, 0, 0, 0.5);
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;

  &::after {
    content: '';
    width: calc(100% + 4px);
    height: calc(100% + 4px);
    border: 2px solid ${colors.primary.main};
    border-radius: 8px;
    box-shadow: 0 0 8px rgba(99, 102, 241, 0.5);
  }
`;

const GlassCard = styled.div`
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid ${colors.border.subtle};
  border-radius: ${radii.xl};
  padding: ${spacing[5]};
  display: flex;
  flex-direction: column;
  gap: ${spacing[4]};
  backdrop-filter: blur(10px);
  width: 100%;
`;

const SimulationHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${colors.text.tertiary};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.semibold};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: ${spacing[2]};
`;

const SimulatorPanel = styled(GlassCard)`
  background: rgba(99, 102, 241, 0.03);
  border: 1px dashed rgba(99, 102, 241, 0.25);
  width: 100%;
`;

const NFCContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${spacing[5]};
  padding: ${spacing[4]} 0;
  text-align: center;
`;

const NFCAnimationWrapper = styled.div`
  position: relative;
  width: 160px;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const NFCRadarPulse = styled.div<{ $active: boolean }>`
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid ${colors.primary.main};
  opacity: 0;
  animation: ${({ $active }) => ($active ? "nfc-pulse 2s infinite cubic-bezier(0.16, 1, 0.3, 1)" : "none")};

  @keyframes nfc-pulse {
    0% {
      transform: scale(0.6);
      opacity: 0.8;
    }
    100% {
      transform: scale(1.3);
      opacity: 0;
    }
  }
`;

const NFCIconContainer = styled.div`
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background: ${colors.background.tertiary};
  border: 2px solid ${colors.border.subtle};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${colors.primary.main};
  z-index: 2;
  box-shadow: ${shadows.md};
`;

const RadarContainer = styled.div`
  position: relative;
  width: 260px;
  height: 260px;
  margin: 0 auto;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.05) 0%, rgba(0, 0, 0, 0.4) 100%);
  border: 2px solid ${colors.border.subtle};
  overflow: hidden;
  box-shadow: inset 0 0 20px rgba(0,0,0,0.8), ${shadows.md};
`;

const RadarSweep = styled.div<{ $scanning: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: conic-gradient(from 0deg, rgba(99, 102, 241, 0.15) 0deg, rgba(99, 102, 241, 0) 90deg);
  border-radius: 50%;
  transform-origin: center;
  animation: ${({ $scanning }) => ($scanning ? "radar-spin 3s infinite linear" : "none")};

  @keyframes radar-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const RadarCircle = styled.div<{ $size: number }>`
  position: absolute;
  top: 50%;
  left: 50%;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  transform: translate(-50%, -50%);
  border: 1px dashed rgba(99, 102, 241, 0.15);
  border-radius: 50%;
  pointer-events: none;
`;

const RadarCrosslineH = styled.div`
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 1px;
  background: rgba(99, 102, 241, 0.1);
  pointer-events: none;
`;

const RadarCrosslineV = styled.div`
  position: absolute;
  left: 50%;
  top: 0;
  width: 1px;
  height: 100%;
  background: rgba(99, 102, 241, 0.1);
  pointer-events: none;
`;

const RadarNode = styled.button<{ $x: number; $y: number; $active: boolean }>`
  position: absolute;
  left: ${({ $x }) => $x}%;
  top: ${({ $y }) => $y}%;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: ${colors.primary.main};
  border: 2px solid ${colors.text.inverse};
  cursor: pointer;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 10px ${colors.primary.main};
  transition: all 0.3s ease;
  z-index: 10;
  animation: radar-node-glow 1.5s infinite alternate;

  &:hover {
    transform: translate(-50%, -50%) scale(1.3);
    background: #10B981;
    box-shadow: 0 0 15px #10B981;
  }

  @keyframes radar-node-glow {
    0% { opacity: 0.6; box-shadow: 0 0 5px ${colors.primary.main}; }
    100% { opacity: 1; box-shadow: 0 0 12px ${colors.primary.main}; }
  }
`;

interface PendingRequestEntry {
  email: string;
  name: string;
  avatar: string;
  publicKey: string;
  publicKeys: string[];
  senderHash: string;
}

const Page = styled.section`
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: auto;
  background:
    radial-gradient(circle at top right, ${colors.primary.subtle} 0%, transparent 34%),
    ${colors.background.secondary};
`;

const PageInner = styled.div`
  min-height: 100%;
  padding: clamp(20px, 3vw, 40px);
  display: flex;
  flex-direction: column;
  gap: clamp(20px, 3vw, 32px);

  @media (max-width: 768px) {
    padding:
      ${spacing[4]}
      ${spacing[4]}
      max(${spacing[6]}, env(safe-area-inset-bottom))
      ${spacing[4]};
    gap: ${spacing[4]};
  }
`;

const HeroGrid = styled.div`
  width: 100%;
  display: flex;
`;

const Surface = styled.div`
  border-radius: 28px;
  border: 1px solid ${colors.border.subtle};
  background:
    linear-gradient(180deg, rgba(99, 102, 241, 0.06) 0%, transparent 100%),
    ${colors.background.secondary};
  box-shadow: ${shadows.lg};
`;

const FormPanel = styled(Surface)`
  padding: clamp(22px, 2.7vw, 30px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: ${spacing[5]};
  width: min(760px, 100%);
  margin: 0 auto;
`;

const PanelHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};
  text-align: left;
`;

const PanelTitle = styled.h2`
  margin: 0;
  color: ${colors.text.primary};
  font-size: ${typography.fontSize["2xl"]};
  font-weight: ${typography.fontWeight.semibold};
`;

const PanelText = styled.p`
  margin: 0;
  color: ${colors.text.secondary};
  font-size: ${typography.fontSize.base};
  line-height: 1.65;
`;

const InputShell = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 64px;
  border-radius: ${radii.xl};
  border: 1px solid ${colors.border.subtle};
  background: ${colors.background.tertiary};
  overflow: hidden;

  @media (max-width: 520px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const UsernameInput = styled(InputField)`
  flex: 1;
  min-width: 0;
  min-height: 64px;
  background: transparent;
  border: none;
  border-radius: 0;
  color: ${colors.text.primary};
  -webkit-text-fill-color: ${colors.text.primary};
  caret-color: ${colors.text.primary};
  font-size: ${typography.fontSize.lg};
  padding: 0 ${spacing[5]};

  &::placeholder {
    color: ${colors.text.tertiary};
  }
`;

const DomainSuffix = styled.div`
  padding: 0 ${spacing[5]};
  align-self: stretch;
  display: flex;
  align-items: center;
  border-left: 1px solid ${colors.border.subtle};
  color: ${colors.text.secondary};
  white-space: nowrap;
  font-size: ${typography.fontSize.base};

  @media (max-width: 520px) {
    min-height: 48px;
    border-left: none;
    border-top: 1px solid ${colors.border.subtle};
    justify-content: flex-start;
  }
`;

const RequestsPanel = styled(Surface)`
  padding: clamp(22px, 2.7vw, 30px);
  display: flex;
  flex-direction: column;
  gap: ${spacing[5]};
`;

const RequestsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: ${spacing[4]};

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const RequestsCount = styled.div`
  padding: ${spacing[1]} ${spacing[3]};
  border-radius: ${radii.full};
  background: ${colors.background.tertiary};
  border: 1px solid ${colors.border.subtle};
  color: ${colors.text.secondary};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.semibold};
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const RequestsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[3]};
`;

const EmptyState = styled.div`
  padding: clamp(24px, 3vw, 34px);
  border-radius: ${radii.xl};
  border: 1px dashed ${colors.border.subtle};
  background: rgba(255, 255, 255, 0.02);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${spacing[3]};
  text-align: center;
  color: ${colors.text.secondary};
`;

const RequestCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing[4]};
  padding: ${spacing[4]};
  border-radius: ${radii.xl};
  border: 1px solid ${colors.border.subtle};
  background: rgba(255, 255, 255, 0.02);

  @media (max-width: 720px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const RequestIdentity = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[4]};
  min-width: 0;
  flex: 1;
`;

const Avatar = styled.div`
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: ${colors.primary.main};
  color: ${colors.text.inverse};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${typography.fontSize.lg};
  font-weight: ${typography.fontWeight.bold};
  flex-shrink: 0;
  overflow: hidden;
`;

const AvatarImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const RequestText = styled.div`
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${spacing[1]};
`;

const RequestName = styled.div`
  color: ${colors.text.primary};
  font-size: ${typography.fontSize.base};
  font-weight: ${typography.fontWeight.semibold};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RequestEmail = styled.div`
  color: ${colors.text.secondary};
  font-size: ${typography.fontSize.sm};
  word-break: break-all;
  line-height: 1.45;
`;

const RequestActions = styled.div`
  display: flex;
  gap: ${spacing[2]};
  flex-wrap: wrap;
  justify-content: flex-end;

  @media (max-width: 720px) {
    justify-content: stretch;
  }

  & > button {
    min-width: 104px;
  }

  @media (max-width: 520px) {
    & > button {
      width: 100%;
    }
  }
`;

const HistoryTableShell = styled.div`
  border-radius: ${radii.xl};
  border: 1px solid ${colors.border.subtle};
  background: rgba(255, 255, 255, 0.02);
  overflow: hidden;
`;

const HistoryTableScroll = styled.div`
  overflow-x: auto;
`;

const HistoryTable = styled.table`
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
`;

const HistoryHeadCell = styled.th`
  padding: ${spacing[3]} ${spacing[4]};
  text-align: left;
  color: ${colors.text.tertiary};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.semibold};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-bottom: 1px solid ${colors.border.subtle};
  background: rgba(255, 255, 255, 0.03);
`;

const HistoryBodyRow = styled.tr`
  &:not(:last-of-type) td {
    border-bottom: 1px solid ${colors.border.subtle};
  }
`;

const HistoryCell = styled.td`
  padding: ${spacing[4]};
  color: ${colors.text.secondary};
  font-size: ${typography.fontSize.sm};
  vertical-align: middle;
`;

const HistoryUser = styled.div`
  color: ${colors.text.primary};
  font-size: ${typography.fontSize.base};
  font-weight: ${typography.fontWeight.semibold};
`;

const HistoryTime = styled.div`
  color: ${colors.text.primary};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
`;

const StatusBadge = styled.span<{ $status: OutboundRequestStatus }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: ${spacing[1]} ${spacing[3]};
  border-radius: ${radii.full};
  border: 1px solid
    ${({ $status }) => {
    if ($status === "accepted") return "rgba(34, 197, 94, 0.35)";
    if ($status === "blocked") return "rgba(239, 68, 68, 0.4)";
    if ($status === "rejected") return "rgba(248, 113, 113, 0.35)";
    return "rgba(99, 102, 241, 0.35)";
  }};
  background:
    ${({ $status }) => {
    if ($status === "accepted") return "rgba(34, 197, 94, 0.12)";
    if ($status === "blocked") return "rgba(239, 68, 68, 0.14)";
    if ($status === "rejected") return "rgba(248, 113, 113, 0.12)";
    return "rgba(99, 102, 241, 0.14)";
  }};
  color:
    ${({ $status }) => {
    if ($status === "accepted") return "#86efac";
    if ($status === "blocked") return "#fca5a5";
    if ($status === "rejected") return "#fda4af";
    return "#a5b4fc";
  }};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.semibold};
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const formatHistoryName = (email: string) => {
  const [username] = email.split("@");
  return username || "Unknown user";
};

const formatHistoryStatus = (status: OutboundRequestStatus) => {
  if (status === "accepted") return "Accepted";
  if (status === "blocked") return "Blocked";
  if (status === "rejected") return "Rejected";
  return "Pending";
};

const formatHistoryTimestamp = (timestamp: number) => {
  if (!timestamp) return "Awaiting update";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
};

export const ConnectionSetup: React.FC<ConnectionSetupProps> = ({
  targetEmail,
  setTargetEmail,
  onConnect,
  isJoining,
}) => {
  const [pending, setPending] = React.useState<PendingRequestEntry[]>([]);
  const [history, setHistory] = React.useState<OutboundRequestHistoryEntry[]>([]);

  // Add tabs state
  const [activeTab, setActiveTab] = React.useState<"manual" | "qr" | "nfc" | "bluetooth">("manual");
  
  // QR scanner state
  const [qrSubTab, setQrSubTab] = React.useState<"my-code" | "scan-code">("my-code");
  const [myQrUrl, setMyQrUrl] = React.useState<string>("");
  const [hasCopied, setHasCopied] = React.useState(false);
  const [qrScanning, setQrScanning] = React.useState(false);
  const [qrError, setQrError] = React.useState<string | null>(null);
  
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  
  // NFC state
  const [nfcState, setNfcState] = React.useState<"idle" | "reading" | "writing" | "success" | "error">("idle");
  const [nfcLog, setNfcLog] = React.useState<string>("");
  const [simulatedNfcEmail, setSimulatedNfcEmail] = React.useState("");

  // Bluetooth state
  const [btScanning, setBtScanning] = React.useState(false);
  const [btDevices, setBtDevices] = React.useState<BtDevice[]>([]);
  const [newDeviceName, setNewDeviceName] = React.useState("");
  const [newDeviceEmail, setNewDeviceEmail] = React.useState("");

  React.useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        const [pendingRequests, requestHistory] = await Promise.all([
          getPendingRequests(),
          getOutboundRequestHistory(),
        ]);

        if (!mounted) return;

        setPending(pendingRequests as PendingRequestEntry[]);
        setHistory(requestHistory);
      } catch (err) {
        console.error("Failed to load connection setup data", err);
      }
    };

    const handleNew = () => {
      if (!mounted) return;
      loadData();
    };

    ChatClient.on("inbound_request", handleNew);
    ChatClient.on("pending_requests_changed", handleNew);
    ChatClient.on("request_history_changed", handleNew);

    loadData();

    return () => {
      mounted = false;
      ChatClient.off("inbound_request", handleNew);
      ChatClient.off("pending_requests_changed", handleNew);
      ChatClient.off("request_history_changed", handleNew);
    };
  }, []);

  // Generate My QR Code
  React.useEffect(() => {
    const email = ChatClient.userEmail;
    if (email) {
      const payload = `cryptnode://add-friend?data=${btoa(email.trim().toLowerCase())}`;
      qrService.toDataUrl(payload)
        .then(url => setMyQrUrl(url))
        .catch(err => console.error("Failed to generate QR", err));
    }
  }, [ChatClient.userEmail]);

  // Clean up scanner when tab changes
  React.useEffect(() => {
    return () => {
      stopQrScan();
    };
  }, [activeTab, qrSubTab]);

  const removePending = (req: PendingRequestEntry) => {
    setPending((prev) =>
      prev.filter(
        (item) =>
          item.email !== req.email && item.senderHash !== req.senderHash,
      ),
    );
  };

  // QR Code camera handlers
  const startQrScan = async () => {
    setQrError(null);
    setQrScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.play();
        requestAnimationFrame(tickQrScan);
      }
    } catch (err) {
      console.error("Camera access failed", err);
      setQrError("Could not access camera. Please allow camera permissions or upload an image.");
      setQrScanning(false);
    }
  };

  const stopQrScan = () => {
    setQrScanning(false);
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const tickQrScan = () => {
    if (!videoRef.current || !canvasRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      if (videoRef.current && videoRef.current.srcObject && qrScanning) {
        requestAnimationFrame(tickQrScan);
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code) {
        handleDecodedQR(code.data);
      } else if (qrScanning) {
        requestAnimationFrame(tickQrScan);
      }
    } catch (e) {
      if (qrScanning) {
        requestAnimationFrame(tickQrScan);
      }
    }
  };

  const handleDecodedQR = (text: string) => {
    stopQrScan();
    console.log("Decoded QR data:", text);
    
    let email = "";
    if (text.startsWith("cryptnode://add-friend?data=")) {
      const base64Data = text.replace("cryptnode://add-friend?data=", "");
      try {
        email = atob(base64Data).trim().toLowerCase();
      } catch (e) {
        toast.error("Invalid QR Code payload");
        return;
      }
    } else {
      // Check if it's a raw email address
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(text.trim())) {
        email = text.trim().toLowerCase();
      } else {
        toast.error("Invalid QR Code. Could not find user email.");
        return;
      }
    }

    if (email === ChatClient.userEmail?.trim().toLowerCase()) {
      toast.error("You cannot add yourself.");
      return;
    }

    toast.success(`User detected: ${email}`);
    ChatClient.connectToPeer(email)
      .then(() => {
        toast.success("Request sent successfully!");
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to send request.");
      });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, img.width, img.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
          handleDecodedQR(code.data);
        } else {
          toast.error("No QR Code detected in the uploaded image.");
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const copyQrLink = () => {
    const email = ChatClient.userEmail;
    if (email) {
      const payload = `cryptnode://add-friend?data=${btoa(email.trim().toLowerCase())}`;
      navigator.clipboard.writeText(payload);
      setHasCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setHasCopied(false), 2000);
    }
  };

  // NFC logic
  const startNfcWrite = async () => {
    if (!('NDEFReader' in window)) {
      simulateNfcWrite();
      return;
    }

    setNfcState("writing");
    setNfcLog("Hold your phone near an NFC tag to write your profile...");
    try {
      const ndef = new (window as any).NDEFReader();
      const myEmail = ChatClient.userEmail || "";
      const payload = `cryptnode://add-friend?data=${btoa(myEmail.trim().toLowerCase())}`;
      
      await ndef.write({
        records: [{ recordType: "url", data: payload }]
      });
      setNfcState("success");
      setNfcLog("Profile successfully written to NFC tag!");
      toast.success("NFC tag written successfully!");
    } catch (err) {
      console.error("NFC write failed", err);
      setNfcState("error");
      setNfcLog(`NFC Write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const startNfcRead = async () => {
    if (!('NDEFReader' in window)) {
      simulateNfcRead();
      return;
    }

    setNfcState("reading");
    setNfcLog("Ready to scan. Bring target device or tag close...");
    try {
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      ndef.onreading = (event: any) => {
        const record = event.message.records[0];
        if (record && record.recordType === "url") {
          const textDecoder = new TextDecoder();
          const url = textDecoder.decode(record.data);
          setNfcState("success");
          setNfcLog(`NFC record read successfully!`);
          handleDecodedQR(url);
        } else {
          setNfcState("error");
          setNfcLog("Unsupported NFC record type. Must be a URL tag.");
        }
      };
    } catch (err) {
      console.error("NFC read failed", err);
      setNfcState("error");
      setNfcLog(`NFC Read failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const simulateNfcWrite = () => {
    setNfcState("writing");
    setNfcLog("(Simulation) Writing profile to virtual tag...");
    setTimeout(() => {
      setNfcState("success");
      setNfcLog("(Simulation) Profile successfully written to virtual NFC tag!");
      toast.success("Profile written to virtual NFC tag.");
    }, 1500);
  };

  const simulateNfcRead = () => {
    setNfcState("reading");
    setNfcLog("(Simulation) Scanning for virtual NFC tags...");
    toast.success("NFC scanner started. Use the simulator panel to simulate a tag tap.");
  };

  const handleSimulatedNfcTap = () => {
    if (!simulatedNfcEmail.trim()) {
      toast.error("Please enter a username or email to simulate.");
      return;
    }
    const email = simulatedNfcEmail.includes("@") ? simulatedNfcEmail.trim().toLowerCase() : `${simulatedNfcEmail.trim().toLowerCase()}@gmail.com`;
    setNfcState("success");
    setNfcLog(`Simulated NFC Tap read: ${email}`);
    toast.success(`NFC tap simulated: ${email}`);
    ChatClient.connectToPeer(email)
      .then(() => {
        toast.success("Friend request sent!");
        setSimulatedNfcEmail("");
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to send request.");
      });
  };

  // Bluetooth logic
  const startBtScan = () => {
    setBtScanning(true);
    setBtDevices([]);
    setTimeout(() => {
      const mockDevices: BtDevice[] = [
        { id: "bt-1", name: "Alice's iPad", email: "alice@gmail.com", x: 30, y: 40, status: "idle" },
        { id: "bt-2", name: "Charlie's Macbook", email: "charlie@gmail.com", x: 70, y: 65, status: "idle" },
      ];
      setBtDevices(mockDevices);
      setBtScanning(false);
      toast.success("Bluetooth scan complete. Devices found nearby!");
    }, 3000);
  };

  const addSimulatedBtDevice = () => {
    if (!newDeviceName.trim()) {
      toast.error("Please enter a device name.");
      return;
    }
    const email = newDeviceEmail.trim() 
      ? (newDeviceEmail.includes("@") ? newDeviceEmail.trim().toLowerCase() : `${newDeviceEmail.trim().toLowerCase()}@gmail.com`)
      : `${newDeviceName.trim().toLowerCase().replace(/\s+/g, "")}@gmail.com`;

    const newDevice: BtDevice = {
      id: `bt-${Date.now()}`,
      name: newDeviceName.trim(),
      email: email,
      x: 15 + Math.random() * 70,
      y: 15 + Math.random() * 70,
      status: "idle"
    };

    setBtDevices(prev => [...prev, newDevice]);
    setNewDeviceName("");
    setNewDeviceEmail("");
    toast.success(`Simulated device "${newDeviceName.trim()}" placed nearby.`);
  };

  const connectBtDevice = async (device: BtDevice) => {
    if (device.email === ChatClient.userEmail?.trim().toLowerCase()) {
      toast.error("You cannot add yourself.");
      return;
    }
    
    setBtDevices(prev => prev.map(d => d.id === device.id ? { ...d, status: "sending" } : d));
    try {
      await ChatClient.connectToPeer(device.email);
      setBtDevices(prev => prev.map(d => d.id === device.id ? { ...d, status: "sent" } : d));
      toast.success(`Bluetooth connection successful! Request sent to ${device.email}`);
    } catch (err) {
      console.error(err);
      setBtDevices(prev => prev.map(d => d.id === device.id ? { ...d, status: "failed" } : d));
      toast.error(`Bluetooth connection failed to ${device.name}`);
    }
  };

  return (
    <Page>
      <PageInner>
        <HeroGrid>
          <FormPanel style={{ width: "min(760px, 100%)" }}>
            <PanelHeader>
              <PanelTitle>Establish Connection</PanelTitle>
              <PanelText>
                Choose a method to connect securely with your friend and start chatting.
              </PanelText>
            </PanelHeader>

            <TabContainer>
              <TabButton
                $active={activeTab === "manual"}
                onClick={() => { setActiveTab("manual"); }}
              >
                <Search size={16} />
                <span>Manual</span>
              </TabButton>
              <TabButton
                $active={activeTab === "qr"}
                onClick={() => { setActiveTab("qr"); }}
              >
                <QrCode size={16} />
                <span>QR Code</span>
              </TabButton>
              <TabButton
                $active={activeTab === "nfc"}
                onClick={() => { setActiveTab("nfc"); }}
              >
                <Smartphone size={16} />
                <span>NFC</span>
              </TabButton>
              <TabButton
                $active={activeTab === "bluetooth"}
                onClick={() => { setActiveTab("bluetooth"); }}
              >
                <Wifi size={16} />
                <span>Bluetooth</span>
              </TabButton>
            </TabContainer>

            {activeTab === "manual" && (
              <TabContent>
                <PanelText style={{ fontSize: typography.fontSize.sm }}>
                  Enter your friend&apos;s username to send a secure request and open a new session.
                </PanelText>
                <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
                  <InputShell>
                    <UsernameInput
                      type="text"
                      value={targetEmail}
                      onChange={(e) =>
                        setTargetEmail(e.target.value.replace(/@.*$/, "").trim())
                      }
                      placeholder="username"
                      onKeyDown={(e) => e.key === "Enter" && onConnect()}
                    />
                    <DomainSuffix>@gmail.com</DomainSuffix>
                  </InputShell>

                  <Button
                    onClick={onConnect}
                    disabled={isJoining || !targetEmail.trim()}
                    variant="primary"
                    size="lg"
                    fullWidth
                  >
                    {isJoining ? "Sending Request..." : "Connect Securely"}
                  </Button>
                </div>
              </TabContent>
            )}

            {activeTab === "qr" && (
              <TabContent>
                <SubTabContainer>
                  <SubTabButton
                    $active={qrSubTab === "my-code"}
                    onClick={() => { setQrSubTab("my-code"); }}
                  >
                    My QR Code
                  </SubTabButton>
                  <SubTabButton
                    $active={qrSubTab === "scan-code"}
                    onClick={() => { setQrSubTab("scan-code"); }}
                  >
                    Scan QR Code
                  </SubTabButton>
                </SubTabContainer>

                {qrSubTab === "my-code" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: spacing[4], alignItems: "center" }}>
                    <PanelText style={{ textAlign: "center", fontSize: typography.fontSize.sm }}>
                      Let your friend scan your code or copy your invitation link to add you.
                    </PanelText>
                    
                    <QRCodeWrapper>
                      <QRCodeContainer>
                        {myQrUrl ? (
                          <QRCodeImage src={myQrUrl} alt="My QR Code" />
                        ) : (
                          <div style={{ color: colors.text.tertiary, fontSize: typography.fontSize.sm }}>
                            Generating QR Code...
                          </div>
                        )}
                      </QRCodeContainer>
                      
                      <div style={{ color: colors.text.primary, fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.base }}>
                        {ChatClient.userEmail}
                      </div>
                    </QRCodeWrapper>

                    <CopyButtonContainer>
                      <Button onClick={copyQrLink} variant="secondary" fullWidth>
                        {hasCopied ? <Check size={16} /> : <Copy size={16} />}
                        <span style={{ marginLeft: 8 }}>{hasCopied ? "Copied" : "Copy Invitation Link"}</span>
                      </Button>
                    </CopyButtonContainer>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
                    <PanelText style={{ textAlign: "center", fontSize: typography.fontSize.sm }}>
                      Scan your friend's QR code using your camera or upload an image.
                    </PanelText>

                    {qrScanning ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
                        <ScannerContainer>
                          <video
                            ref={videoRef}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                          <canvas ref={canvasRef} style={{ display: "none" }} />
                          <ScannerLaser />
                          <ScannerOverlay />
                        </ScannerContainer>
                        <Button onClick={stopQrScan} variant="danger">
                          Stop Camera
                        </Button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: spacing[3], alignItems: "center" }}>
                        <Button onClick={startQrScan} variant="primary" fullWidth>
                          <Camera size={18} style={{ marginRight: 8 }} />
                          Start Camera Scanner
                        </Button>

                        {qrError && (
                          <div style={{ color: "#fca5a5", fontSize: typography.fontSize.sm, textAlign: "center" }}>
                            {qrError}
                          </div>
                        )}

                        <div style={{ display: "flex", width: "100%", alignItems: "center", gap: spacing[3] }}>
                          <hr style={{ flex: 1, border: "0.5px solid rgba(255,255,255,0.1)" }} />
                          <span style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>OR</span>
                          <hr style={{ flex: 1, border: "0.5px solid rgba(255,255,255,0.1)" }} />
                        </div>

                        <div style={{ position: "relative", width: "100%" }}>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            id="qr-file-upload"
                            style={{ display: "none" }}
                          />
                          <label htmlFor="qr-file-upload" style={{ width: "100%", display: "block" }}>
                            <Button as="span" variant="secondary" fullWidth style={{ cursor: "pointer" }}>
                              <Upload size={18} style={{ marginRight: 8 }} />
                              Upload QR Image File
                            </Button>
                          </label>
                        </div>
                      </div>
                    )}

                    <SimulatorPanel>
                      <SimulationHeader>QR Code Scanner Simulator</SimulationHeader>
                      <PanelText style={{ fontSize: typography.fontSize.xs, marginBottom: spacing[2] }}>
                        No camera? Type a username below to simulate scanning their QR code.
                      </PanelText>
                      <div style={{ display: "flex", gap: spacing[2] }}>
                        <InputShell style={{ minHeight: "48px", flex: 1 }}>
                          <UsernameInput
                            style={{ minHeight: "48px", padding: `0 ${spacing[3]}`, fontSize: typography.fontSize.base }}
                            placeholder="username"
                            value={simulatedNfcEmail}
                            onChange={(e) => setSimulatedNfcEmail(e.target.value)}
                          />
                          <DomainSuffix style={{ minHeight: "48px", padding: `0 ${spacing[3]}`, fontSize: typography.fontSize.sm }}>
                            @gmail.com
                          </DomainSuffix>
                        </InputShell>
                        <Button
                          style={{ height: "48px" }}
                          variant="secondary"
                          onClick={() => {
                            if (!simulatedNfcEmail.trim()) {
                              toast.error("Please enter a username.");
                              return;
                            }
                            const email = `${simulatedNfcEmail.trim().toLowerCase()}@gmail.com`;
                            const payload = `cryptnode://add-friend?data=${btoa(email)}`;
                            handleDecodedQR(payload);
                            setSimulatedNfcEmail("");
                          }}
                        >
                          Simulate Scan
                        </Button>
                      </div>
                    </SimulatorPanel>
                  </div>
                )}
              </TabContent>
            )}

            {activeTab === "nfc" && (
              <TabContent>
                <div style={{ display: "flex", flexDirection: "column", gap: spacing[4], alignItems: "center", width: "100%" }}>
                  <PanelText style={{ textAlign: "center", fontSize: typography.fontSize.sm }}>
                    Use NFC to instantly share your profile. Hold devices back-to-back.
                  </PanelText>

                  <NFCContainer>
                    <NFCAnimationWrapper>
                      <NFCRadarPulse $active={nfcState === "reading" || nfcState === "writing"} />
                      <NFCRadarPulse $active={nfcState === "reading" || nfcState === "writing"} style={{ animationDelay: "1s" }} />
                      <NFCIconContainer>
                        <Smartphone size={40} />
                      </NFCIconContainer>
                    </NFCAnimationWrapper>

                    <div style={{ color: colors.text.primary, fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.sm, marginTop: spacing[2] }}>
                      Status: {
                        nfcState === "idle" ? "Ready" :
                        nfcState === "reading" ? "Scanning for nearby devices..." :
                        nfcState === "writing" ? "Writing profile to tag..." :
                        nfcState === "success" ? "Success!" : "Error"
                      }
                    </div>

                    <div style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary, maxWidth: "35ch", minHeight: "40px", marginTop: spacing[1] }}>
                      {nfcLog || "Select an action below to start."}
                    </div>
                  </NFCContainer>

                  <div style={{ display: "flex", gap: spacing[3], width: "100%", maxWidth: "360px" }}>
                    <Button onClick={startNfcRead} variant="primary" style={{ flex: 1 }} disabled={nfcState === "reading" || nfcState === "writing"}>
                      Read NFC
                    </Button>
                    <Button onClick={startNfcWrite} variant="secondary" style={{ flex: 1 }} disabled={nfcState === "reading" || nfcState === "writing"}>
                      Write NFC Tag
                    </Button>
                  </div>

                  <SimulatorPanel>
                    <SimulationHeader>NFC Tap Simulator</SimulationHeader>
                    <PanelText style={{ fontSize: typography.fontSize.xs, marginBottom: spacing[2] }}>
                      Simulate physical phone contact. Type a username to simulate their phone tapping yours.
                    </PanelText>
                    <div style={{ display: "flex", gap: spacing[2] }}>
                      <InputShell style={{ minHeight: "48px", flex: 1 }}>
                        <UsernameInput
                          style={{ minHeight: "48px", padding: `0 ${spacing[3]}`, fontSize: typography.fontSize.base }}
                          placeholder="username"
                          value={simulatedNfcEmail}
                          onChange={(e) => setSimulatedNfcEmail(e.target.value)}
                        />
                        <DomainSuffix style={{ minHeight: "48px", padding: `0 ${spacing[3]}`, fontSize: typography.fontSize.sm }}>
                          @gmail.com
                        </DomainSuffix>
                      </InputShell>
                      <Button
                        style={{ height: "48px" }}
                        variant="secondary"
                        onClick={handleSimulatedNfcTap}
                      >
                        Simulate Tap
                      </Button>
                    </div>
                  </SimulatorPanel>
                </div>
              </TabContent>
            )}

            {activeTab === "bluetooth" && (
              <TabContent>
                <div style={{ display: "flex", flexDirection: "column", gap: spacing[4], alignItems: "center", width: "100%" }}>
                  <PanelText style={{ textAlign: "center", fontSize: typography.fontSize.sm }}>
                    Scan for nearby CryptNode devices broadcasting over Bluetooth.
                  </PanelText>

                  <div style={{ position: "relative" }}>
                    <RadarContainer>
                      <RadarSweep $scanning={btScanning} />
                      <RadarCircle $size={60} />
                      <RadarCircle $size={130} />
                      <RadarCircle $size={200} />
                      <RadarCrosslineH />
                      <RadarCrosslineV />
                      
                      {btDevices.map(device => (
                        <RadarNode
                          key={device.id}
                          $x={device.x}
                          $y={device.y}
                          $active={device.status === "sending"}
                          onClick={() => connectBtDevice(device)}
                          title={`Connect with ${device.name}`}
                        />
                      ))}
                    </RadarContainer>

                    {btScanning && (
                      <div style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        color: colors.primary.main,
                        fontWeight: typography.fontWeight.bold,
                        textShadow: "0 0 8px rgba(0,0,0,0.8)",
                        pointerEvents: "none"
                      }}>
                        SCANNING...
                      </div>
                    )}
                  </div>

                  <div style={{ width: "100%", maxWidth: "400px", display: "flex", flexDirection: "column", gap: spacing[3] }}>
                    <Button onClick={startBtScan} variant="primary" fullWidth disabled={btScanning}>
                      {btScanning ? "Scanning nearby..." : "Scan for Devices"}
                    </Button>

                    {btDevices.length > 0 && (
                      <GlassCard style={{ padding: spacing[3] }}>
                        <div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary, fontWeight: typography.fontWeight.semibold, textTransform: "uppercase" }}>
                          Discovered Devices ({btDevices.length})
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: spacing[2], marginTop: spacing[2] }}>
                          {btDevices.map(device => (
                            <div key={device.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.01)", borderRadius: radii.md, border: `1px solid ${colors.border.subtle}` }}>
                              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                                <span style={{ fontSize: typography.fontSize.sm, color: colors.text.primary, fontWeight: typography.fontWeight.semibold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{device.name}</span>
                                <span style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{device.email}</span>
                              </div>
                              <Button
                                size="sm"
                                variant={device.status === "sent" ? "success" : "secondary"}
                                disabled={device.status === "sending" || device.status === "sent"}
                                onClick={() => connectBtDevice(device)}
                                style={{ flexShrink: 0, marginLeft: spacing[2] }}
                              >
                                {device.status === "idle" && "Connect"}
                                {device.status === "sending" && "Connecting..."}
                                {device.status === "sent" && "Sent"}
                                {device.status === "failed" && "Retry"}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </GlassCard>
                    )}
                  </div>

                  <SimulatorPanel>
                    <SimulationHeader>Bluetooth Device Simulator</SimulationHeader>
                    <PanelText style={{ fontSize: typography.fontSize.xs, marginBottom: spacing[2] }}>
                      Simulate a friend turning on their Bluetooth nearby. Enter their device name and username.
                    </PanelText>
                    <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
                      <div style={{ display: "flex", gap: spacing[2] }}>
                        <InputField
                          style={{ height: "40px", flex: 1, padding: `0 ${spacing[3]}`, fontSize: typography.fontSize.sm }}
                          placeholder="Device Name (e.g. Bob's Pixel)"
                          value={newDeviceName}
                          onChange={(e) => setNewDeviceName(e.target.value)}
                        />
                        <InputShell style={{ minHeight: "40px", height: "40px", flex: 1 }}>
                          <UsernameInput
                            style={{ minHeight: "40px", padding: `0 ${spacing[3]}`, fontSize: typography.fontSize.sm }}
                            placeholder="username"
                            value={newDeviceEmail}
                            onChange={(e) => setNewDeviceEmail(e.target.value)}
                          />
                          <DomainSuffix style={{ minHeight: "40px", padding: `0 ${spacing[3]}`, fontSize: typography.fontSize.xs }}>
                            @gmail.com
                          </DomainSuffix>
                        </InputShell>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={addSimulatedBtDevice}
                      >
                        Place Device Nearby
                      </Button>
                    </div>
                  </SimulatorPanel>
                </div>
              </TabContent>
            )}
          </FormPanel>
        </HeroGrid>

        <RequestsPanel>
          <RequestsHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
              <PanelTitle style={{ fontSize: typography.fontSize.xl }}>
                Pending Requests
              </PanelTitle>
              <PanelText style={{ fontSize: typography.fontSize.sm }}>
                Review incoming requests before anyone gets access to your session list.
              </PanelText>
            </div>
            <RequestsCount>
              {pending.length} pending
            </RequestsCount>
          </RequestsHeader>

          {pending.length === 0 ? (
            <EmptyState>
              <Inbox size={28} color={colors.primary.main} />
              <div style={{ color: colors.text.primary, fontWeight: typography.fontWeight.semibold }}>
                No pending requests right now
              </div>
              <div style={{ maxWidth: "46ch", lineHeight: 1.6 }}>
                When someone sends you a connection request, it will show up here.
              </div>
            </EmptyState>
          ) : (
            <RequestsList>
              {pending.map((req, i) => (
                <RequestCard key={`${req.senderHash || req.email || "request"}-${i}`}>
                  <RequestIdentity>
                    <Avatar>
                      {req.avatar ? (
                        <AvatarImage
                          src={
                            req.avatar.startsWith("data:")
                              ? req.avatar
                              : `data:image/jpeg;base64,${req.avatar}`
                          }
                          alt={req.name || "Pending request avatar"}
                        />
                      ) : (
                        (req.name?.[0] || req.email?.[0] || "?").toUpperCase()
                      )}
                    </Avatar>

                    <RequestText>
                      <RequestName>{req.name || "Unknown sender"}</RequestName>
                      <RequestEmail>{req.email || "No email available"}</RequestEmail>
                    </RequestText>
                  </RequestIdentity>

                  <RequestActions>
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => {
                        ChatClient.acceptFriend(
                          req.email,
                          req.publicKeys?.length ? req.publicKeys : req.publicKey,
                          req.senderHash,
                        );
                        removePending(req);
                      }}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        ChatClient.denyFriend(req.email);
                        removePending(req);
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        ChatClient.blockUser(req.email);
                        removePending(req);
                      }}
                    >
                      Block
                    </Button>
                  </RequestActions>
                </RequestCard>
              ))}
            </RequestsList>
          )}
        </RequestsPanel>

        <RequestsPanel>
          <RequestsHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
              <PanelTitle style={{ fontSize: typography.fontSize.xl }}>
                Request History
              </PanelTitle>
              <PanelText style={{ fontSize: typography.fontSize.sm }}>
                Track the connection requests you&apos;ve sent and how each user responded.
              </PanelText>
            </div>
            <RequestsCount>
              {history.length} logged
            </RequestsCount>
          </RequestsHeader>

          {history.length === 0 ? (
            <EmptyState>
              <Inbox size={28} color={colors.primary.main} />
              <div style={{ color: colors.text.primary, fontWeight: typography.fontWeight.semibold }}>
                No request history yet
              </div>
              <div style={{ maxWidth: "46ch", lineHeight: 1.6 }}>
                Every connection request you send will appear here with its latest status and timestamp.
              </div>
            </EmptyState>
          ) : (
            <HistoryTableShell>
              <HistoryTableScroll>
                <HistoryTable>
                  <thead>
                    <tr>
                      <HistoryHeadCell>User</HistoryHeadCell>
                      <HistoryHeadCell>Status</HistoryHeadCell>
                      <HistoryHeadCell>Sent</HistoryHeadCell>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <HistoryBodyRow key={entry.id}>
                        <HistoryCell>
                          <HistoryUser>{formatHistoryName(entry.email)}</HistoryUser>
                        </HistoryCell>
                        <HistoryCell>
                          <StatusBadge $status={entry.status}>
                            {formatHistoryStatus(entry.status)}
                          </StatusBadge>
                        </HistoryCell>
                        <HistoryCell>
                          <HistoryTime>{formatHistoryTimestamp(entry.sentAt)}</HistoryTime>
                        </HistoryCell>
                      </HistoryBodyRow>
                    ))}
                  </tbody>
                </HistoryTable>
              </HistoryTableScroll>
            </HistoryTableShell>
          )}
        </RequestsPanel>
      </PageInner>
    </Page>
  );
};
