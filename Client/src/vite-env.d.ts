/// <reference types="vite/client" />

interface Window {
  React?: typeof import("react");
  electron?: {
    getDesktopSources: () => Promise<any[]>;
    openExternal: (url: string) => Promise<boolean>;
  };
}

declare module "*?worker" {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
