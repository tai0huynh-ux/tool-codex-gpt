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
};

contextBridge.exposeInMainWorld('contextBridgeDesktop', api);
contextBridge.exposeInMainWorld('contextBridgeInfo', {
  phase: 'project-mapping',
  assistedMode: true,
});
