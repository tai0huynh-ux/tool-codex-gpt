import {
  projectEvidenceSchema,
  type ProjectDetectionResult,
  type RepositoryFingerprintInput,
} from '@codex-context-bridge/contracts';
import { detectProject, scoreProjectCandidate } from '@codex-context-bridge/project-detector';
import type { Project, ProjectRegistry } from '@codex-context-bridge/project-registry';
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { IpcInvokeEventLike, IpcMainLike } from './ipc';

export const projectIpcChannels = {
  list: 'projects:list',
  create: 'projects:create',
  archive: 'projects:archive',
  addAlias: 'projects:add-alias',
  chooseRepositoryRoot: 'projects:choose-repository-root',
  previewRepository: 'projects:preview-repository',
  confirmRepository: 'projects:confirm-repository',
} as const;

const projectSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    archivedAt: z.iso.datetime().optional(),
  })
  .strict();

const repositorySchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    canonicalRoot: z.string().min(1),
    normalizedRemote: z.string().min(1).optional(),
    projectName: z.string().min(1).optional(),
    repositoryMarker: z.string().min(1).optional(),
    agentsHash: z.string().min(1).optional(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    branch: z.string().min(1).optional(),
    worktreeRoot: z.string().min(1).optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    archivedAt: z.iso.datetime().optional(),
  })
  .strict();

export const projectViewSchema = z
  .object({
    project: projectSchema,
    aliases: z.array(z.string().min(1)),
    repositories: z.array(repositorySchema),
  })
  .strict();

export const repositoryInputSchema = z
  .object({
    repoRoot: z.string().min(1),
    gitRemote: z.string().min(1).optional(),
    projectName: z.string().min(1).optional(),
    repositoryMarker: z.string().min(1).optional(),
    agentsHash: z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
    worktreeRoot: z.string().min(1).optional(),
  })
  .strict();

const detectionSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    ambiguousProjectIds: z.array(z.string().min(1)).optional(),
    confidence: z.number().min(0).max(1),
    evidence: z.array(projectEvidenceSchema),
    requiresConfirmation: z.boolean(),
  })
  .strict();

export const repositoryPreviewSchema = z
  .object({
    detection: detectionSchema,
    candidateProjects: z.array(
      z.object({ id: z.string().min(1), name: z.string().min(1) }).strict(),
    ),
  })
  .strict();

const projectIpcErrorCodeSchema = z.enum([
  'IPC_SENDER_REJECTED',
  'IPC_SCHEMA_INVALID',
  'IPC_TIMEOUT',
  'PROJECT_NOT_FOUND',
  'REPOSITORY_ROOT_INVALID',
  'REPOSITORY_ALREADY_REGISTERED',
  'INTERNAL_ERROR',
]);

const failureSchema = z
  .object({
    ok: z.literal(false),
    error: z.object({ code: projectIpcErrorCodeSchema, message: z.string().min(1) }).strict(),
  })
  .strict();

function successSchema<T extends z.ZodType>(schema: T) {
  return z.object({ ok: z.literal(true), value: schema }).strict();
}

export const projectListResponseSchema = z.discriminatedUnion('ok', [
  successSchema(z.array(projectViewSchema)),
  failureSchema,
]);
export const projectViewResponseSchema = z.discriminatedUnion('ok', [
  successSchema(projectViewSchema),
  failureSchema,
]);
export const repositoryPreviewResponseSchema = z.discriminatedUnion('ok', [
  successSchema(repositoryPreviewSchema),
  failureSchema,
]);
export const chooseRootResponseSchema = z.discriminatedUnion('ok', [
  successSchema(z.string().min(1).nullable()),
  failureSchema,
]);

export type ProjectView = z.infer<typeof projectViewSchema>;
export type RepositoryInput = z.infer<typeof repositoryInputSchema>;
export type RepositoryPreview = z.infer<typeof repositoryPreviewSchema>;
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
export type ProjectViewResponse = z.infer<typeof projectViewResponseSchema>;
export type RepositoryPreviewResponse = z.infer<typeof repositoryPreviewResponseSchema>;
export type ChooseRootResponse = z.infer<typeof chooseRootResponseSchema>;

export interface ProjectDesktopService {
  list(): ProjectView[] | Promise<ProjectView[]>;
  create(name: string): ProjectView | Promise<ProjectView>;
  archive(projectId: string): ProjectView | Promise<ProjectView>;
  addAlias(projectId: string, alias: string): ProjectView | Promise<ProjectView>;
  chooseRepositoryRoot(): string | null | Promise<string | null>;
  previewRepository(input: RepositoryInput): RepositoryPreview | Promise<RepositoryPreview>;
  confirmRepository(input: {
    projectId: string;
    repository: RepositoryInput;
    confirmed: true;
  }): ProjectView | Promise<ProjectView>;
}

