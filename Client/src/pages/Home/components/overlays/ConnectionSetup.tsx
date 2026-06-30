import React from "react";
import styled from "@emotion/styled";
import {
  Inbox,
  QrCode,
  Camera,
  Upload,
  Copy,
  Check,
  Search,
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
  const [activeTab, setActiveTab] = React.useState<"manual" | "qr">("manual");
  
  // QR scanner state
  const [qrSubTab, setQrSubTab] = React.useState<"my-code" | "scan-code">("my-code");
  const [myQrUrl, setMyQrUrl] = React.useState<string>("");
  const [hasCopied, setHasCopied] = React.useState(false);
  const [qrScanning, setQrScanning] = React.useState(false);
  const [qrError, setQrError] = React.useState<string | null>(null);
  
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  
  // Detect hardware capabilities
  const hasCamera = React.useMemo(() => typeof navigator !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia), []);

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

  const copyQrCode = () => {
    if (!myQrUrl) {
      toast.error("QR Code not generated yet");
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const qrWidth = img.width || 256;
      const qrHeight = img.height || 256;
      const textPadding = 48;
      
      canvas.width = qrWidth;
      canvas.height = qrHeight + textPadding;

      // Draw white background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw the QR Code image
      ctx.drawImage(img, 0, 0, qrWidth, qrHeight);

      // Draw the email text beautifully
      ctx.fillStyle = "#1e293b"; // Slate 800 for high contrast
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      const email = ChatClient.userEmail || "";
      ctx.fillText(email, canvas.width / 2, qrHeight + (textPadding / 2) - 2);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error("Failed to generate QR Code image");
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob
            })
          ]);
          setHasCopied(true);
          toast.success("QR Code image copied to clipboard!");
          setTimeout(() => setHasCopied(false), 2000);
        } catch (err) {
          console.error("Clipboard write failed", err);
          toast.error("Failed to copy image. Clipboard permission might be required.");
        }
      }, "image/png");
    };
    img.onerror = () => {
      toast.error("Failed to load QR Code image");
    };
    img.src = myQrUrl;
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
              {hasCamera && (
                <TabButton
                  $active={activeTab === "qr"}
                  onClick={() => { setActiveTab("qr"); }}
                >
                  <QrCode size={16} />
                  <span>QR Code</span>
                </TabButton>
              )}
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
                      <Button onClick={copyQrCode} variant="secondary" fullWidth>
                        {hasCopied ? <Check size={16} /> : <Copy size={16} />}
                        <span style={{ marginLeft: 8 }}>{hasCopied ? "Copied" : "Copy QR Code"}</span>
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


                  </div>
                )}
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
