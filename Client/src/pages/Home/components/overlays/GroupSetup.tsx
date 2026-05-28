import React, { useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { Search, Check } from "lucide-react";
import {
  ModalOverlay,
  DialogPanel,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  PrimaryButton,
  CancelButton,
  InputField,
} from "./Overlay.styles";
import ChatClient from "../../../../services/core/ChatClient";
import { colors, spacing, radii } from "../../../../theme/design-system";

const SearchWrapper = styled.div`
  position: relative;
  margin-bottom: ${spacing[4]};
`;

const SearchIconWrapper = styled.div`
  position: absolute;
  left: ${spacing[3]};
  top: 50%;
  transform: translateY(-50%);
  color: ${colors.text.tertiary};
  display: flex;
  align-items: center;
`;

const SearchInput = styled(InputField)`
  padding-left: ${spacing[9]};
`;

const FriendsList = styled.div`
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid ${colors.border.subtle};
  border-radius: ${radii.md};
  background: ${colors.background.tertiary};
  display: flex;
  flex-direction: column;
`;

const FriendRow = styled.div<{ selected: boolean }>`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  padding: ${spacing[3]};
  cursor: pointer;
  border-bottom: 1px solid ${colors.border.subtle};
  background-color: ${props => props.selected ? colors.primary.subtle + "22" : "transparent"};
  transition: background-color 0.2s;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: ${props => props.selected ? colors.primary.subtle + "33" : colors.surface.highlight};
  }
`;

const Checkbox = styled.div<{ checked: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 2px solid ${props => props.checked ? colors.primary.main : colors.border.subtle};
  background-color: ${props => props.checked ? colors.primary.main : "transparent"};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  transition: all 0.2s;
`;

const Avatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: ${colors.primary.main};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.85rem;
`;

const FriendInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const FriendName = styled.span`
  color: ${colors.text.primary};
  font-weight: 500;
  font-size: 0.94rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const FriendEmail = styled.span`
  color: ${colors.text.tertiary};
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

interface GroupSetupProps {
  onClose: () => void;
  onCreated: (groupSid: string) => void;
}

export const GroupSetup: React.FC<GroupSetupProps> = ({ onClose, onCreated }) => {
  const [groupName, setGroupName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get active friend sessions
  const friends = Object.values(ChatClient.sessions).filter(
    s => !s.isGroup && s.peerEmail && s.peerEmail !== ChatClient.userEmail
  );

  const filteredFriends = friends.filter(f => {
    const term = searchTerm.toLowerCase();
    const name = (f.peerName || "").toLowerCase();
    const email = (f.peerEmail || "").toLowerCase();
    return name.includes(term) || email.includes(term);
  });

  const toggleSelect = (email: string) => {
    setSelectedEmails(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedEmails.length === 0) return;
    setIsSubmitting(true);
    try {
      const groupSid = await ChatClient.sessionService.createGroup(groupName.trim(), selectedEmails);
      onCreated(groupSid);
      onClose();
    } catch (e) {
      console.error("Failed to create group", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <ModalOverlay onClick={onClose}>
      <DialogPanel onClick={e => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Create Encrypted Group</DialogTitle>
          <DialogDescription>
            Messages are symmetrically encrypted once and only read by group members.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div style={{ marginBottom: spacing[4] }}>
            <label style={{ display: "block", marginBottom: spacing[2], fontSize: "0.85rem", fontWeight: 600, color: colors.text.secondary }}>
              GROUP NAME
            </label>
            <InputField
              placeholder="Enter group name"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <label style={{ display: "block", marginBottom: spacing[2], fontSize: "0.85rem", fontWeight: 600, color: colors.text.secondary }}>
            SELECT MEMBERS
          </label>
          <SearchWrapper>
            <SearchIconWrapper>
              <Search size={16} />
            </SearchIconWrapper>
            <SearchInput
              placeholder="Search friends"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              disabled={isSubmitting}
            />
          </SearchWrapper>

          <FriendsList>
            {filteredFriends.length === 0 ? (
              <div style={{ padding: spacing[4], textAlign: "center", color: colors.text.tertiary, fontSize: "0.9rem" }}>
                No friends found
              </div>
            ) : (
              filteredFriends.map(f => {
                const email = f.peerEmail!;
                const name = f.peerName || email.split("@")[0];
                const selected = selectedEmails.includes(email);
                const initial = name.charAt(0).toUpperCase();

                return (
                  <FriendRow key={email} selected={selected} onClick={() => toggleSelect(email)}>
                    <Checkbox checked={selected}>
                      {selected && <Check size={12} strokeWidth={3} />}
                    </Checkbox>
                    <Avatar>{initial}</Avatar>
                    <FriendInfo>
                      <FriendName>{name}</FriendName>
                      <FriendEmail>{email}</FriendEmail>
                    </FriendInfo>
                  </FriendRow>
                );
              })
            )}
          </FriendsList>
        </DialogBody>
        <DialogFooter>
          <CancelButton onClick={onClose} disabled={isSubmitting}>
            Cancel
          </CancelButton>
          <PrimaryButton
            onClick={handleCreate}
            disabled={isSubmitting || !groupName.trim() || selectedEmails.length === 0}
          >
            {isSubmitting ? "Creating..." : "Create Group"}
          </PrimaryButton>
        </DialogFooter>
      </DialogPanel>
    </ModalOverlay>,
    document.getElementById("root") || document.body
  );
};
