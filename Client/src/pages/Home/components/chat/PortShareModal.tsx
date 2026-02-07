import React from "react";
import {
  ModalOverlay,
  GlassModal,
  ModalButtons,
  PrimaryButton,
  CancelButton,
  InputField
} from "../overlays/Overlay.styles";

interface PortShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (port: number) => void;
  port: string;
  setPort: (val: string) => void;
}

export const PortShareModal: React.FC<PortShareModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  port,
  setPort,
}) => {
  if (!isOpen) return null;

  return (
    <ModalOverlay>
      <GlassModal>
        <h3>Share Local Port</h3>
        <p>Forward a local web app (e.g., 3000) to this peer.</p>
        <InputField
          type="number"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder="e.g. 3000"
        />
        <ModalButtons>
          <PrimaryButton
            onClick={() => onConfirm(parseInt(port))}
          >
            Start Sharing
          </PrimaryButton>
          <CancelButton onClick={onClose}>
            Cancel
          </CancelButton>
        </ModalButtons>
      </GlassModal>
    </ModalOverlay>
  );
};
