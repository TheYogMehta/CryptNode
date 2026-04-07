import React, { useState, useEffect } from "react";
import { avatarCacheService } from "../services/storage/AvatarCacheService";

const UserAvatar: React.FC<{
  avatarUrl?: string | null;
  name?: string;
  size: number;
  style?: React.CSSProperties;
  onClick?: () => void;
  children?: React.ReactNode;
}> = ({ avatarUrl, name, size, style, onClick, children }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetch = () => {
      avatarCacheService.getAvatar(avatarUrl).then((s) => {
        if (!active) return;
        if (!s) {
          setSrc(null);
          return;
        }

        const img = new window.Image();
        img.onload = () => active && setSrc(s);
        img.onerror = () => active && setSrc(null);
        img.src = s;
      });
    };

    fetch();

    const unsub = avatarCacheService.onBust((cleanUrl) => {
      const myClean = (avatarUrl || "").replace(/\.jpg$/, "");
      if (myClean && cleanUrl === myClean) fetch();
    });

    return () => {
      active = false;
      unsub();
    };
  }, [avatarUrl]);

  return (
    <div
      style={{
        ...style,
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: "#333",
        backgroundImage: src ? `url(${src})` : "none",
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.4) + "px",
        color: "#666",
        cursor: onClick ? "pointer" : "default",
        overflow: "hidden",
        position: "relative",
      }}
      onClick={onClick}
    >
      {!src && (name?.[0] || "?").toUpperCase()}
      {children}
    </div>
  );
};

export default UserAvatar;
