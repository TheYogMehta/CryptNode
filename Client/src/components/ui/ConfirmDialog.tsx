import React from "react";
import { Button } from "./Button";
import {
  ModalOverlay,
  DialogPanel,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogBadge,
} from "../../pages/Home/components/overlays/Overlay.styles";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  isLoading?: boolean;
  badgeLabel?: string;
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  isLoading = false,
  badgeLabel,
  children,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <ModalOverlay onClick={onCancel}>
      <DialogPanel onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          {badgeLabel ? <DialogBadge tone={tone}>{badgeLabel}</DialogBadge> : null}
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children ? <DialogBody>{children}</DialogBody> : null}
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            size="md"
            fullWidth
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "danger" : "primary"}
            size="md"
            fullWidth
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Working..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogPanel>
    </ModalOverlay>
  );
};
