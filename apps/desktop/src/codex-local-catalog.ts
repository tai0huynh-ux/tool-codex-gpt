import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { ProjectRegistry } from '@codex-context-bridge/project-registry';
import type { RepositoryInput } from './project-ipc';

const MAX_STATE_BYTES = 2 * 1024 * 1024;
const MAX_INDEX_BYTES = 10 * 1024 * 1024;
const MAX_PROJECTS = 200;
const MAX_THREADS = 5_000;
const MAX_ROOTS_PER_PROJECT = 8;

export interface CodexLocalThread {
  externalThreadId: string;
  title: string;
  updatedAt: string;
  workingDirectory?: string;
}

export interface CodexLocalProject {
  externalProjectId: string;
  projectName: string;
  rootPaths: string[];
  threads: CodexLocalThread[];
}

export interface CodexLocalCatalog {
  source: 'codex-local-state';
  capturedAt: string;
  projects: CodexLocalProject[];
  truncated: boolean;
}

interface SessionIndexEntry {
  id: string;
  thread_name?: string;
  updated_at?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

function pathList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, 32_768))
    .filter((item): item is string => Boolean(item))
    .slice(0, MAX_ROOTS_PER_PROJECT);
}

async function readAllowedFile(root: string, name: string, maxBytes: number): Promise<string> {
  const rootPath = await realpath(root);
  const candidate = path.join(rootPath, name);
  const candidateStat = await lstat(candidate);
  if (candidateStat.isSymbolicLink() || !candidateStat.isFile())
    throw new Error('CODEX_STATE_INVALID');
  if (candidateStat.size > maxBytes) throw new Error('CODEX_STATE_TOO_LARGE');
  const resolved = await realpath(candidate);
  if (path.dirname(resolved) !== rootPath) throw new Error('CODEX_STATE_ESCAPE');
  return readFile(resolved, 'utf8');
}

function parseSessionIndex(raw: string): Map<string, SessionIndexEntry> {
  const sessions = new Map<string, SessionIndexEntry>();
  for (const line of raw.split(/\r?\n/).slice(0, MAX_THREADS)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as unknown;
      if (!isRecord(value)) continue;
      const id = text(value.id, 256);
      if (!id) continue;
      const title = text(value.thread_name, 300);
      const updatedAt = text(value.updated_at, 64);
      sessions.set(id, {
        id,
        ...(title ? { thread_name: title } : {}),
        ...(updatedAt ? { updated_at: updatedAt } : {}),
      });
    } catch {
      // Ignore an incomplete last line while Codex is writing the index.
    }
  }
  return sessions;
}

export async function readCodexLocalCatalog(
  options: { codexHome?: string; now?: () => string } = {},
): Promise<CodexLocalCatalog> {
  const codexHome = options.codexHome ?? path.join(os.homedir(), '.codex');
  const now = options.now ?? (() => new Date().toISOString());
  const [stateRaw, indexRaw] = await Promise.all([
    readAllowedFile(codexHome, '.codex-global-state.json', MAX_STATE_BYTES),
    readAllowedFile(codexHome, 'session_index.jsonl', MAX_INDEX_BYTES),
  ]);
  const state = JSON.parse(stateRaw) as unknown;
  if (!isRecord(state)) throw new Error('CODEX_STATE_INVALID');
  const localProjects = isRecord(state['local-projects']) ? state['local-projects'] : {};
  const assignments = isRecord(state['thread-project-assignments'])
    ? state['thread-project-assignments']
    : {};
  const order = Array.isArray(state['project-order'])
    ? state['project-order'].filter((item): item is string => typeof item === 'string')
    : [];
  const orderIndex = new Map(order.map((id, index) => [id, index]));
  const sessions = parseSessionIndex(indexRaw);
  let truncated = false;
  const projects: CodexLocalProject[] = [];

  for (const [key, rawProject] of Object.entries(localProjects).slice(0, MAX_PROJECTS)) {
    if (!isRecord(rawProject)) continue;
    const externalProjectId = text(rawProject.id ?? key, 256);
    const projectName = text(rawProject.name, 512);
    if (!externalProjectId || !projectName) continue;
    const threads: CodexLocalThread[] = [];
    for (const [threadId, rawAssignment] of Object.entries(assignments)) {
      if (!isRecord(rawAssignment) || rawAssignment.projectId !== externalProjectId) continue;
      const session = sessions.get(threadId);
      if (!session) continue;
      const updatedAt = session.updated_at;
      if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) continue;
      const workingDirectory = text(rawAssignment.cwd, 32_768);
      threads.push({
        externalThreadId: threadId,
        title: session.thread_name ?? `Codex thread ${threadId.slice(0, 12)}`,
        updatedAt,
        ...(workingDirectory ? { workingDirectory } : {}),
      });
    }
    threads.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    projects.push({
      externalProjectId,
      projectName,
      rootPaths: pathList(rawProject.rootPaths),
      threads,
    });
  }
  if (Object.keys(localProjects).length > MAX_PROJECTS) truncated = true;
  if (Object.keys(assignments).length > MAX_THREADS) truncated = true;
  projects.sort(
    (left, right) =>
      (orderIndex.get(left.externalProjectId) ?? Number.MAX_SAFE_INTEGER) -
        (orderIndex.get(right.externalProjectId) ?? Number.MAX_SAFE_INTEGER) ||
      left.projectName.localeCompare(right.projectName),
  );
  return { source: 'codex-local-state', capturedAt: now(), projects, truncated };
}

