import React, { useState } from "react";
import styled from "styled-components";
import { Shield, AlertTriangle, RefreshCw, LogOut } from "lucide-react";
import ChatClient from "../../../../services/core/ChatClient";
import toast from "react-hot-toast";
import { LoadingSpinner } from "../../../Login.styles";

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
  max-width: 480px;
  padding: 32px;
  color: white;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
`;

const Title = styled.h2`
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.5rem;
  color: #fff;
`;

const Text = styled.p`
  color: #a0a0b0;
  line-height: 1.6;
  margin-bottom: 24px;
`;

const ButtonContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ActionButton = styled.button<{
  $variant?: "danger" | "primary" | "secondary";
}>`
  background: ${(props) =>
    props.$variant === "danger"
      ? "rgba(239, 68, 68, 0.1)"
      : props.$variant === "primary"
      ? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
      : "rgba(255,255,255,0.05)"};
  color: ${(props) => (props.$variant === "danger" ? "#ef4444" : "#fff")};
  border: ${(props) =>
    props.$variant === "danger"
      ? "1px solid rgba(239, 68, 68, 0.3)"
      : "1px solid rgba(255,255,255,0.1)"};
  padding: 16px;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    background: ${(props) =>
      props.$variant === "danger"
        ? "rgba(239, 68, 68, 0.2)"
        : props.$variant === "primary"
        ? "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)"
        : "rgba(255,255,255,0.1)"};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

interface Props {
  masterPubKey: string;
  onLogout: () => void;
}

export const DevicePendingModal: React.FC<Props> = ({
  masterPubKey,
  onLogout,
}) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleSync = async () => {
    setLoadingAction("sync");
    try {
      await ChatClient.sessionService.sendDeviceLinkRequest(masterPubKey);
      toast.success(
        "Link request sent! Please accept it on your Master Device.",
      );
    } catch (e) {
      toast.error("Failed to send link request.");
      setLoadingAction(null);
    }
  };

  const handleNuclear = () => {
    if (
      window.confirm(
        "WARNING: This will log out all other devices and make this the Master Device. Are you sure?",
      )
    ) {
      setLoadingAction("nuclear");
      ChatClient.send({ t: "DEVICE_NUCLEAR_RESET" });
    }
  };

  return (
    <Overlay>
      <Modal>
        <Title>
          <Shield size={28} color="#6366f1" /> Device Approval
        </Title>
        <Text>
          This account is protected by a Master Device. To sign in here, you
          must sync with your Master Device or perform a Nuclear Reset if you've
          lost access to it.
        </Text>

        <ButtonContainer>
          <ActionButton
            $variant="primary"
            onClick={handleSync}
            disabled={!!loadingAction}
          >
            {loadingAction === "sync" ? (
              <LoadingSpinner
                style={{ width: 20, height: 20, borderTopColor: "#fff" }}
              />
            ) : (
              <RefreshCw size={20} />
            )}
            {loadingAction === "sync"
              ? "Waiting for Approval..."
              : "Sync with Master Device"}
          </ActionButton>

          <ActionButton
            $variant="danger"
            onClick={handleNuclear}
            disabled={!!loadingAction}
          >
            <AlertTriangle size={20} />
            Start Fresh (Nuclear Reset)
          </ActionButton>

          <ActionButton
            $variant="secondary"
            onClick={onLogout}
            disabled={!!loadingAction}
          >
            <LogOut size={20} />
            Cancel & Logout
          </ActionButton>
        </ButtonContainer>
      </Modal>
    </Overlay>
  );
};
