import React, { useState, useEffect, useRef } from "react";
import { IonIcon } from "@ionic/react";
import {
  arrowBackOutline,
  hardwareChipOutline,
  trashOutline,
  paperPlaneOutline,
  downloadOutline,
  closeCircleOutline,
} from "ionicons/icons";
import { qwenLocalService } from "../../services/ai/qwenLocal.service";
import { colors } from "../../../src/theme/design-system";
import "./LocalLLMChatWindow.css";

interface LocalLLMChatWindowProps {
  onBack?: () => void;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export const LocalLLMChatWindow: React.FC<LocalLLMChatWindowProps> = ({
  onBack,
}) => {
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync service state
  useEffect(() => {
    const checkStatus = async () => {
      const installed = await qwenLocalService.isModelInstalled();
      setIsInstalled(installed);
      setDownloadProgress(qwenLocalService.downloadProgress);
      setIsDownloading(qwenLocalService.isLoading && !installed);
    };

    checkStatus();

    const unsubscribe = qwenLocalService.subscribe(() => {
      setIsDownloading(qwenLocalService.isLoading && !qwenLocalService.isLoaded);
      setDownloadProgress(qwenLocalService.downloadProgress);
      if (qwenLocalService.isLoaded || qwenLocalService.installedSize > 0) {
        setIsInstalled(true);
      } else {
         setIsInstalled(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const handleDownload = async () => {
    try {
      await qwenLocalService.downloadModel();
      await qwenLocalService.init();
      setIsInstalled(true);
    } catch (e: any) {
      alert("Failed to download or initialize the model: " + e.message);
    }
  };

  const handleDeleteModel = async () => {
    if (confirm("Are you sure you want to delete the local AI model from your device?")) {
      await qwenLocalService.deleteModel();
      setIsInstalled(false);
      setMessages([]);
    }
  };

  const clearChat = () => {
    if (confirm("Clear this chat session?")) {
      setMessages([]);
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
      if (!qwenLocalService.isLoaded) {
        await qwenLocalService.init();
      }

      const conversation = [...messages, newMessage].map((m) => ({
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
      const response = await qwenLocalService.generate(conversation, {
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
      
      setMessages((prev) => 
          prev.map((m) => 
             m.id === tempId ? { ...m, content: response } : m
          )
      );
      
    } catch (e: any) {
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
            <h2 className="local-llm-title">Local AI Agent</h2>
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
             >
               <IonIcon icon={closeCircleOutline} className="icon-22" />
             </button>
             <button
               onClick={handleDeleteModel}
               aria-label="Delete model"
               className="local-llm-action-btn danger"
               title="Delete Model from Device"
             >
               <IonIcon icon={trashOutline} className="icon-20" />
             </button>
          </div>
        )}
      </div>

      {isInstalled === false && !isDownloading ? (
        <div className="local-llm-locked" style={themeVars}>
           <div className="local-llm-locked-inner">
             <h2 className="sc-title">Download Required</h2>
             <p className="sc-subtitle" style={{marginBottom: "20px"}}>
               To chat with the Local AI Agent entirely offline, you need to download the AI model ({Math.round(qwenLocalService.requiredSize / 1024 / 1024)} MB).
             </p>
             <ul style={{textAlign: "left", fontSize: "0.9rem", color: "var(--sc-text-secondary)", marginBottom: "30px"}}>
               <li>🔒 100% Private & Locally executed</li>
               <li>🚀 Works entirely offline</li>
               <li>🤖 Based on Qwen 0.8B architecture</li>
             </ul>
             <div className="local-llm-row" style={{justifyContent: "center"}}>
               <button
                 onClick={handleDownload}
                 className="local-llm-btn-primary"
                 style={{padding: "12px 24px"}}
               >
                 <IonIcon icon={downloadOutline} style={{marginRight: "8px", verticalAlign: "middle"}}/> 
                 Download Model
               </button>
             </div>
           </div>
        </div>
      ) : (isDownloading && !isInstalled) ? (
          <div className="local-llm-locked" style={themeVars}>
             <div className="local-llm-locked-inner">
                 <h2 className="sc-title">Downloading AI Model</h2>
                 <p className="sc-subtitle">Please wait, this might take a while depending on your internet connection...</p>
                 <div style={{marginTop: "30px", width: "100%", maxWidth: "300px", margin: "30px auto 0"}}>
                    <div style={{width: "100%", background: "var(--sc-surface-primary)", height: "8px", borderRadius: "4px", overflow: "hidden"}}>
                        <div style={{width: `${downloadProgress}%`, height: "100%", background: "var(--sc-primary-main)", transition: "width 0.3s ease"}}></div>
                    </div>
                    <p style={{marginTop: "10px", fontSize: "0.9rem", color: "var(--sc-text-secondary)"}}>
                        {downloadProgress}% Completed
                    </p>
                    <p style={{marginTop: "5px", fontSize: "0.8rem", color: "var(--sc-text-secondary)", opacity: 0.7}}>
                        {Math.round(qwenLocalService.downloadedBytes / 1024 / 1024)}MB / {Math.round(qwenLocalService.requiredSize / 1024 / 1024)}MB
                    </p>
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
                   Feel free to ask the Local AI Agent anything. 
                   <br/>Note: Your messages are only saved until you close the app.
                 </p>
               </div>
            ) : (
               <div className="local-llm-messages">
                 {messages.map((m) => (
                    <div key={m.id} className={`llm-msg-wrapper ${m.role}`}>
                       <div className={`llm-msg-bubble ${m.role}`}>
                         {m.content}
                         {m.role === "assistant" && m.content === "" && (
                             <span className="llm-cursor"></span>
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
              placeholder={isGenerating ? "AI is thinking..." : "Type a message..."}
              className="local-llm-message-input"
              disabled={isGenerating}
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
