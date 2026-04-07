import { useCallback, useEffect, useMemo, useState } from "react";

import { ChatMessage, SessionData } from "../types";
import {
  canCopySelectedMessages,
  copySelectedMessagesToClipboard,
} from "../components/chat/chatClipboard";

interface UseSelectedMessagesOptions {
  messages: ChatMessage[];
  session?: SessionData;
  activeChat: string | null;
  onDeleteMessage: (
    chatId: string,
    messageId: string,
  ) => void | Promise<void>;
}

export const useSelectedMessages = ({
  messages,
  session,
  activeChat,
  onDeleteMessage,
}: UseSelectedMessagesOptions) => {
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (selectedMessages.size === 0) return;

    const validIds = new Set(
      messages
        .map((message) => message.id)
        .filter((messageId): messageId is string => Boolean(messageId)),
    );

    setSelectedMessages((prev) => {
      let changed = false;
      const next = new Set<string>();

      prev.forEach((messageId) => {
        if (validIds.has(messageId)) {
          next.add(messageId);
          return;
        }
        changed = true;
      });

      return changed ? next : prev;
    });
  }, [messages, selectedMessages.size]);

  const selectionMode = selectedMessages.size > 0;
  const selectedMessageItems = useMemo(
    () => messages.filter((message) => message.id && selectedMessages.has(message.id)),
    [messages, selectedMessages],
  );
  const canCopySelected = canCopySelectedMessages(selectedMessageItems);

  const handleToggleSelect = useCallback((message: ChatMessage) => {
    if (!message.id) return;

    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(message.id!)) next.delete(message.id!);
      else next.add(message.id!);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedMessages(new Set());
  }, []);

  const handleCopySelected = useCallback(async () => {
    if (!canCopySelected) return;

    try {
      await copySelectedMessagesToClipboard(selectedMessageItems, session);
      clearSelection();
    } catch (error) {
      console.error("Copy multiple failed", error);
    }
  }, [canCopySelected, clearSelection, selectedMessageItems, session]);

  const handleDeleteSelected = useCallback(async () => {
    if (!activeChat) return;
    if (!window.confirm(`Delete ${selectedMessages.size} selected message(s)?`)) {
      return;
    }

    for (const messageId of selectedMessages) {
      await Promise.resolve(onDeleteMessage(activeChat, messageId));
    }

    clearSelection();
  }, [activeChat, clearSelection, onDeleteMessage, selectedMessages]);

  return {
    selectedMessages,
    selectionMode,
    canCopySelected,
    handleToggleSelect,
    clearSelection,
    handleCopySelected,
    handleDeleteSelected,
  };
};
