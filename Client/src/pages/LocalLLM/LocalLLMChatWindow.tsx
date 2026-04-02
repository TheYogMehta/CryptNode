import React, { useState, useEffect, useRef } from "react";
import { IonIcon } from "@ionic/react";
import {
  arrowBackOutline,
  hardwareChipOutline,
  trashOutline,
  paperPlaneOutline,
  downloadOutline,
  closeCircleOutline,
  copyOutline,
  checkmarkOutline,
} from "ionicons/icons";
import { localAIService } from "../../services/ai/localAI.service";
import { colors } from "../../../src/theme/design-system";
import "./LocalLLMChatWindow.css";

interface LocalLLMChatWindowProps {
  onBack?: () => void;
  onOpenSettings: () => void;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  generationTimeMs?: number;
}

export const LocalLLMChatWindow: React.FC<LocalLLMChatWindowProps> = ({
  onBack,
  onOpenSettings,
}) => {
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [hasAnyDownloaded, setHasAnyDownloaded] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState(localAIService.downloadInfo);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeModel = localAIService.getActiveModelInfo();

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Sync service state
  useEffect(() => {
    const checkStatus = async () => {
      const installed = await localAIService.isModelInstalled();
      setIsInstalled(installed);

      const enhanced = await localAIService.getEnhancedModels();
      setHasAnyDownloaded(enhanced.some(m => m.isDownloaded));

      setDownloadProgress(localAIService.downloadProgress);
      setIsDownloading(localAIService.isLoading && !installed);
      setDownloadInfo(localAIService.downloadInfo);
    };

    checkStatus();

    const unsubscribe = localAIService.subscribe(async () => {
      setIsDownloading(localAIService.isLoading);
      setDownloadProgress(localAIService.downloadProgress);
      setDownloadInfo(localAIService.downloadInfo);

      const isInst = await localAIService.isModelInstalled();
      setIsInstalled(isInst);

      const enhanced = await localAIService.getEnhancedModels();
      setHasAnyDownloaded(enhanced.some(m => m.isDownloaded));
    });

    return () => unsubscribe();
  }, [activeModel?.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const handleDownload = async () => {
    if (!activeModel) return;
    try {
      await localAIService.downloadModel(activeModel);
      await localAIService.init();
      setIsInstalled(true);
    } catch (e: any) {
      alert("Failed to download or initialize the model: " + e.message);
    }
  };



  const clearChat = async () => {
    if (confirm("Clear this chat session?")) {
      setMessages([]);
      setIsGenerating(false);
      setIsInitializing(false);
      try {
        await localAIService.clearSession();
      } catch (e) {
        console.error("Failed to clear backend session:", e);
      }
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || isGenerating) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setDraft("");
    setIsGenerating(true);

    try {
      if (!localAIService.isLoaded) {
        setIsInitializing(true);
        await localAIService.init();
        setIsInitializing(false);
      }

      const conversation = [newMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const tempId = (Date.now() + 1).toString();

      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
        },
      ]);

      const startMs = Date.now();

      let streamingContent = "";
      const response = await localAIService.generate(conversation, {
        maxNewTokens: 512,
        temperature: 0.7,
        onToken: (token) => {
          streamingContent += token;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId ? { ...m, content: streamingContent } : m
            )
          );
        },
      });

      const generationTimeMs = Date.now() - startMs;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, content: response, generationTimeMs } : m
        )
      );

    } catch (e: any) {
      setIsInitializing(false);
      console.error("Generation failed:", e);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "Sorry, I encountered an error while generating a response. " + (e.message || ""),
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const themeVars = {
    "--sc-bg-primary": colors.background.primary,
    "--sc-bg-secondary": colors.background.secondary,
    "--sc-surface-primary": colors.surface.primary,
    "--sc-text-primary": colors.text.primary,
    "--sc-text-secondary": colors.text.secondary,
    "--sc-text-inverse": colors.text.inverse,
    "--sc-border-subtle": colors.border.subtle,
    "--sc-primary-main": colors.primary.main,
    "--sc-status-error": colors.status.error,
  } as React.CSSProperties;

  return (
    <div className="local-llm-root" style={themeVars}>
      <div className="local-llm-header">
        <div className="local-llm-header-left">
          <button
            onClick={onBack}
            aria-label="Back"
            className="local-llm-back-icon-btn"
          >
            <IonIcon icon={arrowBackOutline} className="icon-18" />
          </button>
          <div className="local-llm-icon-wrap">
            <IonIcon
              icon={hardwareChipOutline}
              className="icon-20 icon-white"
            />
          </div>
          <div>
            <h2 className="local-llm-title">
              {isInstalled || hasAnyDownloaded === true
                ? (activeModel ? activeModel.name : "Local AI Agent")
                : "Local AI Agent"}
            </h2>
            <p className="local-llm-caption">Offline & Private Chat</p>
          </div>
        </div>

        {isInstalled && (
          <div className="local-llm-header-right">
            <button
              onClick={clearChat}
              aria-label="Clear chat"
              className="local-llm-action-btn"
              title="Clear Chat"
            >               <IonIcon icon={trashOutline} className="icon-20" />

            </button>

          </div>
        )}
      </div>

      {!activeModel ? (
        <div className="local-llm-locked" style={themeVars}>
          <div className="local-llm-locked-inner">
            <h2 className="sc-title">No Model Selected</h2>
            <p className="sc-subtitle" style={{ marginBottom: "20px" }}>
              Go to Settings &gt; Local AI to select and download an AI model.
            </p>
          </div>
        </div>
      ) : isInstalled === false && !isDownloading ? (
        hasAnyDownloaded === false ? (
          <div className="local-llm-locked" style={themeVars}>
            <div className="local-llm-locked-inner">
              <h2 className="sc-title">Enable Local AI</h2>
              <p className="sc-subtitle" style={{ marginBottom: "15px" }}>
                A Local Large Language Model (LLM) runs entirely on your device's processor. Unlike cloud AI, your chat text never leaves your phone, ensuring 100% privacy and unlocking fully offline capabilities.
              </p>
              <p className="sc-subtitle" style={{ marginBottom: "25px" }}>
                To begin chatting with an AI offline, please select and download a model of your preference from your settings.
              </p>
              <div className="local-llm-row" style={{ justifyContent: "center" }}>
                <button
                  onClick={onOpenSettings}
                  className="local-llm-btn-primary"
                  style={{ padding: "12px 24px" }}
                >
                  Open Local AI Settings
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="local-llm-locked" style={themeVars}>
            <div className="local-llm-locked-inner">
              <h2 className="sc-title">Download Required</h2>
              <p className="sc-subtitle" style={{ marginBottom: "20px" }}>
                To chat with {activeModel.name} entirely offline, you need to download this model according to your preference from the Settings.
              </p>
              <ul style={{ textAlign: "left", fontSize: "0.9rem", color: "var(--sc-text-secondary)", marginBottom: "30px" }}>
                <li>🔒 100% Private & Locally executed</li>
                <li>🚀 Works entirely offline</li>
                <li>🤖 {activeModel.description}</li>
              </ul>
              <div className="local-llm-row" style={{ justifyContent: "center" }}>
                <button
                  onClick={onOpenSettings}
                  className="local-llm-btn-primary"
                  style={{ padding: "12px 24px" }}
                >
                  Open Local AI Settings
                </button>
              </div>
            </div>
          </div>
        )
      ) : (isDownloading && !isInstalled) ? (
        <div className="local-llm-locked" style={themeVars}>
          <div className="local-llm-locked-inner">
            <h2 className="sc-title">Downloading AI Model</h2>
            <p className="sc-subtitle">Please wait, this might take a while depending on your internet connection...</p>
            <div style={{ marginTop: "30px", width: "100%", maxWidth: "300px", margin: "30px auto 0" }}>
              <div style={{ width: "100%", background: "var(--sc-surface-primary)", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ width: `${downloadProgress}%`, height: "100%", background: "var(--sc-primary-main)", transition: "width 0.3s ease" }}></div>
              </div>
              <p style={{ marginTop: "10px", fontSize: "0.9rem", color: "var(--sc-text-secondary)" }}>
                {downloadProgress}% Completed
              </p>
              {downloadInfo && (
                <p style={{ marginTop: "5px", fontSize: "0.8rem", color: "var(--sc-text-secondary)", opacity: 0.7 }}>
                  {Math.round(downloadInfo.bytes / 1024 / 1024)}MB / {Math.round(downloadInfo.total / 1024 / 1024)}MB
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="local-llm-content">
            {messages.length === 0 ? (
              <div className="local-llm-empty">
                <div className="local-llm-empty-icon-wrap">
                  <IonIcon
                    icon={hardwareChipOutline}
                    className="icon-32 icon-muted"
                  />
                </div>
                <p className="local-llm-empty-title">Start a Conversation</p>
                <p className="local-llm-empty-subtitle">
                  Feel free to ask {activeModel.name} anything.
                  <br />Note: Your messages are only saved until you close the app.
                </p>
              </div>
            ) : (
              <div className="local-llm-messages">
                {messages.map((m) => (
                  <div key={m.id} className={`llm-msg-wrapper ${m.role}`}>
                    <div className={`llm-msg-container ${m.role}`}>
                      <div className={`llm-msg-bubble ${m.role}`}>
                        {m.content}
                        {m.role === "assistant" && m.content === "" && (
                          <span className="llm-cursor"></span>
                        )}
                      </div>
                      {m.role === "assistant" && m.content !== "" && (
                        <div className="llm-msg-footer">
                          {m.generationTimeMs && (
                            <span className="llm-generation-time">
                              ⏱ {(m.generationTimeMs / 1000).toFixed(2)}s
                            </span>
                          )}
                          <button
                            onClick={() => handleCopy(m.content, m.id)}
                            className="llm-copy-btn"
                            title="Copy response"
                          >
                            <IonIcon icon={copiedId === m.id ? checkmarkOutline : copyOutline} className="icon-14" />
                            <span>{copiedId === m.id ? "Copied" : "Copy"}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="local-llm-composer">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isInitializing ? "Loading AI Model to Memory..." : (isGenerating ? "AI is thinking..." : "Type a message...")}
              className="local-llm-message-input"
              disabled={isGenerating || isInitializing}
            />

            <button
              onClick={handleSend}
              disabled={!draft.trim() || isGenerating}
              aria-label="Send message"
              className="local-llm-send-btn"
            >
              <IonIcon icon={paperPlaneOutline} className="icon-18" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};
