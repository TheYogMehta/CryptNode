import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { FolderOpen } from "lucide-react";
import { colors } from "../../../../theme/design-system";
import { localAIService } from "../../../../services/ai/localAI.service";
import { RECOMMENDED_MODELS, LocalAIModel } from "../../../../services/ai/models";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";

export const LocalAISettings = () => {
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState(localAIService.downloadInfo);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [installedModels, setInstalledModels] = useState<Record<string, boolean>>({});
  const [customUrl, setCustomUrl] = useState("");
  const [warningModel, setWarningModel] = useState<LocalAIModel | null>(null);
  const [editingParams, setEditingParams] = useState<{id: string, name: string, description: string} | null>(null);
  const [downloadFolder, setDownloadFolder] = useState<string>("");
  const [deleteModelId, setDeleteModelId] = useState<string | null>(null);
  const [removeModelId, setRemoveModelId] = useState<string | null>(null);
  const [isDeletingModel, setIsDeletingModel] = useState(false);
  const [isRemovingModel, setIsRemovingModel] = useState(false);

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

    // Resolve the download folder path once
    localAIService.getDownloadFolderPath().then(setDownloadFolder);

    const unsubscribe = localAIService.subscribe(() => {
      setIsDownloading(localAIService.isLoading);
      setDownloadProgress(localAIService.downloadProgress);
      setDownloadInfo(localAIService.downloadInfo);
      fetchState();
    });

    return () => unsubscribe();
  }, []);

  const handleDownload = async (model: LocalAIModel) => {

    if (model.sizeBytes > 2 * 1024 * 1024 * 1024 || model.sizeBytes === 0) {
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
      toast.success(`${model.name} is ready to use.`);
    } catch (e: any) {
      toast.error(`Failed to download ${model.name}: ${e.message}`);
    }
  };

  const handleDelete = async (modelId: string) => {
    setDeleteModelId(modelId);
  };

  const confirmDelete = async () => {
    if (!deleteModelId) return;
    setIsDeletingModel(true);
    try {
      await localAIService.deleteModel(deleteModelId);
      toast.success("Model file deleted.");
      setDeleteModelId(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete model file.");
    } finally {
      setIsDeletingModel(false);
    }
  };

  const handleRemoveCustom = async (modelId: string) => {
    setRemoveModelId(modelId);
  };

  const confirmRemoveCustom = async () => {
    if (!removeModelId) return;
    setIsRemovingModel(true);
    try {
      await localAIService.removeModelFromLibrary(removeModelId);
      // Wait for it to drop, also let's just do a tiny local state cleanup so it vanishes instantly
      setInstalledModels(prev => {
        const next = {...prev};
        delete next[removeModelId];
        return next;
      });
      toast.success("Custom model removed from your library.");
      setRemoveModelId(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove custom model.");
    } finally {
      setIsRemovingModel(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingParams) return;
    if (!editingParams.name.trim()) return;
    try {
      await localAIService.updateModelMetadata(editingParams.id, editingParams.name.trim(), editingParams.description.trim());
      setEditingParams(null);
      toast.success("Model details updated.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update model details.");
    }
  };

  const handleSetActive = async (modelId: string) => {
    try {
      await localAIService.setActiveModel(modelId);
      await localAIService.init();
      toast.success("Active model updated.");
    } catch (e: any) {
      toast.error("Failed to set active model: " + e.message);
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
      toast.success("Custom model added to your library.");
    } catch {
      toast.error("Please enter a valid direct GGUF URL.");
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return "Unknown Size";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const handleOpenFolder = async () => {
    if (!downloadFolder) return;
    if (!window.electron?.openPath) {
      toast.error("Opening the model folder is only supported in the desktop app.");
      return;
    }

    try {
      const opened = await window.electron.openPath(downloadFolder);
      if (!opened) {
        toast.error("Failed to open the model folder.");
      }
    } catch (e) {
      console.error("Failed to open download folder", e);
      toast.error("Failed to open the model folder.");
    }
  };

  const allModels = [...RECOMMENDED_MODELS, ...localAIService.storedModels.filter((m: any) => !RECOMMENDED_MODELS.find((r: any) => r.id === m.id))];
  const deleteTarget = allModels.find((model) => model.id === deleteModelId) || null;
  const removeTarget = allModels.find((model) => model.id === removeModelId) || null;

  const folderDisplay = downloadFolder || '...';

  return (
    <div>
      <h3 style={{ color: colors.text.primary, marginBottom: "16px" }}>Local AI Models</h3>

      {/* Download Folder Row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        marginBottom: "20px",
        background: colors.background.secondary,
        borderRadius: "8px",
        border: `1px solid ${colors.border.subtle}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>📁</span>
          <span style={{ fontSize: "13px", color: colors.text.secondary }}>Download Folder</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0, justifyContent: "flex-end" }}>
          <span
            title={folderDisplay}
            style={{
              fontSize: "12px",
              color: colors.text.primary,
              fontFamily: "monospace",
              background: colors.surface.primary,
              padding: "3px 8px",
              borderRadius: "4px",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              direction: "rtl",
              textAlign: "left",
            }}
          >
            {folderDisplay}
          </span>
          <button
            onClick={handleOpenFolder}
            title="Open folder"
            style={{
              background: colors.surface.primary,
              border: `1px solid ${colors.border.subtle}`,
              cursor: "pointer",
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              justifyContent: "center",
              borderRadius: "8px",
              color: colors.text.secondary,
              transition: "all 0.2s ease",
              flexShrink: 0,
            }}
          >
            <FolderOpen size={14} />
            <span style={{ fontSize: "12px", fontWeight: 500 }}>Open Folder</span>
          </button>
        </div>
      </div>
      
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

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {allModels.map(model => {
          const installed = installedModels[model.id];
          const isActive = activeModelId === model.id && installed;
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
      <ConfirmDialog
        open={!!warningModel}
        title={`Download ${warningModel?.name || "this model"}?`}
        description={
          warningModel ? (
            <>
              This model is <strong>{formatBytes(warningModel.sizeBytes)}</strong>
              {warningModel.sizeBytes === 0
                ? ", or its size could not be determined."
                : "."}{" "}
              Large downloads can consume a lot of storage and memory on this device.
            </>
          ) : undefined
        }
        confirmLabel="Download Anyway"
        cancelLabel="Cancel"
        tone="danger"
        badgeLabel="Large Download"
        onCancel={() => setWarningModel(null)}
        onConfirm={() => {
          if (warningModel) {
            startDownload(warningModel);
          }
        }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.name || "this model"}?`}
        description="This removes the downloaded model file from this device. You can download it again later."
        confirmLabel="Delete File"
        tone="danger"
        badgeLabel="Model File"
        isLoading={isDeletingModel}
        onCancel={() => setDeleteModelId(null)}
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={!!removeTarget}
        title={`Remove ${removeTarget?.name || "this model"} from your library?`}
        description="This removes the custom model entry and also deletes its downloaded file if it exists."
        confirmLabel="Remove Model"
        tone="danger"
        badgeLabel="Custom Model"
        isLoading={isRemovingModel}
        onCancel={() => setRemoveModelId(null)}
        onConfirm={confirmRemoveCustom}
      />
    </div>
  );
};