export function validateGitRepositoryInput(input: RepositoryInput): RepositoryInput {
  try {
    const canonicalRoot = realpathSync(input.repoRoot);
    const root = lstatSync(canonicalRoot);
    const gitMarker = lstatSync(path.join(canonicalRoot, '.git'));
    if (!root.isDirectory() || root.isSymbolicLink() || gitMarker.isSymbolicLink()) {
      throw new Error('REPOSITORY_ROOT_INVALID');
    }
    if (!gitMarker.isDirectory() && !gitMarker.isFile()) {
      throw new Error('REPOSITORY_ROOT_INVALID');
    }
    return { ...input, repoRoot: canonicalRoot };
  } catch {
    throw new Error('REPOSITORY_ROOT_INVALID');
  }
}

function view(registry: ProjectRegistry, project: Project): ProjectView {
  return {
    project,
    aliases: registry.listAliases(project.id),
    repositories: registry.listRepositories(project.id),
  };
}

function candidates(registry: ProjectRegistry): {
  projectId: string;
  fingerprint: RepositoryFingerprintInput;
}[] {
  return registry.list().flatMap((project) =>
    registry.listRepositories(project.id).map((repository) => ({
      projectId: project.id,
      fingerprint: {
        repoRoot: repository.canonicalRoot,
        ...(repository.normalizedRemote ? { gitRemote: repository.normalizedRemote } : {}),
        ...(repository.projectName ? { projectName: repository.projectName } : {}),
        ...(repository.repositoryMarker ? { repositoryMarker: repository.repositoryMarker } : {}),
        ...(repository.agentsHash ? { agentsHash: repository.agentsHash } : {}),
      },
    })),
  );
}

function fingerprintInput(input: RepositoryInput): RepositoryFingerprintInput {
  return {
    repoRoot: input.repoRoot,
    ...(input.gitRemote ? { gitRemote: input.gitRemote } : {}),
    ...(input.projectName ? { projectName: input.projectName } : {}),
    ...(input.repositoryMarker ? { repositoryMarker: input.repositoryMarker } : {}),
    ...(input.agentsHash ? { agentsHash: input.agentsHash } : {}),
  };
}

function registrationInput(
  input: RepositoryInput,
): RepositoryFingerprintInput & { branch?: string; worktreeRoot?: string } {
  return {
    ...fingerprintInput(input),
    ...(input.branch ? { branch: input.branch } : {}),
    ...(input.worktreeRoot ? { worktreeRoot: input.worktreeRoot } : {}),
  };
}

function bestProjectScore(
  registry: ProjectRegistry,
  projectId: string,
  observed: RepositoryInput,
): Pick<ProjectDetectionResult, 'confidence' | 'evidence'> {
  let best: Pick<ProjectDetectionResult, 'confidence' | 'evidence'> = {
    confidence: 0,
    evidence: [],
  };
  for (const candidate of candidates(registry).filter((item) => item.projectId === projectId)) {
    const score = scoreProjectCandidate(fingerprintInput(observed), candidate.fingerprint);
    if (score.confidence > best.confidence) best = score;
  }
  return best;
}

export function createProjectDesktopService(
  registry: ProjectRegistry,
  chooseRepositoryRoot: () => string | null | Promise<string | null>,
  validateRepository: (input: RepositoryInput) => RepositoryInput = (input) => input,
): ProjectDesktopService {
  return {
    list: () => registry.list().map((project) => view(registry, project)),
    create: (name) => view(registry, registry.create(name)),
    archive: (projectId) => {
      const project = registry.archive(projectId);
      if (!project) throw new Error('PROJECT_NOT_FOUND');
      return view(registry, project);
    },
    addAlias: (projectId, alias) => {
      const project = registry.get(projectId);
      if (!project || project.archivedAt) throw new Error('PROJECT_NOT_FOUND');
      registry.addAlias(projectId, alias);
      return view(registry, project);
    },
    chooseRepositoryRoot,
    previewRepository: (input) => {
      const repository = validateRepository(input);
      return {
        detection: detectProject(fingerprintInput(repository), candidates(registry)),
        candidateProjects: registry.list().map(({ id, name }) => ({ id, name })),
      };
    },
    confirmRepository: ({ projectId, repository, confirmed }) => {
      void confirmed;
      const validatedRepository = validateRepository(repository);
      const project = registry.get(projectId);
      if (!project || project.archivedAt) throw new Error('PROJECT_NOT_FOUND');
      const score = bestProjectScore(registry, projectId, validatedRepository);
      const registered = registry.registerRepository(
        projectId,
        registrationInput(validatedRepository),
      );
      registry.recordMapping({
        projectId,
        repositoryId: registered.id,
        subjectType: 'repository',
        subjectId: registered.fingerprint,
        confidence: score.confidence,
        evidence: score.evidence,
        status: 'confirmed',
      });
      return view(registry, project);
    },
  };
}

