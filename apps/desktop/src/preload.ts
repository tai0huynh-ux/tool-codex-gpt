import type { LocalTransportOperation } from '@codex-context-bridge/contracts';
import { contextBridge, ipcRenderer } from 'electron';
import {
  chooseRootResponseSchema,
  desktopIpcChannels,
  projectIpcChannels,
  pilotIpcChannels,
  chatHistoryExportResponseSchema,
  pilotListResponseSchema,
  pilotViewResponseSchema,
  projectListResponseSchema,
  projectViewResponseSchema,
  repositoryPreviewResponseSchema,
  transportOperationResponseSchema,
  transportStatusResponseSchema,
  workflowIpcChannels,
  workflowListResponseSchema,
  workflowViewResponseSchema,
  type ChooseRootResponse,
  type ChatHistoryExportResponse,
  type ProjectListResponse,
  type ProjectViewResponse,
  type PilotCreateInput,
  type PilotListResponse,
  type PilotViewResponse,
  type RepositoryInput,
  type RepositoryPreviewResponse,
  type TransportOperationResponse,
  type TransportStatusResponse,
  type WorkflowListResponse,
  type WorkflowViewResponse,
} from './preload-contracts';

export interface ContextBridgeDesktopApi {
  getTransportStatus(): Promise<TransportStatusResponse>;
  executeTransportOperation(
    operation: LocalTransportOperation,
  ): Promise<TransportOperationResponse>;
  listProjects(): Promise<ProjectListResponse>;
  createProject(name: string): Promise<ProjectViewResponse>;
  archiveProject(projectId: string): Promise<ProjectViewResponse>;
  addProjectAlias(projectId: string, alias: string): Promise<ProjectViewResponse>;
  chooseRepositoryRoot(): Promise<ChooseRootResponse>;
  previewRepository(repository: RepositoryInput): Promise<RepositoryPreviewResponse>;
  confirmRepository(projectId: string, repository: RepositoryInput): Promise<ProjectViewResponse>;
  listWorkflows(projectId?: string): Promise<WorkflowListResponse>;
  startWorkflow(projectId: string): Promise<WorkflowViewResponse>;
  cancelWorkflow(workflowRunId: string): Promise<WorkflowViewResponse>;
  listPilots(projectId?: string): Promise<PilotListResponse>;
  createPilot(input: PilotCreateInput): Promise<PilotViewResponse>;
  inspectPilotChatGpt(pilotId: string): Promise<PilotViewResponse>;
  preparePilotChatGpt(pilotId: string): Promise<PilotViewResponse>;
  approvePilotChatGpt(pilotId: string): Promise<PilotViewResponse>;
  capturePilotChatGpt(pilotId: string): Promise<PilotViewResponse>;
  syncPilotChatHistory(pilotId: string): Promise<PilotViewResponse>;
  exportPilotChatHistory(pilotId: string): Promise<ChatHistoryExportResponse>;
  approvePilotCodex(pilotId: string): Promise<PilotViewResponse>;
  refreshPilot(pilotId: string): Promise<PilotViewResponse>;
  verifyPilotWebsite(pilotId: string): Promise<PilotViewResponse>;
  openPilotPreview(pilotId: string): Promise<PilotViewResponse>;
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
  listProjects: async () =>
    projectListResponseSchema.parse((await ipcRenderer.invoke(projectIpcChannels.list)) as unknown),
  createProject: async (name) =>
    projectViewResponseSchema.parse(
      (await ipcRenderer.invoke(projectIpcChannels.create, { name })) as unknown,
    ),
  archiveProject: async (projectId) =>
    projectViewResponseSchema.parse(
      (await ipcRenderer.invoke(projectIpcChannels.archive, { projectId })) as unknown,
    ),
  addProjectAlias: async (projectId, alias) =>
    projectViewResponseSchema.parse(
      (await ipcRenderer.invoke(projectIpcChannels.addAlias, { projectId, alias })) as unknown,
    ),
  chooseRepositoryRoot: async () =>
    chooseRootResponseSchema.parse(
      (await ipcRenderer.invoke(projectIpcChannels.chooseRepositoryRoot)) as unknown,
    ),
  previewRepository: async (repository) =>
    repositoryPreviewResponseSchema.parse(
      (await ipcRenderer.invoke(projectIpcChannels.previewRepository, repository)) as unknown,
    ),
  confirmRepository: async (projectId, repository) =>
    projectViewResponseSchema.parse(
      (await ipcRenderer.invoke(projectIpcChannels.confirmRepository, {
        projectId,
        repository,
        confirmed: true,
      })) as unknown,
    ),
  listWorkflows: async (projectId) =>
    workflowListResponseSchema.parse(
      (await ipcRenderer.invoke(workflowIpcChannels.list, {
        ...(projectId ? { projectId } : {}),
      })) as unknown,
    ),
  startWorkflow: async (projectId) =>
    workflowViewResponseSchema.parse(
      (await ipcRenderer.invoke(workflowIpcChannels.start, { projectId })) as unknown,
    ),
  cancelWorkflow: async (workflowRunId) =>
    workflowViewResponseSchema.parse(
      (await ipcRenderer.invoke(workflowIpcChannels.cancel, { workflowRunId })) as unknown,
    ),
  listPilots: async (projectId) =>
    pilotListResponseSchema.parse(
      (await ipcRenderer.invoke(pilotIpcChannels.list, {
        ...(projectId ? { projectId } : {}),
      })) as unknown,
    ),
  createPilot: async (input) =>
    pilotViewResponseSchema.parse(
      (await ipcRenderer.invoke(pilotIpcChannels.create, input)) as unknown,
    ),
  refreshPilot: async (pilotId) =>
    pilotViewResponseSchema.parse(
      (await ipcRenderer.invoke(pilotIpcChannels.refresh, { pilotId })) as unknown,
    ),
  verifyPilotWebsite: async (pilotId) =>
    pilotViewResponseSchema.parse(
      (await ipcRenderer.invoke(pilotIpcChannels.verifyWebsite, { pilotId })) as unknown,
    ),
  openPilotPreview: async (pilotId) =>
    pilotViewResponseSchema.parse(
      (await ipcRenderer.invoke(pilotIpcChannels.openPreview, { pilotId })) as unknown,
    ),
  inspectPilotChatGpt: async (pilotId) =>
    pilotViewResponseSchema.parse(
      (await ipcRenderer.invoke(pilotIpcChannels.inspectChatGpt, { pilotId })) as unknown,
    ),
  preparePilotChatGpt: async (pilotId) =>
    pilotViewResponseSchema.parse(
      (await ipcRenderer.invoke(pilotIpcChannels.prepareChatGpt, { pilotId })) as unknown,
    ),
  approvePilotChatGpt: async (pilotId) =>
    pilotViewResponseSchema.parse(
      (await ipcRenderer.invoke(pilotIpcChannels.approveChatGpt, { pilotId })) as unknown,
    ),
  capturePilotChatGpt: async (pilotId) =>
    pilotViewResponseSchema.parse(
      (await ipcRenderer.invoke(pilotIpcChannels.captureChatGpt, { pilotId })) as unknown,
    ),
  syncPilotChatHistory: async (pilotId) =>
    pilotViewResponseSchema.parse(
      (await ipcRenderer.invoke(pilotIpcChannels.syncChatHistory, { pilotId })) as unknown,
    ),
  exportPilotChatHistory: async (pilotId) =>
    chatHistoryExportResponseSchema.parse(
      (await ipcRenderer.invoke(pilotIpcChannels.exportChatHistory, { pilotId })) as unknown,
    ),
  approvePilotCodex: async (pilotId) =>
    pilotViewResponseSchema.parse(
      (await ipcRenderer.invoke(pilotIpcChannels.approveCodex, { pilotId })) as unknown,
    ),
};

contextBridge.exposeInMainWorld('contextBridgeDesktop', api);
contextBridge.exposeInMainWorld('contextBridgeInfo', {
  phase: 'guided-workflow',
  assistedMode: true,
});
