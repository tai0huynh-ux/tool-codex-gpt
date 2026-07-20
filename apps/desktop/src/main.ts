import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  appendAuditEvent,
  openDatabase,
  type SqliteDatabase,
} from '@codex-context-bridge/database';
import { ProjectRegistry } from '@codex-context-bridge/project-registry';
import { canonicalizeRepositoryRoot } from '@codex-context-bridge/project-detector';
import { ResponseRouter } from '@codex-context-bridge/response-router';
import { SdkCodexAdapter } from '@codex-context-bridge/codex-adapter';
import { WorkflowEngine } from '@codex-context-bridge/workflow-engine';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { registerDesktopIpc } from './ipc';
import { backupDatabaseBeforeUpgrade } from './database-backup';
import {
  createNativeDesktopBridgeService,
  ensureNativeCapability,
  nativeTransportPaths,
} from './native-transport';
import {
  createProjectDesktopService,
  registerProjectIpc,
  validateGitRepositoryInput,
} from './project-ipc';
import { createWorkflowDesktopService, registerWorkflowIpc } from './workflow-ipc';
import { createPilotDesktopService, registerPilotIpc } from './pilot-ipc';
import { ensureChatGptPageReadable } from './chatgpt-page-recovery';
import { captureGitChangeBaseline, createCodexChangeBundle } from './codex-change-bundle';
import { readCodexLocalCatalog, syncCodexLocalCatalog } from './codex-local-catalog';
import { createChatHistoryTransferBundle } from './chat-history-transfer';

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
      preload: path.join(currentDirectory, 'preload.cjs'),
    },
  });
  const rendererId = window.webContents.id;
  trustedRendererIds.add(rendererId);
  window.on('closed', () => trustedRendererIds.delete(rendererId));

  void window.loadFile(path.join(currentDirectory, '../renderer/index.html'));
}

