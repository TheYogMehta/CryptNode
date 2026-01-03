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
});