export async function codexLocalStateExists(
  codexHome = path.join(os.homedir(), '.codex'),
): Promise<boolean> {
  try {
    const root = await realpath(codexHome);
    const info = await stat(root);
    return info.isDirectory();
  } catch {
    return false;
  }
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

/**
 * Imports only exact, validated Git roots from the local Codex catalog. It never copies files or
 * changes the repository; it only makes a selectable registry projection for the pilot UI.
 */
export function syncCodexLocalCatalog(
  registry: ProjectRegistry,
  catalog: CodexLocalCatalog,
  validateRepository: (input: RepositoryInput) => RepositoryInput,
): void {
  const repositories = registry.list().flatMap((project) => registry.listRepositories(project.id));
  const threads = registry.list().flatMap((project) => registry.listCodexThreads(project.id));
  for (const project of catalog.projects) {
    for (const rootPath of project.rootPaths) {
      let repositoryInput: RepositoryInput;
      try {
        repositoryInput = validateRepository({
          repoRoot: rootPath,
          projectName: project.projectName,
        });
      } catch {
        continue;
      }
      let repository = repositories.find((candidate) =>
        samePath(candidate.canonicalRoot, repositoryInput.repoRoot),
      );
      let projectId = repository?.projectId;
      if (!repository) {
        projectId = stableId('codex-project', project.externalProjectId);
        const existingProject = registry.get(projectId);
        if (!existingProject) {
          try {
            registry.create(project.projectName, projectId);
          } catch {
            continue;
          }
        }
        try {
          repository = registry.registerRepository(
            projectId,
            {
              repoRoot: repositoryInput.repoRoot,
              projectName: project.projectName,
            },
            stableId('codex-repository', repositoryInput.repoRoot),
          );
          repositories.push(repository);
        } catch {
          repository = registry
            .listRepositories(projectId)
            .find((candidate) => samePath(candidate.canonicalRoot, repositoryInput.repoRoot));
        }
      }
      if (!repository || !projectId) continue;
      for (const thread of project.threads) {
        if (
          thread.workingDirectory &&
          !samePath(thread.workingDirectory, repository.canonicalRoot)
        ) {
          continue;
        }
        if (threads.some((candidate) => candidate.externalThreadId === thread.externalThreadId)) {
          continue;
        }
        try {
          registry.registerCodexThread({
            projectId,
            repositoryFingerprint: repository.fingerprint,
            externalThreadId: thread.externalThreadId,
            id: stableId('codex-thread', thread.externalThreadId),
          });
        } catch {
          // An existing external ID is left untouched rather than reassigned across projects.
        }
      }
    }
  }
}
