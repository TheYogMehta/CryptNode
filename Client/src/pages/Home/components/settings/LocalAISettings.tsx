import React, { useState, useEffect } from "react";
import { colors } from "../../../../theme/design-system";
import { localAIService } from "../../../../services/ai/localAI.service";
import { RECOMMENDED_MODELS, LocalAIModel } from "../../../../services/ai/models";

export const LocalAISettings = () => {
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState(localAIService.downloadInfo);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [installedModels, setInstalledModels] = useState<Record<string, boolean>>({});
  const [customUrl, setCustomUrl] = useState("");
  const [warningModel, setWarningModel] = useState<LocalAIModel | null>(null);
  const [editingParams, setEditingParams] = useState<{id: string, name: string, description: string} | null>(null);
  const [renderTick, setRenderTick] = useState(0);

  useEffect(() => {
    const fetchState = async () => {
      setActiveModelId(localAIService.activeModelId);
      const installed: Record<string, boolean> = {};
      for (const model of RECOMMENDED_MODELS) {
        installed[model.id] = await localAIService.isModelInstalled(model.id);
      }
      for (const model of localAIService.storedModels) {
        if (!installed[model.id]) {
          installed[model.id] = await localAIService.isModelInstalled(model.id);
        }
      }
      setInstalledModels(installed);
    };
    fetchState();

    const unsubscribe = localAIService.subscribe(() => {
      setIsDownloading(localAIService.isLoading);
      setDownloadProgress(localAIService.downloadProgress);
      setDownloadInfo(localAIService.downloadInfo);
      setRenderTick(t => t + 1);
      fetchState();
    });

    return () => unsubscribe();
  }, []);

  const handleDownload = async (model: LocalAIModel) => {
    if (model.sizeBytes > 2 * 1024 * 1024 * 1024) {
      setWarningModel(model);
      return;
    }
    startDownload(model);
  };

  const startDownload = async (model: LocalAIModel) => {
    setWarningModel(null);
    try {
      await localAIService.downloadModel(model);
      await localAIService.init();
    } catch (e: any) {
      alert("Failed to download or initialize the model: " + e.message);
    }
  };

  const handleDelete = async (modelId: string) => {
    if (confirm("Are you sure you want to delete this model?")) {
      await localAIService.deleteModel(modelId);
    }
  };

  const handleRemoveCustom = async (modelId: string) => {
    if (confirm("Are you sure you want to fully remove this custom model from your library? (This will also delete the downloaded file if it exists).")) {
      await localAIService.removeModelFromLibrary(modelId);
      // Wait for it to drop, also let's just do a tiny local state cleanup so it vanishes instantly
      setInstalledModels(prev => {
        const next = {...prev};
        delete next[modelId];
        return next;
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingParams) return;
    if (!editingParams.name.trim()) return;
    await localAIService.updateModelMetadata(editingParams.id, editingParams.name.trim(), editingParams.description.trim());
    setEditingParams(null);
  };

  const handleSetActive = async (modelId: string) => {
    try {
      await localAIService.setActiveModel(modelId);
      await localAIService.init();
    } catch (e: any) {
      alert("Failed to set active model: " + e.message);
    }
  };

  const handleAddCustom = async () => {
    if (!customUrl.trim()) return;
    try {
      // Basic check
      let finalUrl = customUrl.trim();
      new URL(finalUrl);

      // Auto-correct Hugging Face /blob/ URLs to /resolve/ for direct download
      if (finalUrl.includes("huggingface.co") && finalUrl.includes("/blob/")) {
        finalUrl = finalUrl.replace("/blob/", "/resolve/");
      }

      // Extract a reasonable filename
      const urlParts = finalUrl.split("/");
      const customFilename = urlParts[urlParts.length - 1] || "custom_model.gguf";
      const customName = customFilename.replace(".gguf", "").replace(/[-_]/g, " ") || "Custom Model";

      const newModel: LocalAIModel = {
        id: "custom-" + Date.now(),
        name: customName,
        description: "User added GGUF model",
        hfUrl: finalUrl,
        filename: customFilename,
        sizeBytes: 0, // Unknown
      };

      await localAIService.addModelToLibrary(newModel);
      setCustomUrl("");
      // Refresh to show newly added model
      setInstalledModels(prev => ({...prev, [newModel.id]: false}));
    } catch {
      alert("Please enter a valid URL.");
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return "Unknown Size";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const allModels = [...RECOMMENDED_MODELS, ...localAIService.storedModels.filter((m: any) => !RECOMMENDED_MODELS.find((r: any) => r.id === m.id))];

  return (
    <div>
      <h3 style={{ color: colors.text.primary, marginBottom: "16px" }}>Local AI Models</h3>
      
      {isDownloading && downloadInfo && (
        <div style={{ marginBottom: "20px", padding: "16px", background: colors.background.secondary, borderRadius: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px", color: colors.text.secondary }}>
            <span>Downloading {allModels.find(m => m.id === downloadInfo.activeModelId)?.name || "Model"}...</span>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
               <span>{downloadProgress}%</span>
               <button 
                 onClick={() => localAIService.abortDownload()}
                 style={{ padding: "2px 6px", background: "transparent", border: `1px solid #ef4444`, color: "#ef4444", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}
               >
                 Cancel
               </button>
            </div>
          </div>
          <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ width: `${downloadProgress}%`, height: "100%", background: colors.primary.main, transition: "width 0.2s ease" }} />
          </div>
          <div style={{ marginTop: "4px", fontSize: "12px", color: colors.text.tertiary, textAlign: "right" }}>
            {formatBytes(downloadInfo.bytes)} / {formatBytes(downloadInfo.total)}
          </div>
        </div>
      )}

      {warningModel && (
         <div style={{ marginBottom: "20px", padding: "16px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px" }}>
            <h4 style={{ color: "#ef4444", margin: "0 0 8px 0" }}>⚠️ Large Model Warning</h4>
            <p style={{ color: colors.text.primary, fontSize: "14px", margin: "0 0 16px 0", lineHeight: "1.5" }}>
               You are about to download <strong>{warningModel.name}</strong>, which is <strong>{formatBytes(warningModel.sizeBytes)}</strong>. 
               Large models may cause your device to run out of memory, crash the app, or drain your battery quickly. 
               Are you sure you want to proceed?
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
               <button 
                 onClick={() => startDownload(warningModel)}
                 style={{ padding: "8px 16px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: 500 }}
               >
                 Yes, Download Anyway
               </button>
               <button 
                 onClick={() => setWarningModel(null)}
                 style={{ padding: "8px 16px", background: "transparent", color: colors.text.primary, border: `1px solid ${colors.border.subtle}`, borderRadius: "4px", cursor: "pointer" }}
               >
                 Cancel
               </button>
            </div>
         </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {allModels.map(model => {
          const installed = installedModels[model.id];
          const isActive = activeModelId === model.id;
          const isCustom = !RECOMMENDED_MODELS.find(r => r.id === model.id);
          const isEditing = editingParams?.id === model.id;
          
          return (
            <div key={model.id} style={{ padding: "16px", background: colors.surface.primary, borderRadius: "8px", border: `1px solid ${isActive ? colors.primary.main : colors.border.subtle}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div style={{ flex: 1, marginRight: "12px" }}>
                  {isEditing ? (
                     <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "8px" }}>
                        <input 
                           type="text" 
                           value={editingParams.name} 
                           onChange={e => setEditingParams({...editingParams, name: e.target.value})}
                           style={{ padding: "6px", background: colors.background.primary, border: `1px solid ${colors.border.subtle}`, color: colors.text.primary, borderRadius: "4px", fontSize: "14px" }}
                        />
                     </div>
                  ) : (
                    <>
                      <h4 style={{ margin: 0, color: colors.text.primary, display: "flex", alignItems: "center", gap: "8px" }}>
                        {model.name}
                        {isActive && <span style={{ fontSize: "11px", padding: "2px 6px", background: colors.primary.main, color: "#fff", borderRadius: "100px" }}>Active</span>}
                        {isCustom && <span style={{ fontSize: "11px", padding: "2px 6px", background: colors.border.subtle, color: colors.text.secondary, borderRadius: "100px" }}>Custom</span>}
                      </h4>
                      <div style={{ fontSize: "12px", color: colors.text.tertiary, marginTop: "4px" }}>
                        Size: {formatBytes(model.sizeBytes)}{isCustom && model.sizeBytes === 0 && " (Unknown until downloaded)"}
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {isEditing ? (
                       <>
                         <button onClick={handleSaveEdit} style={{ padding: "6px 12px", background: colors.primary.main, color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "13px" }}>Save</button>
                         <button onClick={() => setEditingParams(null)} style={{ padding: "6px 12px", background: "transparent", color: colors.text.primary, border: `1px solid ${colors.border.subtle}`, borderRadius: "4px", cursor: "pointer", fontSize: "13px" }}>Cancel</button>
                       </>
                    ) : (
                       <>
                         {isCustom && !isDownloading && (
                           <button 
                             onClick={() => setEditingParams({ id: model.id, name: model.name, description: model.description || "" })}
                             style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${colors.border.subtle}`, color: colors.text.secondary, borderRadius: "4px", cursor: "pointer", fontSize: "13px" }}
                           >
                             Edit
                           </button>
                         )}
                         {installed && !isActive && (
                           <button 
                             onClick={() => handleSetActive(model.id)}
                             style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${colors.primary.main}`, color: colors.primary.main, borderRadius: "4px", cursor: "pointer", fontSize: "13px" }}
                           >
                             Use
                           </button>
                         )}
                         {installed && (
                           <button 
                              onClick={() => handleDelete(model.id)}
                              style={{ padding: "6px 12px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "#ef4444", borderRadius: "4px", cursor: "pointer", fontSize: "13px" }}
                           >
                              Delete File
                           </button>
                         )}
                         {!installed && (
                           <button 
                             onClick={() => handleDownload(model)}
                             disabled={isDownloading}
                             style={{ padding: "6px 16px", background: colors.primary.main, color: "#fff", border: "none", borderRadius: "4px", cursor: isDownloading ? "not-allowed" : "pointer", fontSize: "13px", opacity: isDownloading ? 0.5 : 1 }}
                           >
                             Download
                           </button>
                         )}
                         {isCustom && (
                           <button 
                              onClick={() => handleRemoveCustom(model.id)}
                              style={{ padding: "6px 12px", background: "transparent", border: `1px solid #ef4444`, color: "#ef4444", borderRadius: "4px", cursor: "pointer", fontSize: "13px" }}
                              title="Remove completely from library"
                           >
                              Remove
                           </button>
                         )}
                       </>
                    )}
                  </div>
                </div>
              </div>
              
              {isEditing ? (
                 <textarea 
                    value={editingParams.description}
                    onChange={e => setEditingParams({...editingParams, description: e.target.value})}
                    placeholder="Model description..."
                    style={{ width: "100%", padding: "6px", background: colors.background.primary, border: `1px solid ${colors.border.subtle}`, color: colors.text.primary, borderRadius: "4px", fontSize: "13px", minHeight: "60px", resize: "vertical" }}
                 />
              ) : (
                <p style={{ margin: 0, fontSize: "13px", color: colors.text.secondary, lineHeight: "1.5" }}>
                  {model.description}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "32px", padding: "16px", background: colors.background.secondary, borderRadius: "8px" }}>
        <h4 style={{ margin: "0 0 12px 0", color: colors.text.primary }}>Add Custom Model</h4>
        <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: colors.text.secondary }}>
          Provide a direct URL to a GGUF format model on HuggingFace or another source.
        </p>
        <div style={{ display: "flex", gap: "8px" }}>
           <input 
             type="url" 
             value={customUrl}
             onChange={e => setCustomUrl(e.target.value)}
             placeholder="https://huggingface.co/.../model.gguf"
             style={{ flex: 1, padding: "8px 12px", borderRadius: "4px", border: `1px solid ${colors.border.subtle}`, background: colors.background.primary, color: colors.text.primary }}
           />
           <button 
             onClick={handleAddCustom}
             disabled={!customUrl || isDownloading}
             style={{ padding: "8px 16px", background: colors.primary.main, border: "none", borderRadius: "4px", color: "#fff", cursor: (!customUrl || isDownloading) ? "not-allowed" : "pointer", opacity: (!customUrl || isDownloading) ? 0.5 : 1 }}
           >
             Add
           </button>
        </div>
      </div>
    </div>
  );
};
