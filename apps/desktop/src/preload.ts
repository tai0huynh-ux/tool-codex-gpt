import type { LocalTransportOperation } from '@codex-context-bridge/contracts';
import { contextBridge, ipcRenderer } from 'electron';
import {
  desktopIpcChannels,
  transportOperationResponseSchema,
  transportStatusResponseSchema,
  type TransportOperationResponse,
  type TransportStatusResponse,
} from './ipc';
import {
  chooseRootResponseSchema,
  projectIpcChannels,
  projectListResponseSchema,
  projectViewResponseSchema,
  repositoryPreviewResponseSchema,
  type ChooseRootResponse,
  type ProjectListResponse,
  type ProjectViewResponse,
  type RepositoryInput,
  type RepositoryPreviewResponse,
} from './project-ipc';
import {
  workflowIpcChannels,
  workflowListResponseSchema,
  workflowViewResponseSchema,
  type WorkflowListResponse,
  type WorkflowViewResponse,
} from './workflow-ipc';

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
};

contextBridge.exposeInMainWorld('contextBridgeDesktop', api);
contextBridge.exposeInMainWorld('contextBridgeInfo', {
  phase: 'guided-workflow',
  assistedMode: true,
});
