import { useState } from "react";
import { queryDB } from "../../../services/storage/sqliteService";
import { localAIService } from "../../../services/ai/localAI.service";
import { SessionData } from "../types";

export const useGlobalSummary = (sessions: SessionData[]) => {
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isInitializingModel, setIsInitializingModel] = useState(false);
  const [summaryElapsedMs, setSummaryElapsedMs] = useState<number | null>(null);
  const [globalSummary, setGlobalSummary] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  const generateGlobalSummary = async () => {
    setSummaryElapsedMs(null);
    setShowSummaryModal(true);
    setGlobalSummary(null);
    const startTime = Date.now();

    if (!localAIService.isLoaded) {
      setIsInitializingModel(true);
      try {
        await localAIService.init();
      } catch (e) {
        console.error("Model init failed", e);
        setGlobalSummary("Failed to initialise AI model. Please try again.");
        setIsInitializingModel(false);
        return;
      }
      setIsInitializingModel(false);
    }

    setIsSummarizing(true);

    try {
      const relevantSessions = sessions
        .filter((s) => s.unread > 0)
        .sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
        .slice(0, 5);

      if (relevantSessions.length === 0) {
        setGlobalSummary("No new unread messages to summarize.");
        return;
      }
      let context = "";

      for (const session of relevantSessions) {
        const rows = await queryDB(
          `SELECT sender, text, timestamp FROM messages WHERE sid = ? ORDER BY timestamp DESC LIMIT 10`,
          [session.sid],
        );
        const msgs = rows
          .reverse()
          .filter((m: any) => m.sender !== "me")
          .map((m: any) => `- ${m.text}`)
          .join("\n");

        if (msgs) {
          const name =
            session.alias_name || session.peer_name || "Unknown Sender";
          context += `[Messages from ${name}]:\n${msgs}\n\n`;
        }
      }

      if (!context.trim()) {
        setGlobalSummary("No incoming messages found in unread chats.");
        return;
      }

      const prompt =
        `Write a digest for these messages (one line per person, only facts stated):\n` +
        `${context}\n` +
        `Digest:\n`;

      const summary = await localAIService.generate(
        [
          {
            role: "system",
            content:
              "You write a one-line-per-person digest of chat messages. " +
              "Only use facts from the messages. Never invent anything.",

          },
          { role: "user", content: prompt },
        ],
        {
          maxNewTokens: 200,
          temperature: 0.1,
          onToken: (token) => {
            setGlobalSummary(token);
          },
        },
      );

      setGlobalSummary(summary);
      setSummaryElapsedMs(Date.now() - startTime);


    } catch (e) {
      console.error("Global summary failed", e);
      setGlobalSummary("Failed to generate summary. Please try again.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const closeSummary = () => {
    setShowSummaryModal(false);
    setGlobalSummary(null);
  };

  return {
    isSummarizing,
    isInitializingModel,
    summaryElapsedMs,
    globalSummary,
    showSummaryModal,
    generateGlobalSummary,
    closeSummary,
  };
};
