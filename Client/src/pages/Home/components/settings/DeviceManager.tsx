import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { Smartphone, Trash2, Key, Monitor, RefreshCw } from "lucide-react";
import ChatClient from "../../../../services/core/ChatClient";
import toast from "react-hot-toast";
import { colors } from "../../../../theme/design-system";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const Title = styled.h3`
  margin: 0;
  color: ${colors.text.primary};
`;

const Description = styled.p`
  color: ${colors.text.secondary};
  font-size: 0.95rem;
  line-height: 1.5;
  margin: 0;
`;

const DeviceList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const DeviceItem = styled.div`
  background: ${colors.background.secondary};
  border: 1px solid ${colors.border.subtle};
  border-radius: 12px;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const DeviceInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const IconWrapper = styled.div<{ $isMaster?: boolean }>`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: ${(props) =>
    props.$isMaster ? "rgba(99, 102, 241, 0.1)" : "rgba(255, 255, 255, 0.05)"};
  color: ${(props) => (props.$isMaster ? "#6366f1" : colors.text.secondary)};
  display: flex;
  justify-content: center;
  align-items: center;
`;

const DeviceDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const DeviceName = styled.div`
  font-weight: 600;
  color: ${colors.text.primary};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Badge = styled.span<{ $type?: "master" | "pending" }>`
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 12px;
  background: ${(props) =>
    props.$type === "master"
      ? "rgba(99, 102, 241, 0.2)"
      : props.$type === "pending"
      ? "rgba(245, 158, 11, 0.2)"
      : "rgba(255,255,255,0.1)"};
  color: ${(props) =>
    props.$type === "master"
      ? "#818cf8"
      : props.$type === "pending"
      ? "#fbbf24"
      : "#a0a0b0"};
`;

const DeviceMeta = styled.div`
  font-size: 0.85rem;
  color: ${colors.text.tertiary};
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const RemoveButton = styled.button`
  background: transparent;
  border: none;
  color: #ef4444;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s;

  &:hover {
    background: rgba(239, 68, 68, 0.1);
  }
`;

export const DeviceManager: React.FC = () => {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [localPubKey, setLocalPubKey] = useState<string>("");

  const fetchDevices = async () => {
    setLoading(true);
    ChatClient.send({ t: "GET_DEVICES" });
    const pubKey = await ChatClient.getPublicKeyString();
    setLocalPubKey(pubKey);
  };

  useEffect(() => {
    fetchDevices();

    const onDeviceList = (data: any) => {
      if (data && data.devices) {
        setDevices(data.devices);
      }
      setLoading(false);
    };

    ChatClient.on("device_list", onDeviceList);
    return () => {
      ChatClient.off("device_list", onDeviceList);
    };
  }, []);

  const handleRevoke = (pubKey: string) => {
    if (
      window.confirm(
        "Are you sure you want to revoke access for this device? It will be logged out immediately.",
      )
    ) {
      ChatClient.send({
        t: "DEVICE_LINK_REJECT",
        data: { targetPubKey: pubKey },
      });
      toast.success("Device revoked.");
      // Optimistic updat
      setDevices((prev) => prev.filter((d) => d.publicKey !== pubKey));
    }
  };

  return (
    <Container>
      <Title>Linked Devices</Title>
      <Description>
        Manage the devices that have access to your account. Revoking a device
        will log it out and prevent it from decrypting new messages.
      </Description>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={fetchDevices}
          style={{
            background: "none",
            border: "none",
            color: colors.primary.main,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <RefreshCw size={16} className={loading ? "spinner" : ""} /> Refresh
          List
        </button>
      </div>

      <DeviceList>
        {devices.length === 0 && !loading && (
          <div
            style={{
              color: colors.text.tertiary,
              textAlign: "center",
              padding: 20,
            }}
          >
            No devices found.
          </div>
        )}

        {devices.map((device, idx) => {
          const isMe = device.publicKey === localPubKey;
          const isMaster = device.isMaster;
          const isPending = device.status === "pending";

          let title = "CryptNode Client";
          if (isMe) title += " (This Device)";

          return (
            <DeviceItem key={idx}>
              <DeviceInfo>
                <IconWrapper $isMaster={isMaster}>
                  {isMaster ? <Key size={24} /> : <Monitor size={24} />}
                </IconWrapper>
                <DeviceDetails>
                  <DeviceName>
                    {title}
                    {isMaster && <Badge $type="master">Master</Badge>}
                    {isPending && <Badge $type="pending">Pending</Badge>}
                    {!isMaster && !isPending && <Badge>Approved</Badge>}
                  </DeviceName>
                  <DeviceMeta>
                    <span>ID: {device.publicKey.substring(0, 16)}...</span>
                    <span>
                      Last Active:{" "}
                      {new Date(device.lastActive).toLocaleString()}
                    </span>
                  </DeviceMeta>
                </DeviceDetails>
              </DeviceInfo>

              {!isMe && !isPending && (
                <RemoveButton
                  onClick={() => handleRevoke(device.publicKey)}
                  title="Revoke Access"
                >
                  <Trash2 size={20} />
                </RemoveButton>
              )}
            </DeviceItem>
          );
        })}
      </DeviceList>
    </Container>
  );
};
