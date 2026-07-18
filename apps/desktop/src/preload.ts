import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('contextBridgeInfo', {
  phase: 'foundation',
  assistedMode: true,
});
