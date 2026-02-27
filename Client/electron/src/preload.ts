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
  getDesktopSources: () => ipcRenderer.invoke("get-desktop-sources"),
  openExternal: (url: string) => ipcRenderer.invoke("open-external-url", url),
});

contextBridge.exposeInMainWorld("envConfig", {
  USE_DEV_SOCKET: process.env.VITE_DEV_SOCKET === "1",
});
