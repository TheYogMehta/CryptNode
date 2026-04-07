require("./rt/electron-rt");
//////////////////////////////
// User Defined Preload scripts below
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("SafeStorage", {
  getKey: (key: string) => ipcRenderer.invoke("SafeStorage:getKey", key),
  setKey: (key: string, value: string) =>
    ipcRenderer.invoke("SafeStorage:setKey", key, value),
  SetActiveUser: (hash: string | null) =>
    ipcRenderer.invoke("SafeStorage:SetActiveUser", hash),
  googleLogin: () => ipcRenderer.invoke("GoogleLogin"),
});

contextBridge.exposeInMainWorld("electron", {
  openExternal: (url: string) => ipcRenderer.invoke("open-external-url", url),
  openPath: (targetPath: string) => ipcRenderer.invoke("open-path", targetPath),
  saveToDownloads: (base64Data: string, originalName: string) =>
    ipcRenderer.invoke("save-to-downloads", { base64Data, originalName }),
  deleteDatabaseFiles: (dbName: string) =>
    ipcRenderer.invoke("DeleteDatabaseFiles", dbName),
});

contextBridge.exposeInMainWorld("envConfig", {
  USE_DEV_SOCKET: process.env.VITE_DEV_SOCKET === "1",
});

contextBridge.exposeInMainWorld("llama", {
  init: (modelPath: string) => ipcRenderer.invoke("llama:init", { modelPath }),
  generate: (prompt: string, options: any, id: string) =>
    ipcRenderer.invoke("llama:generate", { prompt, options, id }),
  onToken: (callback: (data: { id: string; token: string }) => void) => {
    // Wrap to safely pass data
    ipcRenderer.on("llama:token", (_event, data) => callback(data));
  },
  checkData: (filename: string) => ipcRenderer.invoke("llama:checkData", { filename }),
  delete: (filename: string) => ipcRenderer.invoke("llama:delete", { filename }),
  download: (url: string, filename: string, id: string) => ipcRenderer.invoke("llama:download", { url, filename, id }),
  cancelDownload: (id: string) => ipcRenderer.invoke("llama:cancel-download", { id }),
  clearChat: () => ipcRenderer.invoke("llama:clearChat"),
  onDownloadProgress: (callback: (data: { id: string; bytes: number; total: number }) => void) => {
    // We only attach this listener once if we can, or we can just send it out
    ipcRenderer.on("llama:download-progress", (_event, data) => callback(data));
  }
});
