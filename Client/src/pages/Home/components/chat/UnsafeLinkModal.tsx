import React from "react";
import styled from "styled-components";
import { AlertTriangle } from "lucide-react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import DialogContentText from "@mui/material/DialogContentText";

const Title = styled.h2`
  color: #dc2626;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
`;

const Message = styled.p`
  color: #d1d5db;
  margin-bottom: 24px;
  line-height: 1.5;
`;

const UrlPreview = styled.div`
  background: rgba(0, 0, 0, 0.3);
  padding: 8px;
  border-radius: 4px;
  color: #9ca3af;
  font-family: monospace;
  margin-bottom: 20px;
  word-break: break-all;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
`;

const Button = styled.button<{ variant?: "danger" | "secondary" }>`
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 600;
  background: ${(props) =>
    props.variant === "danger" ? "#dc2626" : "#374151"};
  color: white;

  &:hover {
    opacity: 0.9;
  }
`;

interface UnsafeLinkModalProps {
  url: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const UnsafeLinkModal: React.FC<UnsafeLinkModalProps> = ({
  url,
  onConfirm,
  onCancel,
}) => {
  return (
    <Dialog
      open={true}
      onClose={onCancel}
      PaperProps={{
        style: {
          backgroundColor: "#1f1f1f",
          border: "1px solid #dc2626",
          borderRadius: "12px",
          textAlign: "center",
          color: "#d1d5db",
        },
      }}
    >
      <DialogTitle>
        <AlertTriangle size={24} color="#eab308" />
        External Link
      </DialogTitle>
      <DialogContent>
        <DialogContentText style={{ color: "#d1d5db", marginBottom: "16px" }}>
          This link leads to an untrusted domain. Are you sure you want to
          visit?
        </DialogContentText>
        <UrlPreview>{url}</UrlPreview>
      </DialogContent>
      <DialogActions
        style={{ justifyContent: "center", paddingBottom: "24px" }}
      >
        <ButtonGroup>
          <Button variant="secondary" onClick={onCancel}>
            Go Back
          </Button>
          <Button variant="secondary" onClick={onConfirm}>
            Visit Once
          </Button>
        </ButtonGroup>
      </DialogActions>
    </Dialog>
  );
};