export interface ProjectIpcOptions {
  validateSender: (event: IpcInvokeEventLike) => boolean;
  timeoutMs?: number;
  audit?: (event: { action: string; outcome: 'allowed' | 'blocked' | 'failed' }) => void;
}

function failure(code: z.infer<typeof projectIpcErrorCodeSchema>, message: string) {
  return { ok: false as const, error: { code, message } };
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('IPC_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mapError(error: unknown) {
  if (error instanceof Error && error.message === 'IPC_TIMEOUT') {
    return failure('IPC_TIMEOUT', 'Project request timed out.');
  }
  if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
    return failure('PROJECT_NOT_FOUND', 'Project was not found.');
  }
  if (error instanceof Error && error.message === 'REPOSITORY_ROOT_INVALID') {
    return failure(
      'REPOSITORY_ROOT_INVALID',
      'Repository root must be an existing Git repository.',
    );
  }
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed: repositories.')) {
    return failure('REPOSITORY_ALREADY_REGISTERED', 'Repository is already registered.');
  }
  return failure('INTERNAL_ERROR', 'Project operation failed.');
}

export function registerProjectIpc(
  ipcMain: IpcMainLike,
  service: ProjectDesktopService,
  options: ProjectIpcOptions,
): void {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const register = (
    channel: string,
    action: string,
    inputSchema: z.ZodType,
    outputSchema: z.ZodType,
    operation: (input: unknown) => unknown,
    useTimeout = true,
  ): void => {
    ipcMain.handle(channel, async (event, input) => {
      if (!options.validateSender(event)) {
        options.audit?.({ action, outcome: 'blocked' });
        return failure('IPC_SENDER_REJECTED', 'IPC sender is not trusted.');
      }
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) {
        options.audit?.({ action, outcome: 'blocked' });
        return failure('IPC_SCHEMA_INVALID', 'Project request is invalid.');
      }
      try {
        const work = Promise.resolve(operation(parsed.data));
        const value = useTimeout ? await withTimeout(work, timeoutMs) : await work;
        options.audit?.({ action, outcome: 'allowed' });
        return outputSchema.parse({ ok: true, value });
      } catch (error) {
        options.audit?.({ action, outcome: 'failed' });
        return mapError(error);
      }
    });
  };

  register(projectIpcChannels.list, 'project.list', z.undefined(), projectListResponseSchema, () =>
    service.list(),
  );
  register(
    projectIpcChannels.create,
    'project.create',
    z.object({ name: z.string().min(1) }).strict(),
    projectViewResponseSchema,
    (input) => service.create((input as { name: string }).name),
  );
  register(
    projectIpcChannels.archive,
    'project.archive',
    z.object({ projectId: z.string().min(1) }).strict(),
    projectViewResponseSchema,
    (input) => service.archive((input as { projectId: string }).projectId),
  );
  register(
    projectIpcChannels.addAlias,
    'project.alias.add',
    z.object({ projectId: z.string().min(1), alias: z.string().min(1) }).strict(),
    projectViewResponseSchema,
    (input) => {
      const value = input as { projectId: string; alias: string };
      return service.addAlias(value.projectId, value.alias);
    },
  );
  register(
    projectIpcChannels.chooseRepositoryRoot,
    'repository.choose-root',
    z.undefined(),
    chooseRootResponseSchema,
    () => service.chooseRepositoryRoot(),
    false,
  );
  register(
    projectIpcChannels.previewRepository,
    'repository.preview',
    repositoryInputSchema,
    repositoryPreviewResponseSchema,
    (input) => service.previewRepository(input as RepositoryInput),
  );
  register(
    projectIpcChannels.confirmRepository,
    'repository.confirm',
    z
      .object({
        projectId: z.string().min(1),
        repository: repositoryInputSchema,
        confirmed: z.literal(true),
      })
      .strict(),
    projectViewResponseSchema,
    (input) =>
      service.confirmRepository(
        input as { projectId: string; repository: RepositoryInput; confirmed: true },
      ),
  );
}
