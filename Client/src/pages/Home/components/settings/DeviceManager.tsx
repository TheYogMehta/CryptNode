import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { Trash2, Key, Monitor, RefreshCw } from "lucide-react";
import ChatClient from "../../../../services/core/ChatClient";
import toast from "react-hot-toast";
import { colors } from "../../../../theme/design-system";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";

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
  word-break: break-all;
`;

const Badge = styled.span<{ $type?: "master" }>`
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 12px;
  background: ${(props) =>
    props.$type === "master"
      ? "rgba(99, 102, 241, 0.2)"
      : "rgba(255,255,255,0.1)"};
  color: ${(props) => (props.$type === "master" ? "#818cf8" : "#a0a0b0")};
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

interface DeviceManagerProps {
  currentUserEmail?: string | null;
}

export const DeviceManager: React.FC<DeviceManagerProps> = ({
  currentUserEmail = null,
}) => {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [localPubKey, setLocalPubKey] = useState<string>("");
  const [revokeTarget, setRevokeTarget] = useState<any | null>(null);

  const fetchDevices = useCallback(async () => {
    if (!currentUserEmail) {
      setDevices([]);
      setLocalPubKey("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setDevices([]);
    try {
      const pubKey = await ChatClient.getPublicKeyString();
      setLocalPubKey(pubKey);
    } catch (e) {
      console.warn("[DeviceManager] Failed to resolve local public key", e);
      setLocalPubKey("");
    }
    ChatClient.send({ t: "GET_DEVICES" });
  }, [currentUserEmail]);

  useEffect(() => {
    const onDeviceList = (data: any) => {
      if (data && data.devices) {
        setDevices(data.devices);
      }
      setLoading(false);
    };

    const onAuthSuccess = (email: string) => {
      if (!currentUserEmail) return;
      if (email.trim().toLowerCase() !== currentUserEmail.trim().toLowerCase()) {
        return;
      }
      fetchDevices().catch((e) => {
        console.warn("[DeviceManager] Failed to fetch devices after auth", e);
        setLoading(false);
      });
    };

    ChatClient.on("device_list", onDeviceList);
    ChatClient.on("auth_success", onAuthSuccess);
    fetchDevices().catch((e) => {
      console.warn("[DeviceManager] Failed to fetch devices", e);
      setLoading(false);
    });
    return () => {
      ChatClient.off("device_list", onDeviceList);
      ChatClient.off("auth_success", onAuthSuccess);
    };
  }, [fetchDevices]);

  const handleRevoke = (pubKey: string) => {
    ChatClient.send({
      t: "DELETE_DEVICE",
      data: { targetPubKey: pubKey },
    });
    toast.success("Device deleted from your account.");
    setRevokeTarget(null);
    setDevices((prev) => prev.filter((d) => d.publicKey !== pubKey));
  };

  return (
    <Container>
      <Title>Linked Devices</Title>
      <Description>
        Manage the devices that have access to your account. Deleting a device
        removes its public key from the server and logs it out.
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

        {devices
          .slice()
          .sort((a, b) => {
            const aIsMe = a.publicKey.trim() === localPubKey.trim();
            const bIsMe = b.publicKey.trim() === localPubKey.trim();
            if (aIsMe) return -1;
            if (bIsMe) return 1;
             return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
          })
          .map((device, idx) => {
            const isMe = device.publicKey.trim() === localPubKey.trim();
            const isMaster = device.isMaster;
  
            let title = `Device ID: ${device.publicKey.trim()}`;
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
                  </DeviceName>
                  <DeviceMeta>
                    <span>
                      Last Active:{" "}
                      {new Date(device.lastActive).toLocaleString()}
                    </span>
                  </DeviceMeta>
                </DeviceDetails>
              </DeviceInfo>
              {!isMe && (
                <RemoveButton
                  onClick={() => setRevokeTarget(device)}
                  title="Delete device"
                  aria-label="Delete device"
                >
                  <Trash2 size={18} />
                </RemoveButton>
              )}
            </DeviceItem>
          );
        })}
      </DeviceList>
      <ConfirmDialog
        open={!!revokeTarget}
        title="Delete this device?"
        description="This removes the device public key from the server for your account and logs that device out."
        confirmLabel="Delete Device"
        tone="danger"
        badgeLabel="Device Access"
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => revokeTarget && handleRevoke(revokeTarget.publicKey)}
      />
    </Container>
  );
};
