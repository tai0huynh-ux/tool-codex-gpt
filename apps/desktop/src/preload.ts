import type { LocalTransportOperation } from '@codex-context-bridge/contracts';
import { contextBridge, ipcRenderer } from 'electron';
import {
  desktopIpcChannels,
  transportOperationResponseSchema,
  transportStatusResponseSchema,
  type TransportOperationResponse,
  type TransportStatusResponse,
} from './ipc';

export interface ContextBridgeDesktopApi {
  getTransportStatus(): Promise<TransportStatusResponse>;
  executeTransportOperation(
    operation: LocalTransportOperation,
  ): Promise<TransportOperationResponse>;
}

const api: ContextBridgeDesktopApi = {
  getTransportStatus: async () =>
    transportStatusResponseSchema.parse(
      (await ipcRenderer.invoke(desktopIpcChannels.getTransportStatus)) as unknown,
    ),
  executeTransportOperation: async (operation) =>
    transportOperationResponseSchema.parse(
      (await ipcRenderer.invoke(
        desktopIpcChannels.executeTransportOperation,
        operation,
      )) as unknown,
    ),
};

contextBridge.exposeInMainWorld('contextBridgeDesktop', api);
contextBridge.exposeInMainWorld('contextBridgeInfo', {
  phase: 'transport',
  assistedMode: true,
});
