declare module "@start9labs/capacitor-tor" {
  export interface TorPlugin {
    start(): Promise<void>;
    stop(): Promise<void>;
  }
  export const Tor: TorPlugin;
}
