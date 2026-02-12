import { useCallback } from "react";
import { useSessionLogic } from "./useSessionLogic";
import { useMessageLogic } from "./useMessageLogic";
import { useCallLogic } from "./useCallLogic";
import { ChatMessage } from "../types";

export const useChatLogic = () => {
  const sessionLogic = useSessionLogic();

  const messageLogic = useMessageLogic({
    activeChat: sessionLogic.state.activeChat,
    activeChatRef: sessionLogic.refs.activeChatRef,
    loadSessions: sessionLogic.actions.loadSessions,
  });

  const addMessage = useCallback(
    (msg: ChatMessage) => {
      messageLogic.actions.setMessages((prev) => [...prev, msg]);
    },
    [messageLogic.actions],
  );

  const callLogic = useCallLogic({
    activeChatRef: sessionLogic.refs.activeChatRef,
    loadSessions: sessionLogic.actions.loadSessions,
    addMessage,
  });

  return {
    state: {
      ...sessionLogic.state,
      ...messageLogic.state,
      ...callLogic.state,
    },
    actions: {
      ...sessionLogic.actions,
      ...messageLogic.actions,
      ...callLogic.actions,
      startCall: (type: any) => {
        if (sessionLogic.state.activeChat) {
          callLogic.actions.startCall(sessionLogic.state.activeChat, type);
        }
      },
    },
  };
};
