import { useCallback, useEffect, useState } from "react";

import { localAIService } from "../../../services/ai/localAI.service";

export const useQuickReplies = (draft: string, limit = 3) => {
  const [showAiSuggestions, setShowAiSuggestions] = useState(true);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [isGeneratingReplies, setIsGeneratingReplies] = useState(false);

  const generateQuickReplies = useCallback(async () => {
    if (isGeneratingReplies) return;

    setIsGeneratingReplies(true);
    try {
      const items = await localAIService.quickReplies(draft, limit);
      setQuickReplies(items);
    } catch (error) {
      console.error("Failed to generate quick replies", error);
    } finally {
      setIsGeneratingReplies(false);
    }
  }, [draft, isGeneratingReplies, limit]);

  useEffect(() => {
    if (quickReplies.length > 0 && draft.trim().length > 0) {
      setQuickReplies([]);
    }
  }, [draft, quickReplies.length]);

  return {
    showAiSuggestions,
    setShowAiSuggestions,
    quickReplies,
    isGeneratingReplies,
    generateQuickReplies,
  };
};
