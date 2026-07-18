import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendAuditEvent,
  openDatabase,
  type SqliteDatabase,
} from '@codex-context-bridge/database';
import { ProjectRegistry } from '@codex-context-bridge/project-registry';
import { WorkflowEngine } from '@codex-context-bridge/workflow-engine';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { registerDesktopIpc } from './ipc';
import { backupDatabaseBeforeUpgrade } from './database-backup';
import {
  createNativeDesktopBridgeService,
  ensureNativeCapability,
  nativeTransportPaths,
} from './native-transport';
import { createProjectDesktopService, registerProjectIpc } from './project-ipc';
import { createWorkflowDesktopService, registerWorkflowIpc } from './workflow-ipc';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const trustedRendererIds = new Set<number>();
let projectDatabase: SqliteDatabase | undefined;

const applicationDataOverride = process.env.CODEX_CONTEXT_BRIDGE_APP_DATA;
if (applicationDataOverride) app.setPath('appData', path.resolve(applicationDataOverride));

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

function auditDesktopTransfer(operation: string, outcome: 'allowed' | 'blocked' | 'failed'): void {
  if (!projectDatabase) return;
  appendAuditEvent(projectDatabase, {
    id: randomUUID(),
    eventType: `desktop.transport.${operation}`,
    actor: 'desktop.ipc',
    outcome,
  });
}

async function startDesktop(): Promise<void> {
  await app.whenReady();
  const databasePath = path.join(app.getPath('userData'), 'context-bridge.sqlite');
  backupDatabaseBeforeUpgrade(databasePath, app.getVersion());
  projectDatabase = openDatabase(databasePath);
  const transportPaths = nativeTransportPaths(app.getPath('appData'));
  ensureNativeCapability(transportPaths.capabilityPath);
  registerDesktopIpc(
    ipcMain,
    createNativeDesktopBridgeService({
      ...transportPaths,
      permissionActive: true,
    }),
    {
      validateSender: (event) => trustedRendererIds.has(event.sender.id),
      audit: ({ operation, outcome }) =>
        auditDesktopTransfer(operation, outcome === 'accepted' ? 'allowed' : 'blocked'),
    },
  );
  const registry = new ProjectRegistry(projectDatabase);
  const workflows = new WorkflowEngine(projectDatabase);
  registerProjectIpc(
    ipcMain,
    createProjectDesktopService(registry, async () => {
      const selection = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      return selection.canceled ? null : (selection.filePaths[0] ?? null);
    }),
    {
      validateSender: (event) => trustedRendererIds.has(event.sender.id),
      audit: ({ action, outcome }) => {
        auditDesktopTransfer(action, outcome);
      },
    },
  );
  registerWorkflowIpc(ipcMain, createWorkflowDesktopService(projectDatabase, workflows), {
    validateSender: (event) => trustedRendererIds.has(event.sender.id),
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on('before-quit', () => {
    projectDatabase?.close();
    projectDatabase = undefined;
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

void startDesktop().catch((error: unknown) => {
  console.error('DESKTOP_START_FAILED', error);
  app.quit();
});
