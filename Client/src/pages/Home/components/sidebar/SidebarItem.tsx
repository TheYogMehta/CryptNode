import React, { useState, useEffect } from "react";
import { avatarCacheService } from "../../../../services/storage/AvatarCacheService";
import { SessionData } from "../../types";
import { Avatar } from "../../../../components/ui/Avatar";
import {
  ItemContainer,
  ItemInfo,
  ItemName,
  ItemPreview,
  UnreadBadge,
} from "./Sidebar.styles";

interface SidebarItemProps {
  data: SessionData;
  isActive: boolean;
  onSelect: (sid: string) => void;
  onRename: (sid: string, currentName: string) => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = React.memo(
  ({ data, isActive, onSelect, onRename }) => {
    const {
      sid,
      lastMsg,
      lastMsgType,
      unread,
      online,
      alias_name,
      alias_avatar,
      peer_name,
      peer_avatar,
      peerEmail,
    } = data;
    const isOnline = online;
    const peerLabelFromEmail = peerEmail ? peerEmail.split("@")[0] : undefined;
    const displayName =
      alias_name ||
      peer_name ||
      peerLabelFromEmail ||
      (data.isOwnDevice ? `Saved Messages (${sid.slice(0, 4)})` : `Peer ${sid.slice(0, 6)}`);
    const [resolvedAvatar, setResolvedAvatar] = useState<string | undefined>(
      undefined,
    );
    const avatarUrl = alias_avatar || peer_avatar;

    useEffect(() => {
      let active = true;

      const fetch = () => {
        avatarCacheService.getAvatar(avatarUrl).then((src) => {
          if (active) setResolvedAvatar(src || undefined);
        });
      };

      fetch();

      // Re-fetch if the avatar file lands on disk after our first render
      const unsub = avatarCacheService.onBust((cleanUrl) => {
        const myClean = (avatarUrl || "").replace(/\.jpg$/, "");
        if (myClean && cleanUrl === myClean) fetch();
      });

      return () => {
        active = false;
        unsub();
      };
    }, [avatarUrl]);

    const getPreviewText = () => {
      if (!lastMsg && !lastMsgType) {
        if (sid === "secure-vault" || data.isOwnDevice) return { text: "No messages yet", time: "" };
        return { text: isOnline ? "Online" : "Offline", time: "" };
      }

      let text = lastMsg || "";
      switch (lastMsgType) {
        case "image":
          text = "📷 Photo";
          break;
        case "video":
          text = "🎥 Video";
          break;
        case "audio":
          text = "🎤 Voice";
          break;
        case "file":
          text = "📄 File";
          break;
        case "sticker":
          text = "Sticker";
          break;
      }

      // Format relative time
      let timeStr = "";
      if (data.lastTs) {
        const date = new Date(data.lastTs);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) timeStr = "now";
        else if (diffMins < 60) timeStr = `${diffMins}m`;
        else if (diffHours < 24) timeStr = `${diffHours}h`;
        else if (diffDays < 7) {
          const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          timeStr = days[date.getDay()];
        } else {
          timeStr = `${date.getMonth() + 1}/${date.getDate()}`;
        }
      }

      return { text, time: timeStr };
    };

    return (
      <ItemContainer
        isActive={isActive}
        onClick={() => onSelect(sid)}
      >
        <Avatar
          src={resolvedAvatar}
          name={displayName}
          size="md"
          status={sid === "secure-vault" || data.isOwnDevice ? undefined : (isOnline ? "online" : "offline")}
        />

        <ItemInfo>
          <ItemName>
            <span>{displayName}</span>
            {getPreviewText().time && (
              <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: "normal" }}>
                {getPreviewText().time}
              </span>
            )}
          </ItemName>
          <ItemPreview isActive={isActive}>{getPreviewText().text}</ItemPreview>
        </ItemInfo>

        {unread > 0 && (
          <UnreadBadge>{unread > 99 ? "99+" : unread}</UnreadBadge>
        )}
      </ItemContainer>
    );
  },
);
