import { colors } from "../../../../theme/colors";
import ChatClient from "../../../../services/core/ChatClient";
import {
  ModalOverlay,
  GlassModal,
  ModalButtons,
  PrimaryButton,
  CancelButton,
} from "./Overlay.styles";

export const RequestModal = ({
  inboundReq,
  isWaiting,
  setInboundReq,
  setIsWaiting,
}: any) => (
  <ModalOverlay>
    <GlassModal>
      {isWaiting ? (
        <>
          <div className="spinner" style={{ margin: "0 auto 15px" }}></div>
          <h3 style={{ color: colors.text.primary, marginTop: 0 }}>
            Waiting for Peer...
          </h3>
          <p style={{ color: colors.text.secondary }}>
            Establishing secure handshake.
          </p>
          <CancelButton onClick={() => setIsWaiting(false)}>
            Cancel
          </CancelButton>
        </>
      ) : (
        <>
          <h3 style={{ color: colors.text.primary, marginTop: 0 }}>
            Peer Request
          </h3>
          <p style={{ color: colors.text.primary }}>
            Request from{" "}
            <span style={{ color: colors.primary, fontWeight: 600 }}>
              {(inboundReq as any).email || "Unknown"}
            </span>
          </p>
          <p style={{ fontSize: "0.8em", color: colors.text.muted }}>
            Session ID: {inboundReq?.sid.slice(0, 8)}
          </p>
          <ModalButtons>
            <PrimaryButton
              onClick={async () => {
                await ChatClient.acceptFriend(
                  inboundReq!.sid,
                  inboundReq!.publicKey,
                );
                setInboundReq(null);
              }}
            >
              Accept
            </PrimaryButton>
            <CancelButton
              onClick={() => {
                ChatClient.denyFriend(inboundReq!.sid);
                setInboundReq(null);
              }}
            >
              Decline
            </CancelButton>
          </ModalButtons>
        </>
      )}
    </GlassModal>
  </ModalOverlay>
);
