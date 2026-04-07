import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Save, Grid, LayoutGrid, File, Film, Image as ImageIcon, UserMinus, Filter, Trash2, UserPlus } from "lucide-react";
import {
  Overlay,
  ModalContainer,
  Header,
  HeaderTitle,
  CloseButton,
  Content,
  ProfileHeader,
  AvatarContainer,
  ProfileInfo,
  EditableInput,
  SectionTitle,
  NotesArea,
  MediaGridHeader,
  GridControls,
  GridButton,
  MediaGridContent,
  MediaItem,
  SaveButtonContainer,
  SaveButton,
  RemoveConnectionButton,
  SendRequestButton,
  MonthHeader,
  FilterPanel,
  FilterRow,
  FilterGroup,
  FilterLabel,
  FilterSelect,
  FilterInput
} from "./UserProfileModal.styles";
import { SessionData } from "../../types";
import { avatarCacheService } from "../../../../services/storage/AvatarCacheService";
import { StorageService } from "../../../../services/storage/StorageService";
import { getMediaForSession } from "../../../../services/storage/sqliteService";
import ChatClient from "../../../../services/core/ChatClient";
import { colors } from "../../../../theme/design-system";

import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

interface UserProfileModalProps {
  session: SessionData;
  onClose: () => void;
  onSave: (aliasName: string, notes: string) => Promise<void>;
  onGoToMessage?: (messageId: string) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  session,
  onClose,
  onSave,
  onGoToMessage
}) => {
  const [aliasName, setAliasName] = useState(session.alias_name || "");
  const [notes, setNotes] = useState(session.notes || "");
  const [resolvedAvatar, setResolvedAvatar] = useState<string | undefined>();
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [columns, setColumns] = useState<number>(4);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterFrom, setFilterFrom] = useState<"all" | "me" | "them">("all");
  const [filterType, setFilterType] = useState<"all" | "image" | "video" | "document">("all");
  const [filterOnDate, setFilterOnDate] = useState("");
  const [filterBeforeDate, setFilterBeforeDate] = useState("");
  const [filterAfterDate, setFilterAfterDate] = useState("");
  
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    item: any;
  } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const formatDisplayDate = (isoString: string) => {
    if (!isoString || !isoString.includes("-")) return isoString;
    const [y, m, d] = isoString.split("-");
    if (!y || !m || !d) return isoString;
    return `${d} ${m} ${y}`;
  };

  const parseToISODate = (input: string) => {
    const raw = input.replace(/[^0-9\s/.-]/g, '');
    const parts = raw.split(/[\s/.-]/).filter(Boolean);
    if (parts.length >= 3) {
      let d = parts[0].padStart(2, '0');
      let m = parts[1].padStart(2, '0');
      let y = parts[2];
      if (y.length === 2) y = '20' + y;
      return `${y}-${m}-${d}`;
    }
    return input;
  };
  const sessionService = ChatClient.sessionService;

  const displayName = session.alias_name || session.peer_name || (session.peerEmail ? session.peerEmail.split("@")[0] : `User`);
  const avatarUrl = session.alias_avatar || session.peer_avatar;

  useEffect(() => {
    let active = true;
    if (avatarUrl) {
      avatarCacheService.getAvatar(avatarUrl).then((src) => {
        if (active) setResolvedAvatar(src || undefined);
      });
    }
    return () => { active = false; };
  }, [avatarUrl]);

  useEffect(() => {
    let active = true;
    const fetchMedia = async () => {
      try {
        const media = await getMediaForSession(session.sid);
        if (active) {

          const enrichedMedia = await Promise.all(
            media.map(async (item) => {
              if (item.filename) {
                try {
                  const localUrl = await StorageService.getFileSrc(item.filename, item.mime_type);
                  return { ...item, localUrl };
                } catch (e) {
                  return item;
                }
              }
              return item;
            })
          );
          setMediaItems(enrichedMedia);
        }
      } catch (e) {
        console.error("Failed to load media for profile", e);
      }
    };
    fetchMedia();
    return () => { active = false; };
  }, [session.sid]);

  // Handle responsiveness manually if window resizes, though 2/4 toggle works well
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 480 && columns !== 2) {
        // Force 2 columns on very small screens initially
        setColumns(2);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // init
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(aliasName, notes);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendRequest = async () => {
    if (!session.peerEmail || isSendingRequest || requestSent) return;
    setIsSendingRequest(true);
    try {
      await ChatClient.connectToPeer(session.peerEmail);
      setRequestSent(true);
    } catch (e) {
      console.error("Failed to send request", e);
    } finally {
      setIsSendingRequest(false);
    }
  };

  const renderMediaItem = (item: any) => {
    if (item.mime_type?.startsWith("image/") && item.localUrl) {
      return <img src={item.localUrl} alt={item.original_name} />;
    }
    if (item.mime_type?.startsWith("image/")) {
      return (
        <div className="file-icon">
          <ImageIcon size={24} />
          <span style={{ fontSize: '10px', wordBreak: 'break-all', padding: '0 4px', textAlign: 'center' }}>
            {item.original_name?.substring(0, 15)}...
          </span>
        </div>
      );
    }
    if (item.mime_type?.startsWith("video/")) {
      return (
        <div className="file-icon">
          <Film size={24} />
          <span>Video</span>
        </div>
      );
    }
    return (
      <div className="file-icon">
        <File size={24} />
        <span style={{ fontSize: '10px', wordBreak: 'break-all', padding: '0 4px', textAlign: 'center' }}>
          {item.original_name?.substring(0, 15)}...
        </span>
      </div>
    );
  };

  const lightboxImages = mediaItems
    .filter(i => i.mime_type?.startsWith("image/") && i.localUrl)
    .map(i => ({ src: i.localUrl, item: i }));

  const filteredMediaItems = mediaItems.filter(item => {
    // 1. Sender Filter
    if (filterFrom === "me" && item.sender !== "me") return false;
    if (filterFrom === "them" && item.sender === "me") return false;

    // 2. Type Filter
    const isImage = item.mime_type?.startsWith("image/");
    const isVideo = item.mime_type?.startsWith("video/");
    if (filterType === "image" && !isImage) return false;
    if (filterType === "video" && !isVideo) return false;
    if (filterType === "document" && (isImage || isVideo)) return false;

    // 3. Date Filters
    if (item.timestamp) {
      if (filterOnDate) {
        const onDate = new Date(filterOnDate);
        const itemDate = new Date(item.timestamp);
        if (onDate.getFullYear() !== itemDate.getFullYear() ||
            onDate.getMonth() !== itemDate.getMonth() ||
            onDate.getDate() !== itemDate.getDate()) {
          return false;
        }
      }
      if (filterBeforeDate) {
        const beforeDate = new Date(filterBeforeDate).getTime();
        if (item.timestamp >= beforeDate) return false;
      }
      if (filterAfterDate) {
        const afterDate = new Date(filterAfterDate).getTime() + 86400000;
        if (item.timestamp <= afterDate) return false;
      }
    }
    return true;
  });

  const mediaGroups: { month: string, items: any[] }[] = [];
  filteredMediaItems.forEach(item => {
    const monthYear = new Date(item.timestamp).toLocaleString('en-US', { month: 'short', year: 'numeric' });
    let group = mediaGroups.find(g => g.month === monthYear);
    if (!group) {
      group = { month: monthYear, items: [] };
      mediaGroups.push(group);
    }
    group.items.push(item);
  });

  return (
    <Overlay onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <ModalContainer>
        <Header>
          <HeaderTitle>User Profile</HeaderTitle>
          <CloseButton onClick={onClose}>
            <X size={24} />
          </CloseButton>
        </Header>

        <Content>
          <ProfileHeader>
            <AvatarContainer>
              {resolvedAvatar ? (
                <img src={resolvedAvatar} alt="Avatar" />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </AvatarContainer>
            <ProfileInfo>
              <EditableInput
                value={aliasName}
                onChange={(e) => setAliasName(e.target.value)}
                placeholder={displayName}
              />
              <span style={{ fontSize: '12px', color: colors.text.secondary, paddingLeft: '8px' }}>
                {session.peerEmail || session.sid.substring(0, 12) + "..."}
              </span>
            </ProfileInfo>
          </ProfileHeader>

          <div>
            <SectionTitle>Notes</SectionTitle>
            <NotesArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add personal notes about this user..."
            />
          </div>

          {mediaItems.length > 0 && (
            <div>
              <MediaGridHeader>
                <SectionTitle style={{ marginBottom: 0 }}>Shared Media</SectionTitle>
                <GridControls>
                  <GridButton active={showFilters} onClick={() => setShowFilters(!showFilters)} title="Filters">
                    <Filter size={18} />
                  </GridButton>
                  <GridButton active={columns === 2} onClick={() => setColumns(2)} title="2 Columns">
                    <Grid size={18} />
                  </GridButton>
                  <GridButton active={columns === 4} onClick={() => setColumns(4)} title="4 Columns">
                    <LayoutGrid size={18} />
                  </GridButton>
                </GridControls>
              </MediaGridHeader>

              {showFilters && (
                <FilterPanel>
                  <FilterRow>
                    <FilterGroup>
                      <FilterLabel>From</FilterLabel>
                      <FilterSelect value={filterFrom} onChange={e => setFilterFrom(e.target.value as any)}>
                        <option value="all">Anyone</option>
                        <option value="me">Me</option>
                        <option value="them">{displayName}</option>
                      </FilterSelect>
                    </FilterGroup>
                    <FilterGroup>
                      <FilterLabel>Type</FilterLabel>
                      <FilterSelect value={filterType} onChange={e => setFilterType(e.target.value as any)}>
                        <option value="all">All</option>
                        <option value="image">Images</option>
                        <option value="video">Videos</option>
                        <option value="document">Documents</option>
                      </FilterSelect>
                    </FilterGroup>
                  </FilterRow>
                  <FilterRow>
                    <FilterGroup>
                      <FilterLabel>On Date</FilterLabel>
                      <FilterInput type="text" placeholder="DD MM YYYY" value={formatDisplayDate(filterOnDate)} onChange={e => { setFilterOnDate(parseToISODate(e.target.value)); setFilterBeforeDate(""); setFilterAfterDate(""); }} />
                    </FilterGroup>
                    <FilterGroup>
                      <FilterLabel>Before Date</FilterLabel>
                      <FilterInput type="text" placeholder="DD MM YYYY" value={formatDisplayDate(filterBeforeDate)} onChange={e => { setFilterBeforeDate(parseToISODate(e.target.value)); setFilterOnDate(""); }} />
                    </FilterGroup>
                    <FilterGroup>
                      <FilterLabel>After Date</FilterLabel>
                      <FilterInput type="text" placeholder="DD MM YYYY" value={formatDisplayDate(filterAfterDate)} onChange={e => { setFilterAfterDate(parseToISODate(e.target.value)); setFilterOnDate(""); }} />
                    </FilterGroup>
                  </FilterRow>
                </FilterPanel>
              )}

              {mediaGroups.length === 0 ? (
                <div style={{ color: colors.text.tertiary, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                  No media matches the active filters.
                </div>
              ) : (
                mediaGroups.map(group => (
                  <div key={group.month}>
                    <MonthHeader>{group.month}</MonthHeader>
                    <MediaGridContent columns={columns}>
                      {group.items.map((item, index) => (
                        <MediaItem
                          key={item.filename || index}
                          onClick={() => {
                            if (item.mime_type?.startsWith("image/")) {
                               const slideIndex = lightboxImages.findIndex(l => l.item.filename === item.filename);
                               if (slideIndex >= 0) {
                                  setLightboxIndex(slideIndex);
                                  setLightboxOpen(true);
                               }
                            } else if (item.localUrl) {
                              window.open(item.localUrl, "_blank", "noopener,noreferrer");
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({
                              mouseX: e.clientX,
                              mouseY: e.clientY,
                              item
                            });
                          }}
                        >
                          {renderMediaItem(item)}
                        </MediaItem>
                      ))}
                    </MediaGridContent>
                  </div>
                ))
              )}
            </div>
          )}
        </Content>

        <SaveButtonContainer>
          {session.isConnected !== false ? (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <RemoveConnectionButton
                onClick={async () => {
                  if (window.confirm("Are you sure you want to remove this connection? The chat will stay visible, but you will no longer be connected to this user.")) {
                    setIsSaving(true);
                    onClose();
                    await ChatClient.removeConnection(
                      session.peerEmailHash || "",
                      session.sid,
                    );
                  }
                }}
                disabled={isSaving}
              >
                <UserMinus size={18} />
                Remove Connection
              </RemoveConnectionButton>

              <RemoveConnectionButton
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete this chat? This will clear past messages but keep the connection and chat visible.")) {
                    setIsSaving(true);
                    onClose();
                    ChatClient.deleteChat(session.sid, false);
                  }
                }}
                disabled={isSaving}
              >
                <Trash2 size={18} />
                Delete Chat
              </RemoveConnectionButton>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <RemoveConnectionButton
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete this chat? This will delete the messages and remove this disconnected chat from your UI.")) {
                    setIsSaving(true);
                    onClose();
                    ChatClient.deleteChat(session.sid, true);
                  }
                }}
                disabled={isSaving}
              >
                <Trash2 size={18} />
                Delete Chat
              </RemoveConnectionButton>

              {session.peerEmail && (
                <SendRequestButton
                  onClick={handleSendRequest}
                  disabled={isSendingRequest || requestSent}
                  title={`Send friend request to ${session.peerEmail}`}
                >
                  <UserPlus size={18} />
                  {requestSent ? "Request Sent" : isSendingRequest ? "Sending..." : "Send Request"}
                </SendRequestButton>
              )}
            </div>
          )}
          
          {(aliasName !== (session.alias_name || "") || notes !== (session.notes || "")) && (
            <SaveButton onClick={handleSave} disabled={isSaving}>
              <Save size={18} />
              {isSaving ? "Saving..." : "Save Changes"}
            </SaveButton>
          )}
        </SaveButtonContainer>
      </ModalContainer>

      {contextMenu !== null && contextMenu.item && (
        <Menu
          open={contextMenu !== null}
          onClose={(e: any) => { e.stopPropagation(); setContextMenu(null); }}
          anchorReference="anchorPosition"
          anchorPosition={
            contextMenu !== null
              ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
              : undefined
          }
          PaperProps={{
            style: {
              backgroundColor: "var(--surface-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "10px",
              boxShadow: "var(--shadow-lg)",
            },
          }}
          MenuListProps={{
            style: {
              backgroundColor: "var(--surface-primary)",
              color: "var(--text-primary)",
              borderRadius: "8px",
            },
          }}
        >
          <MenuItem
            onClick={() => {
              if (contextMenu.item.localUrl) {
                const a = document.createElement("a");
                a.href = contextMenu.item.localUrl;
                a.download = contextMenu.item.original_name || "download";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              } else {
                alert("File not fully downloaded yet.");
              }
              setContextMenu(null);
            }}
          >
            Download
          </MenuItem>
          {onGoToMessage && contextMenu.item.message_id && (
            <MenuItem
              onClick={() => {
                onGoToMessage(contextMenu.item.message_id);
                setContextMenu(null);
              }}
            >
              Go to Message
            </MenuItem>
          )}
        </Menu>
      )}

      {lightboxOpen && (
        <div onClick={e => e.stopPropagation()}>
          <Lightbox
            open={lightboxOpen}
            close={() => setLightboxOpen(false)}
            index={lightboxIndex}
            on={{ view: ({ index: i }) => setLightboxIndex(i) }}
            slides={lightboxImages.map(img => ({ src: img.src }))}
          />
          {lightboxImages[lightboxIndex] && createPortal(
            <>
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '80px', zIndex: 999999, display: 'flex', alignItems: 'center', padding: '0 24px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)', pointerEvents: 'none' }}>
                {lightboxImages[lightboxIndex].item.sender === 'me' ? (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 'bold', color: 'white' }}>
                    Y
                  </div>
                ) : (
                  resolvedAvatar ? (
                    <img src={resolvedAvatar} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 'bold', color: 'white' }}>
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )
                )}
                <div style={{ marginLeft: '12px', color: 'white', fontWeight: 600, fontSize: '16px', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                  {lightboxImages[lightboxIndex].item.sender === 'me' ? "You" : displayName}
                </div>
              </div>
              
              <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '80px', zIndex: 999999, display: 'flex', alignItems: 'flex-end', padding: '0 24px 24px 24px', background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)', pointerEvents: 'none' }}>
                <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: '14px', textShadow: '0 1px 4px rgba(0,0,0,0.9)', fontWeight: 500 }}>
                  {new Date(lightboxImages[lightboxIndex].item.timestamp).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}
                </div>
              </div>
            </>,
            document.body
          )}
        </div>
      )}
    </Overlay>
  );
};
