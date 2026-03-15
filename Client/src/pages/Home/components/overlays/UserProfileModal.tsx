import React, { useState, useEffect } from "react";
import { X, Save, Grid, LayoutGrid, File, Film, Image as ImageIcon } from "lucide-react";
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
  SaveButton
} from "./UserProfileModal.styles";
import { SessionData } from "../../types";
import { avatarCacheService } from "../../../../services/storage/AvatarCacheService";
import { StorageService } from "../../../../services/storage/StorageService";
import { getMediaForSession } from "../../../../services/storage/sqliteService";
import ChatClient from "../../../../services/core/ChatClient";

interface UserProfileModalProps {
  session: SessionData;
  onClose: () => void;
  onSave: (aliasName: string, notes: string) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  session,
  onClose,
  onSave
}) => {
  const [aliasName, setAliasName] = useState(session.alias_name || "");
  const [notes, setNotes] = useState(session.notes || "");
  const [resolvedAvatar, setResolvedAvatar] = useState<string | undefined>();
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [columns, setColumns] = useState<number>(4);
  const [isSaving, setIsSaving] = useState(false);
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
                  } catch(e) {
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

  const renderMediaItem = (item: any) => {
      if (item.mime_type?.startsWith("image/")) {
          return <img src={item.localUrl || item.thumbnail} alt={item.original_name} />;
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
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', paddingLeft: '8px' }}>
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
                        <GridButton active={columns === 2} onClick={() => setColumns(2)} title="2 Columns">
                            <Grid size={18} />
                        </GridButton>
                        <GridButton active={columns === 4} onClick={() => setColumns(4)} title="4 Columns">
                            <LayoutGrid size={18} />
                        </GridButton>
                    </GridControls>
                </MediaGridHeader>
                <MediaGridContent columns={columns}>
                    {mediaItems.map((item, index) => (
                        <MediaItem 
                            key={item.filename || index}
                            onClick={() => {
                                if (item.localUrl) {
                                    window.open(item.localUrl, "_blank", "noopener,noreferrer");
                                }
                            }}
                        >
                           {renderMediaItem(item)}
                        </MediaItem>
                    ))}
                </MediaGridContent>
            </div>
          )}
        </Content>

        <SaveButtonContainer>
          <SaveButton onClick={handleSave} disabled={isSaving}>
            <Save size={18} />
            {isSaving ? "Saving..." : "Save Changes"}
          </SaveButton>
        </SaveButtonContainer>
      </ModalContainer>
    </Overlay>
  );
};
