import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendAuditEvent,
  openDatabase,
  type SqliteDatabase,
} from '@codex-context-bridge/database';
import { ProjectRegistry } from '@codex-context-bridge/project-registry';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { registerDesktopIpc, type DesktopBridgeService } from './ipc';
import { createProjectDesktopService, registerProjectIpc } from './project-ipc';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const trustedRendererIds = new Set<number>();
let projectDatabase: SqliteDatabase | undefined;

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
  projectDatabase = openDatabase(path.join(app.getPath('userData'), 'context-bridge.sqlite'));
  const registry = new ProjectRegistry(projectDatabase);
  registerProjectIpc(
    ipcMain,
    createProjectDesktopService(registry, async () => {
      const selection = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      return selection.canceled ? null : (selection.filePaths[0] ?? null);
    }),
    {
      validateSender: (event) => trustedRendererIds.has(event.sender.id),
      audit: ({ action, outcome }) => {
        if (!projectDatabase) return;
        appendAuditEvent(projectDatabase, {
          id: randomUUID(),
          eventType: action,
          actor: 'desktop.ipc',
          outcome,
        });
      },
    },
  );
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  projectDatabase?.close();
  projectDatabase = undefined;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
