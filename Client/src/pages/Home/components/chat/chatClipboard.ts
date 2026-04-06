import { Clipboard } from "@capacitor/clipboard";

import { ChatMessage, SessionData } from "../../types";

export const canCopySingleMessage = (msg: ChatMessage): boolean =>
  msg.type === "text";

export const canCopySelectedMessages = (messages: ChatMessage[]): boolean =>
  messages.length > 0 && messages.every((msg) => msg.type === "text");

const getSenderLabel = (msg: ChatMessage, session?: SessionData): string =>
  msg.sender === "me"
    ? "Me"
    : session?.alias_name || session?.peer_name || "User";

const formatSelectedMessageForCopy = (
  msg: ChatMessage,
  session?: SessionData,
): string => {
  const time = new Date(msg.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return `[${time}] ${getSenderLabel(msg, session)}: ${msg.text || ""}`;
};

export const copySingleMessageToClipboard = async (
  msg: ChatMessage,
): Promise<void> => {
  if (!canCopySingleMessage(msg)) {
    throw new Error("Copy is only available for text messages.");
  }

  await Clipboard.write({ string: msg.text || "" });
};

export const copySelectedMessagesToClipboard = async (
  messages: ChatMessage[],
  session?: SessionData,
): Promise<void> => {
  if (!canCopySelectedMessages(messages)) {
    throw new Error("Only text messages can be copied in multi-select mode.");
  }

  const text = [...messages]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((msg) => formatSelectedMessageForCopy(msg, session))
    .join("\n");

  await Clipboard.write({ string: text });
};
