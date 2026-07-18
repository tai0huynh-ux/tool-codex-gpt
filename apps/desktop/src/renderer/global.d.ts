import type { ContextBridgeDesktopApi } from '../preload';

declare global {
  interface Window {
    contextBridgeDesktop: ContextBridgeDesktopApi;
    contextBridgeInfo: {
      phase: string;
      assistedMode: boolean;
    };
  }
}

export {};
