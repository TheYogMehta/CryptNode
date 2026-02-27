import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { Smartphone, Check, X } from "lucide-react";
import ChatClient from "../../../../services/core/ChatClient";
import toast from "react-hot-toast";

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  padding: 20px;
`;

const Modal = styled.div`
  background: #1e1e2e;
  border: 1px solid #3b3b4f;
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  padding: 32px;
  color: white;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
`;

const Title = styled.h2`
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.4rem;
  color: #fff;
`;

const InfoCard = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
  font-family: monospace;
  font-size: 0.9rem;
  color: #a0a0b0;
  line-height: 1.6;
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 12px;
`;

const ActionButton = styled.button<{ $variant?: "danger" | "success" }>`
  flex: 1;
  background: ${(props) =>
    props.$variant === "danger"
      ? "rgba(239, 68, 68, 0.1)"
      : props.$variant === "success"
      ? "#34d399"
      : "rgba(255,255,255,0.05)"};
  color: ${(props) =>
    props.$variant === "success"
      ? "#000"
      : props.$variant === "danger"
      ? "#ef4444"
      : "#fff"};
  border: ${(props) =>
    props.$variant === "danger"
      ? "1px solid rgba(239, 68, 68, 0.3)"
      : props.$variant === "success"
      ? "none"
      : "1px solid rgba(255,255,255,0.1)"};
  padding: 14px;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    opacity: 0.9;
  }
`;

interface DeviceSpec {
  os: string;
  name: string;
  timestamp: number;
}

interface Props {
  requests: any[];
  onHandled: (pubKey: string) => void;
}

export const DeviceApprovalModal: React.FC<Props> = ({
  requests,
  onHandled,
}) => {
  const [currentRequest, setCurrentRequest] = useState<any>(null);
  const [decryptedInfo, setDecryptedInfo] = useState<DeviceSpec | null>(null);

  useEffect(() => {
    if (requests.length > 0 && !currentRequest) {
      const load = async () => {
        const req = requests[0];
        setCurrentRequest(req);
        const info = await ChatClient.sessionService.decryptDeviceLinkRequest(
          req.encryptedSpecs,
          req.senderPubKey,
        );
        if (info) {
          setDecryptedInfo(info);
        } else {
          ChatClient.send({
            t: "DEVICE_LINK_REJECT",
            data: { targetPubKey: req.senderPubKey },
          });
          onHandled(req.senderPubKey);
          setCurrentRequest(null);
        }
      };
      load();
    }
  }, [requests, currentRequest, onHandled]);

  if (!currentRequest || !decryptedInfo) return null;

  const handleAccept = () => {
    ChatClient.send({
      t: "DEVICE_LINK_ACCEPT",
      data: { targetPubKey: currentRequest.senderPubKey },
    });
    toast.success("Device approved!");
    onHandled(currentRequest.senderPubKey);
    setCurrentRequest(null);
    setDecryptedInfo(null);
  };

  const handleReject = () => {
    ChatClient.send({
      t: "DEVICE_LINK_REJECT",
      data: { targetPubKey: currentRequest.senderPubKey },
    });
    onHandled(currentRequest.senderPubKey);
    setCurrentRequest(null);
    setDecryptedInfo(null);
  };

  return (
    <Overlay>
      <Modal>
        <Title>
          <Smartphone size={24} color="#34d399" /> New Device Request
        </Title>
        <p style={{ color: "#a0a0b0", marginBottom: 16 }}>
          A new device is trying to sign into your account. Do you recognize
          this device?
        </p>

        <InfoCard>
          <strong>App:</strong> {decryptedInfo.name}
          <br />
          <strong>OS:</strong> {decryptedInfo.os.substring(0, 60)}...
          <br />
          <strong>Time:</strong>{" "}
          {new Date(decryptedInfo.timestamp).toLocaleString()}
        </InfoCard>

        <ButtonContainer>
          <ActionButton $variant="success" onClick={handleAccept}>
            <Check size={20} /> Approve
          </ActionButton>
          <ActionButton $variant="danger" onClick={handleReject}>
            <X size={20} /> Deny
          </ActionButton>
        </ButtonContainer>
      </Modal>
    </Overlay>
  );
};
