import { randomUUID } from 'node:crypto';
import {
  projectEvidenceSchema,
  type ProjectEvidence,
  type RepositoryFingerprintInput,
} from '@codex-context-bridge/contracts';
import type { SqliteDatabase } from '@codex-context-bridge/database';
import {
  canonicalizeRepositoryRoot,
  createRepositoryFingerprint,
} from '@codex-context-bridge/project-detector';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface RegisteredRepository {
  id: string;
  projectId: string;
  canonicalRoot: string;
  normalizedRemote?: string;
  projectName?: string;
  repositoryMarker?: string;
  agentsHash?: string;
  fingerprint: string;
  branch?: string;
  worktreeRoot?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface MappingConfirmation {
  id: string;
  projectId: string;
  repositoryId?: string;
  subjectType: 'repository' | 'chat_project' | 'chat_conversation' | 'codex_thread';
  subjectId: string;
  confidence: number;
  evidence: ProjectEvidence[];
  status: 'confirmed' | 'rejected' | 'superseded';
  createdAt: string;
  supersededAt?: string;
}

export interface CodexThreadMapping {
  id: string;
  projectId: string;
  repositoryFingerprint: string;
  externalThreadId: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface RepositoryRow {
  id: string;
  project_id: string;
  canonical_root: string;
  normalized_remote: string | null;
  project_name: string | null;
  repository_marker: string | null;
  agents_hash: string | null;
  fingerprint: string;
  branch: string | null;
  worktree_root: string | null;
  created_at: string;
  updated_at: string | null;
  archived_at: string | null;
}

interface MappingRow {
  id: string;
  project_id: string;
  repository_id: string | null;
  subject_type: MappingConfirmation['subjectType'];
  subject_id: string;
  confidence: number;
  evidence_json: string;
  status: MappingConfirmation['status'];
  created_at: string;
  superseded_at: string | null;
}

interface CodexThreadRow {
  id: string;
  project_id: string;
  repository_fingerprint: string;
  external_thread_id: string;
  created_at: string;
  updated_at: string;
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
  };
}

function mapRepository(row: RepositoryRow): RegisteredRepository {
  return {
    id: row.id,
    projectId: row.project_id,
    canonicalRoot: row.canonical_root,
    fingerprint: row.fingerprint,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    ...(row.normalized_remote ? { normalizedRemote: row.normalized_remote } : {}),
    ...(row.project_name ? { projectName: row.project_name } : {}),
    ...(row.repository_marker ? { repositoryMarker: row.repository_marker } : {}),
    ...(row.agents_hash ? { agentsHash: row.agents_hash } : {}),
    ...(row.branch ? { branch: row.branch } : {}),
    ...(row.worktree_root ? { worktreeRoot: row.worktree_root } : {}),
    ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
  };
}

function mapConfirmation(row: MappingRow): MappingConfirmation {
  return {
    id: row.id,
    projectId: row.project_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    confidence: row.confidence,
    evidence: JSON.parse(row.evidence_json) as ProjectEvidence[],
    status: row.status,
    createdAt: row.created_at,
    ...(row.repository_id ? { repositoryId: row.repository_id } : {}),
    ...(row.superseded_at ? { supersededAt: row.superseded_at } : {}),
  };
}

function mapCodexThread(row: CodexThreadRow): CodexThreadMapping {
  return {
    id: row.id,
    projectId: row.project_id,
    repositoryFingerprint: row.repository_fingerprint,
    externalThreadId: row.external_thread_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireText(value: string, code: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(code);
  return trimmed;
}

function optionalText(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? null : trimmed;
}

function normalizedRepositoryInput(input: RepositoryFingerprintInput): RepositoryFingerprintInput {
  const gitRemote = optionalText(input.gitRemote);
  const projectName = optionalText(input.projectName);
  const repositoryMarker = optionalText(input.repositoryMarker);
  const agentsHash = optionalText(input.agentsHash);
  return {
    repoRoot: requireText(input.repoRoot, 'REPOSITORY_ROOT_REQUIRED'),
    ...(gitRemote ? { gitRemote } : {}),
    ...(projectName ? { projectName } : {}),
    ...(repositoryMarker ? { repositoryMarker } : {}),
    ...(agentsHash ? { agentsHash } : {}),
  };
}

export class ProjectRegistry {
  public constructor(
    private readonly database: SqliteDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  public create(name: string, id: string = randomUUID()): Project {
    const normalizedName = requireText(name, 'PROJECT_NAME_REQUIRED');
    const now = this.now();
    this.database
      .prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(id, normalizedName, now, now);
    return { id, name: normalizedName, createdAt: now, updatedAt: now };
  }

  public get(id: string): Project | undefined {
    const row = this.database.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      ProjectRow | undefined;
    return row ? mapProject(row) : undefined;
  }

  public list(includeArchived = false): Project[] {
    const sql = includeArchived
      ? 'SELECT * FROM projects ORDER BY created_at'
      : 'SELECT * FROM projects WHERE archived_at IS NULL ORDER BY created_at';
    return (this.database.prepare(sql).all() as ProjectRow[]).map(mapProject);
  }

  public update(id: string, name: string): Project | undefined {
    const updatedAt = this.now();
    const result = this.database
      .prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?')
      .run(requireText(name, 'PROJECT_NAME_REQUIRED'), updatedAt, id);
    return result.changes === 0 ? undefined : this.get(id);
  }

  public archive(id: string): Project | undefined {
    const now = this.now();
    const result = this.database
      .prepare('UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
    return result.changes === 0 ? undefined : this.get(id);
  }

  public restore(id: string): Project | undefined {
    const result = this.database
      .prepare('UPDATE projects SET archived_at = NULL, updated_at = ? WHERE id = ?')
      .run(this.now(), id);
    return result.changes === 0 ? undefined : this.get(id);
  }

  public addAlias(projectId: string, alias: string, id: string = randomUUID()): string {
    this.database
      .prepare('INSERT INTO project_aliases (id, project_id, alias) VALUES (?, ?, ?)')
      .run(id, projectId, requireText(alias, 'PROJECT_ALIAS_REQUIRED'));
    return id;
  }

  public listAliases(projectId: string): string[] {
    return (
      this.database
        .prepare('SELECT alias FROM project_aliases WHERE project_id = ? ORDER BY alias')
        .all(projectId) as { alias: string }[]
    ).map((row) => row.alias);
  }

  public removeAlias(projectId: string, alias: string): boolean {
    return (
      this.database
        .prepare('DELETE FROM project_aliases WHERE project_id = ? AND alias = ?')
        .run(projectId, alias).changes > 0
    );
  }

  public registerRepository(
    projectId: string,
    input: RepositoryFingerprintInput & { branch?: string; worktreeRoot?: string },
    id: string = randomUUID(),
  ): RegisteredRepository {
    const identity = createRepositoryFingerprint(normalizedRepositoryInput(input));
    const now = this.now();
    this.database
      .prepare(
        `INSERT INTO repositories (
          id, project_id, canonical_root, normalized_remote, project_name,
          repository_marker, agents_hash, fingerprint, branch, worktree_root,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        projectId,
        identity.repoRoot,
        identity.gitRemote ?? null,
        identity.projectName ?? null,
        identity.repositoryMarker ?? null,
        identity.agentsHash ?? null,
        identity.fingerprint,
        optionalText(input.branch),
        input.worktreeRoot ? canonicalizeRepositoryRoot(input.worktreeRoot) : null,
        now,
        now,
      );
    const repository = this.getRepository(id);
    if (!repository) throw new Error('REPOSITORY_CREATE_FAILED');
    return repository;
  }

  public getRepository(id: string): RegisteredRepository | undefined {
    const row = this.database.prepare('SELECT * FROM repositories WHERE id = ?').get(id) as
      RepositoryRow | undefined;
    return row ? mapRepository(row) : undefined;
  }

  public listRepositories(projectId: string, includeArchived = false): RegisteredRepository[] {
    const sql = includeArchived
      ? 'SELECT * FROM repositories WHERE project_id = ? ORDER BY created_at'
      : 'SELECT * FROM repositories WHERE project_id = ? AND archived_at IS NULL ORDER BY created_at';
    return (this.database.prepare(sql).all(projectId) as RepositoryRow[]).map(mapRepository);
  }

  public refreshRepository(
    id: string,
    input: RepositoryFingerprintInput & { branch?: string; worktreeRoot?: string },
  ): RegisteredRepository | undefined {
    const identity = createRepositoryFingerprint(normalizedRepositoryInput(input));
    const result = this.database
      .prepare(
        `UPDATE repositories SET
          canonical_root = ?, normalized_remote = ?, project_name = ?, repository_marker = ?,
          agents_hash = ?, fingerprint = ?, branch = ?, worktree_root = ?, updated_at = ?
        WHERE id = ?`,
      )
      .run(
        identity.repoRoot,
        identity.gitRemote ?? null,
        identity.projectName ?? null,
        identity.repositoryMarker ?? null,
        identity.agentsHash ?? null,
        identity.fingerprint,
        optionalText(input.branch),
        input.worktreeRoot ? canonicalizeRepositoryRoot(input.worktreeRoot) : null,
        this.now(),
        id,
      );
    return result.changes === 0 ? undefined : this.getRepository(id);
  }

  public archiveRepository(id: string): RegisteredRepository | undefined {
    const now = this.now();
    const result = this.database
      .prepare('UPDATE repositories SET archived_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
    return result.changes === 0 ? undefined : this.getRepository(id);
  }

  public recordMapping(
    input: {
      projectId: string;
      repositoryId?: string;
      subjectType: MappingConfirmation['subjectType'];
      subjectId: string;
      confidence: number;
      evidence: ProjectEvidence[];
      status: 'confirmed' | 'rejected';
    },
    id: string = randomUUID(),
  ): MappingConfirmation {
    if (input.confidence < 0 || input.confidence > 1) throw new Error('MAPPING_CONFIDENCE_INVALID');
    const subjectId = requireText(input.subjectId, 'MAPPING_SUBJECT_REQUIRED');
    const evidence = projectEvidenceSchema.array().parse(input.evidence);
    const now = this.now();
    this.database.transaction(() => {
      if (input.status === 'confirmed') {
        this.database
          .prepare(
            `UPDATE mapping_confirmations
             SET status = 'superseded', superseded_at = ?
             WHERE subject_type = ? AND subject_id = ? AND status = 'confirmed'`,
          )
          .run(now, input.subjectType, subjectId);
      }
      this.database
        .prepare(
          `INSERT INTO mapping_confirmations (
            id, project_id, repository_id, subject_type, subject_id, confidence,
            evidence_json, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.projectId,
          input.repositoryId ?? null,
          input.subjectType,
          subjectId,
          input.confidence,
          JSON.stringify(evidence),
          input.status,
          now,
        );
    })();
    const row = this.database
      .prepare('SELECT * FROM mapping_confirmations WHERE id = ?')
      .get(id) as MappingRow | undefined;
    if (!row) throw new Error('MAPPING_CREATE_FAILED');
    return mapConfirmation(row);
  }

  public listMappingHistory(
    subjectType: MappingConfirmation['subjectType'],
    subjectId: string,
  ): MappingConfirmation[] {
    return (
      this.database
        .prepare(
          `SELECT * FROM mapping_confirmations
           WHERE subject_type = ? AND subject_id = ? ORDER BY created_at, id`,
        )
        .all(subjectType, subjectId) as MappingRow[]
    ).map(mapConfirmation);
  }

  public registerChatSource(input: {
    projectId: string;
    provider: string;
    externalProjectName?: string;
    conversationId?: string;
    title?: string;
    id?: string;
  }): string {
    const id = input.id ?? randomUUID();
    this.database
      .prepare(
        `INSERT INTO chat_sources (
          id, project_id, provider, external_project_name, conversation_id, title, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        requireText(input.provider, 'CHAT_PROVIDER_REQUIRED'),
        input.externalProjectName ?? null,
        input.conversationId ?? null,
        input.title ?? null,
        this.now(),
      );
    return id;
  }

  public registerCodexThread(input: {
    projectId: string;
    repositoryFingerprint: string;
    externalThreadId: string;
    id?: string;
  }): string {
    const id = input.id ?? randomUUID();
    const now = this.now();
    this.database
      .prepare(
        `INSERT INTO codex_threads (
          id, project_id, repository_fingerprint, external_thread_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        requireText(input.repositoryFingerprint, 'REPOSITORY_FINGERPRINT_REQUIRED'),
        requireText(input.externalThreadId, 'CODEX_THREAD_ID_REQUIRED'),
        now,
        now,
      );
    return id;
  }

  public getCodexThread(id: string): CodexThreadMapping | undefined {
    const row = this.database.prepare('SELECT * FROM codex_threads WHERE id = ?').get(id) as
      CodexThreadRow | undefined;
    return row ? mapCodexThread(row) : undefined;
  }

  public listCodexThreads(projectId: string): CodexThreadMapping[] {
    return (
      this.database
        .prepare('SELECT * FROM codex_threads WHERE project_id = ? ORDER BY created_at, id')
        .all(projectId) as CodexThreadRow[]
    ).map(mapCodexThread);
  }
}
