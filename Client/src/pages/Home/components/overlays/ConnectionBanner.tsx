import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { WifiOff, Wifi } from "lucide-react";
import ChatClient from "../../../../services/core/ChatClient";
import socket from "../../../../services/core/SocketManager";

const BannerContainer = styled.div<{ isVisible: boolean; status: "offline" | "connected" }>`
  height: ${(props) => (props.isVisible ? "28px" : "0px")};
  overflow: hidden;
  background-color: ${(props) =>
    props.status === "offline" ? "#fbbf24" : "#34d399"};
  color: ${(props) => (props.status === "offline" ? "#78350f" : "#064e3b")};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.3s ease;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 50;
`;

const Content = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

export const ConnectionBanner = () => {
  const [status, setStatus] = useState<"offline" | "connected" | "hidden">("hidden");

  useEffect(() => {
    // If we're not logged in yet, don't show the banner.
    if (!ChatClient.hasToken()) return;

    let timeout: NodeJS.Timeout;

    const onConnected = () => {
      setStatus("connected");
      // Hide the green banner after 2 seconds
      timeout = setTimeout(() => {
        setStatus("hidden");
      }, 2000);
    };

    const onDisconnected = () => {
      if (timeout) clearTimeout(timeout);
      setStatus("offline");
    };

    // Initial check
    if (socket.isConnected()) {
      setStatus("hidden"); // already connected, don't flash green
    } else {
      setStatus("offline");
    }

    ChatClient.on("session_updated", () => {
        // Just a hook into chat client readiness if needed
    });

    socket.on("WS_CONNECTED", onConnected);
    socket.on("WS_DISCONNECTED", onDisconnected);
    socket.on("error", onDisconnected);

    return () => {
      if (timeout) clearTimeout(timeout);
      socket.off("WS_CONNECTED", onConnected);
      socket.off("WS_DISCONNECTED", onDisconnected);
      socket.off("error", onDisconnected);
    };
  }, []);

  return (
    <BannerContainer isVisible={status !== "hidden"} status={status === "hidden" ? "connected" : status}>
      <Content>
        {status === "offline" ? (
          <>
            <WifiOff size={14} />
            Waiting for network... Messages will sync when online.
          </>
        ) : (
          <>
            <Wifi size={14} />
            Connected
          </>
        )}
      </Content>
    </BannerContainer>
  );
};
