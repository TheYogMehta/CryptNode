require("./rt/electron-rt");
//////////////////////////////
// User Defined Preload scripts below
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("SafeStorage", {
  AppLock: (hashPass: string, oldHashpass: string | null) =>
    ipcRenderer.invoke("SafeStorage:AppLock", hashPass, oldHashpass),
  verifylock: (hashPass: string | null) =>
    ipcRenderer.invoke("SafeStorage:verifylock", hashPass),
  getKey: (key: string) => ipcRenderer.invoke("SafeStorage:getKey", key),
  setKey: (key: string, value: string) =>
    ipcRenderer.invoke("SafeStorage:setKey", key, value),
  ToggleAppLock: (enabled: boolean) =>
    ipcRenderer.invoke("SafeStorage:ToggleAppLock", enabled),
  initlock: () => ipcRenderer.invoke("SafeStorage:initlock"),
  googleLogin: () => ipcRenderer.invoke("GoogleLogin"),
});

contextBridge.exposeInMainWorld("TorManager", {
  initTor: () => ipcRenderer.invoke("TorManager:initTor"),
  onLog: (callback: (log: string) => void) => {
    ipcRenderer.on("tor:log", (_event, value) => callback(value));
  },
});
