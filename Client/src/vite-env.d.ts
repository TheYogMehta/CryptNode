/// <reference types="vite/client" />

interface Window {
  React?: typeof import("react");
  electron?: {
    openExternal: (url: string) => Promise<boolean>;
    openPath: (targetPath: string) => Promise<boolean>;
    saveToDownloads: (base64Data: string, originalName: string) => Promise<string>;
  };
}

declare module "*?worker" {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
