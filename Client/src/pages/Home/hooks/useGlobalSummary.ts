import { useState } from "react";
import { queryDB } from "../../../services/storage/sqliteService";
import { qwenLocalService } from "../../../services/ai/qwenLocal.service";
import { SessionData } from "../types";

export const useGlobalSummary = (sessions: SessionData[]) => {
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [globalSummary, setGlobalSummary] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  const generateGlobalSummary = async () => {
    setIsSummarizing(true);
    setShowSummaryModal(true);
    setGlobalSummary(null);

    try {
      const relevantSessions = sessions
        .filter((s) => s.unread > 0)
        .sort((a, b) => b.lastTs - a.lastTs)
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

      const prompt = `Task: Create a cynical, ultra-concise digest of these messages.
Rules:
1. NO meta-talk (e.g., "The sender said", "Here is a summary").
2. NO bullet points or numbering characters at the start of lines.
3. OUTPUT ONLY the facts in subject-verb format.
4. If a message is a question, mark it with [?] at the start.
5. Max 15 words per line.

Example Input:
[Messages from John]:
- I'll be there at 5.
- Did you bring the keys?

Example Output:
John is arriving at 5.
[?] John asked about keys.

Input:
${context}

Output:`;

      const summary = await qwenLocalService.generate(
        [
          {
            role: "system",
            content:
              "You are a personal digest tool. Summarize incoming messages directly. No meta-talk.",
          },
          { role: "user", content: prompt },
        ],
        {
          maxNewTokens: 256,
          temperature: 0.1,
          onToken: (token) => {
            setGlobalSummary(token);
          },
        },
      );

      setGlobalSummary(summary);
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
    globalSummary,
    showSummaryModal,
    generateGlobalSummary,
    closeSummary,
  };
};