async function openWebsitePreview(repositoryRoot: string): Promise<void> {
  const indexPath = path.join(repositoryRoot, 'index.html');
  const allowedUrl = pathToFileURL(indexPath).href;
  const preview = new BrowserWindow({
    width: 960,
    height: 720,
    title: 'Context Bridge Website Preview',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: false,
      partition: `pilot-preview-${randomUUID()}`,
    },
  });
  preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  preview.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl !== allowedUrl) event.preventDefault();
  });
  preview.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  preview.webContents.session.on('will-download', (event) => event.preventDefault());
  await preview.loadFile(indexPath);
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
  const bridge = createNativeDesktopBridgeService({
    ...transportPaths,
    permissionActive: true,
  });
  registerDesktopIpc(ipcMain, bridge, {
    validateSender: (event) => trustedRendererIds.has(event.sender.id),
    audit: ({ operation, outcome }) =>
      auditDesktopTransfer(operation, outcome === 'accepted' ? 'allowed' : 'blocked'),
  });
  const registry = new ProjectRegistry(projectDatabase);
  const workflows = new WorkflowEngine(projectDatabase);
  const codex = new SdkCodexAdapter({
    resolveThread: (externalThreadId) => {
      for (const project of registry.list()) {
        const mapping = registry
          .listCodexThreads(project.id)
          .find((candidate) => candidate.externalThreadId === externalThreadId);
        if (!mapping) continue;
        const repository = registry
          .listRepositories(project.id)
          .find((candidate) => candidate.fingerprint === mapping.repositoryFingerprint);
        if (!repository) return undefined;
        return {
          projectId: project.id,
          repositoryFingerprint: repository.fingerprint,
          workingDirectory: repository.worktreeRoot ?? repository.canonicalRoot,
        };
      }
      return undefined;
    },
    validateWorkspaceWrite: ({ projectId, repositoryFingerprint, canonicalRoot }) => {
      const repository = registry
        .listRepositories(projectId)
        .find((candidate) => candidate.fingerprint === repositoryFingerprint);
      if (
        !repository ||
        canonicalizeRepositoryRoot(canonicalRoot) !==
          canonicalizeRepositoryRoot(repository.worktreeRoot ?? repository.canonicalRoot)
      ) {
        throw new Error('CODEX_WORKSPACE_IDENTITY_MISMATCH');
      }
    },
  });
  const router = new ResponseRouter(projectDatabase, workflows, registry, codex);
  const ensureChatGptPage = async (
    destination: Parameters<typeof ensureChatGptPageReadable>[0]['destination'],
    options: { allowOpenExternal?: boolean } = {},
  ): Promise<void> => {
    await ensureChatGptPageReadable({
      bridge,
      destination,
      openExternal: (url) => shell.openExternal(url),
      ...(options.allowOpenExternal === undefined
        ? {}
        : { allowOpenExternal: options.allowOpenExternal }),
      audit: ({ action, outcome }) => auditDesktopTransfer(`chatgpt.recovery.${action}`, outcome),
    });
  };
  registerProjectIpc(
    ipcMain,
    createProjectDesktopService(
      registry,
      async () => {
        const selection = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        return selection.canceled ? null : (selection.filePaths[0] ?? null);
      },
      validateGitRepositoryInput,
    ),
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
  const pilotService = createPilotDesktopService({
    database: projectDatabase,
    projects: registry,
    workflows,
    bridge,
    router,
    codex,
    openPreview: openWebsitePreview,
    ensureChatGptPage,
    discoverCodexCatalog: () => readCodexLocalCatalog(),
    syncCodexCatalog: (catalog) => {
      syncCodexLocalCatalog(registry, catalog, validateGitRepositoryInput);
      auditDesktopTransfer('codex.catalog.sync', 'allowed');
    },
    captureCodexBaseline: (repositoryRoot) => captureGitChangeBaseline(repositoryRoot),
    createCodexBundle: ({ repositoryRoot, baseline, finalResponse, pilotId }) =>
      createCodexChangeBundle({
        repositoryRoot,
        baseline,
        finalResponse,
        pilotId,
        outputDirectory: path.join(app.getPath('userData'), 'codex-bundles'),
        audit: ({ action, outcome }) =>
          auditDesktopTransfer(action, outcome === 'allowed' ? 'allowed' : 'blocked'),
      }),
    revealCodexBundle: (zipPath) => {
      shell.showItemInFolder(zipPath);
      return Promise.resolve();
    },
    saveChatHistory: async ({ suggestedFileName, content }) => {
      const selection = await dialog.showSaveDialog({
        title: 'Xuất toàn bộ lịch sử ChatGPT đã lưu',
        defaultPath: path.join(app.getPath('documents'), suggestedFileName),
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (selection.canceled || !selection.filePath) return null;
      await writeFile(selection.filePath, content, 'utf8');
      return selection.filePath;
    },
    createChatHistoryTransfer: ({ history, pilotId }) =>
      createChatHistoryTransferBundle({
        history,
        pilotId,
        outputDirectory: path.join(app.getPath('userData'), 'chat-history-transfers'),
        audit: ({ action, outcome }) =>
          auditDesktopTransfer(action, outcome === 'allowed' ? 'allowed' : 'blocked'),
      }),
    revealChatHistoryTransfer: (zipPath) => {
      shell.showItemInFolder(zipPath);
      return Promise.resolve();
    },
  });
  registerPilotIpc(ipcMain, pilotService, {
    validateSender: (event) => trustedRendererIds.has(event.sender.id),
    audit: ({ action, outcome }) => auditDesktopTransfer(action, outcome),
  });
  createWindow();
  void pilotService
    .list()
    .then(async (pilots) => {
      const destinations = pilots
        .filter((pilot) =>
          [
            'draft',
            'chatgpt_ready',
            'chatgpt_dispatched',
            'chatgpt_confirmation_required',
          ].includes(pilot.status),
        )
        .map((pilot) =>
          pilot.accountTransfer &&
          ['review_required', 'dispatching', 'confirmation_required'].includes(
            pilot.accountTransfer.status,
          )
            ? pilot.accountTransfer.targetDestination
            : pilot.destination,
        )
        .filter(
          (destination, index, all) =>
            all.findIndex(
              (candidate) => JSON.stringify(candidate) === JSON.stringify(destination),
            ) === index,
        )
        // Startup is a recovery hint, not a browser-tab fan-out mechanism.
        .slice(0, 1);
      for (const destination of destinations) await ensureChatGptPage(destination);
    })
    .catch((error: unknown) => {
      const code = error instanceof Error ? error.message : 'CHATGPT_NOT_READY';
      console.warn('CHATGPT_STARTUP_RECOVERY_FAILED', code);
    });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  let shutdownStarted = false;
  app.on('before-quit', (event) => {
    if (shutdownStarted) return;
    event.preventDefault();
    shutdownStarted = true;
    void (async () => {
      try {
        await codex.dispose();
      } catch (error) {
        console.error('CODEX_DISPOSE_FAILED', error);
      } finally {
        projectDatabase?.close();
        projectDatabase = undefined;
        app.quit();
      }
    })();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

void startDesktop().catch((error: unknown) => {
  console.error('DESKTOP_START_FAILED', error);
  app.quit();
});
