import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { registerDesktopIpc, type DesktopBridgeService } from './ipc';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const trustedRendererIds = new Set<number>();

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1040,
    height: 720,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(currentDirectory, 'preload.js'),
    },
  });
  const rendererId = window.webContents.id;
  trustedRendererIds.add(rendererId);
  window.on('closed', () => trustedRendererIds.delete(rendererId));

  void window.loadFile(path.join(currentDirectory, '../renderer/index.html'));
}

const disconnectedService: DesktopBridgeService = {
  getStatus: () =>
    Promise.resolve({
      transport: 'native_messaging',
      state: 'disconnected',
      permissionActive: false,
    }),
  execute: () => Promise.reject(new Error('TRANSPORT_DISCONNECTED')),
};

void app.whenReady().then(() => {
  registerDesktopIpc(ipcMain, disconnectedService, {
    validateSender: (event) => trustedRendererIds.has(event.sender.id),
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
