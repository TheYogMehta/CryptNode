import { colors } from "../../../../theme/design-system";
import ChatClient from "../../../../services/core/ChatClient";
import {
  ModalOverlay,
  DialogPanel,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogBadge,
} from "./Overlay.styles";
import { Button } from "../../../../components/ui/Button";

export const RequestModal = ({
  inboundReq,
  isWaiting,
  setInboundReq,
  setIsWaiting,
}: any) => (
  <ModalOverlay>
    <DialogPanel>
      {isWaiting ? (
        <>
          <DialogHeader>
            <DialogBadge>Connecting</DialogBadge>
            <DialogTitle>Waiting for Peer...</DialogTitle>
            <DialogDescription>
              Establishing a secure handshake between both devices.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="spinner" style={{ margin: "0 auto" }}></div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" fullWidth onClick={() => setIsWaiting(false)}>
            Cancel
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <DialogHeader>
            <DialogBadge>Secure Request</DialogBadge>
            <DialogTitle>Peer Request</DialogTitle>
            <DialogDescription>
              Request from{" "}
              <span style={{ color: colors.primary.main, fontWeight: 700 }}>
                {(inboundReq as any).email || "Unknown"}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p style={{ fontSize: "0.88rem", color: colors.text.secondary, margin: 0 }}>
              Session ID: {inboundReq?.sid.slice(0, 8)}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="primary"
              fullWidth
              onClick={async () => {
                await ChatClient.acceptFriend(
                  inboundReq!.email,
                  inboundReq!.publicKeys?.length ? inboundReq!.publicKeys : inboundReq!.publicKey,
                  "",
                );
                setInboundReq(null);
              }}
            >
              Accept
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                ChatClient.denyFriend(inboundReq!.email);
                setInboundReq(null);
              }}
            >
              Decline
            </Button>
          </DialogFooter>
        </>
      )}
    </DialogPanel>
  </ModalOverlay>
);
