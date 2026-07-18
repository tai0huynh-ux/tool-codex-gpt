import { createHash, randomUUID } from 'node:crypto';
import {
  memoryBootstrapSchema,
  memoryCategorySchema,
  memoryRecordSchema,
  memoryRetrievalResultSchema,
  memoryScopeSchema,
  memorySourceSchema,
  type MemoryBootstrap,
  type MemoryCategory,
  type MemoryRecord,
  type MemoryRetrievalResult,
  type MemoryScope,
  type MemorySource,
} from '@codex-context-bridge/contracts';
import type { SqliteDatabase } from '@codex-context-bridge/database';

interface MemoryRow {
  id: string;
  scope: MemoryScope;
  scope_id: string | null;
  project_id: string | null;
  category: MemoryCategory;
  content: string;
  content_hash: string | null;
  confidence: number;
  status: MemoryRecord['status'];
  created_at: string;
  updated_at: string;
  superseded_by: string | null;
}

interface SourceRow {
  source_type: MemorySource['type'];
  source_id: string;
}

export interface CreateMemoryInput {
  scope: MemoryScope;
  scopeId?: string;
  projectId?: string;
  category: MemoryCategory;
  content: string;
  confidence: number;
  sources: MemorySource[];
  id?: string;
}

export interface RetrieveMemoryInput {
  projectId: string;
  query: string;
  teamIds?: string[];
  conversationIds?: string[];
  workflowIds?: string[];
  categories?: MemoryCategory[];
  maxItems: number;
  maxCharacters: number;
}

export interface BootstrapInput {
  project: { id: string; name: string; repositoryRoot: string };
  productGoal: string;
  stableArchitecture: string;
  currentStatus: string;
  activeBlockers: string[];
  currentObjective: string;
  handoffProtocol: string;
  query: string;
  teamIds?: string[];
  conversationIds?: string[];
  maxMemories: number;
  maxCharacters: number;
}

const categoryWeights: Record<MemoryCategory, number> = {
  rule: 35,
  architecture: 32,
  decision: 30,
  known_issue: 26,
  preference: 22,
  workflow: 18,
  fact: 12,
};

function requireText(value: string, code: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(code);
  return trimmed;
}

function normalizeContent(content: string): string {
  return requireText(content.replaceAll('\r\n', '\n').normalize('NFC'), 'MEMORY_CONTENT_REQUIRED');
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function characterCount(value: string): number {
  return Array.from(value).length;
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .normalize('NFKC')
      .toLowerCase()
      .split(/[^\p{L}\p{N}_-]+/u)
      .filter((item) => item.length > 1),
  );
}

function scopeValues(input: CreateMemoryInput): {
  scopeId: string | null;
  projectId: string | null;
} {
  const scope = memoryScopeSchema.parse(input.scope);
  const scopeIdValue = input.scopeId?.trim();
  const projectIdValue = input.projectId?.trim();
  const scopeId = scopeIdValue === undefined || scopeIdValue === '' ? null : scopeIdValue;
  const projectId = projectIdValue === undefined || projectIdValue === '' ? null : projectIdValue;
  if (scope === 'global' && scopeId) throw new Error('MEMORY_GLOBAL_SCOPE_ID_FORBIDDEN');
  if (scope !== 'global' && !scopeId) throw new Error('MEMORY_SCOPE_ID_REQUIRED');
  if (['global', 'team'].includes(scope) && projectId) {
    throw new Error('MEMORY_PROJECT_ID_FORBIDDEN');
  }
  if (['project', 'conversation', 'workflow'].includes(scope) && !projectId) {
    throw new Error('MEMORY_PROJECT_ID_REQUIRED');
  }
  if (scope === 'project' && scopeId !== projectId) {
    throw new Error('MEMORY_PROJECT_SCOPE_MISMATCH');
  }
  return { scopeId, projectId };
}

export class MemoryEngine {
  public constructor(
    private readonly database: SqliteDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.backfillLegacyRows();
  }

  private backfillLegacyRows(): void {
    const rows = this.database
      .prepare(
        `SELECT * FROM memories
         WHERE content_hash IS NULL OR (scope = 'project' AND project_id IS NULL)
         ORDER BY created_at, id`,
      )
      .all() as MemoryRow[];
    this.database.transaction(() => {
      for (const row of rows) {
        const hash = row.content_hash ?? contentHash(normalizeContent(row.content));
        const projectId = row.project_id ?? (row.scope === 'project' ? row.scope_id : null);
        const duplicate = this.database
          .prepare(
            `SELECT id FROM memories
             WHERE id <> ? AND scope = ? AND COALESCE(scope_id, '') = COALESCE(?, '')
               AND COALESCE(project_id, '') = COALESCE(?, '') AND content_hash = ?
               AND status IN ('candidate', 'approved')
             ORDER BY created_at, id LIMIT 1`,
          )
          .get(row.id, row.scope, row.scope_id, projectId, hash) as { id: string } | undefined;
        this.database
          .prepare(
            `UPDATE memories SET content_hash = ?, project_id = ?,
              status = CASE WHEN ? IS NULL THEN status ELSE 'superseded' END,
              superseded_by = COALESCE(?, superseded_by)
             WHERE id = ?`,
          )
          .run(hash, projectId, duplicate?.id ?? null, duplicate?.id ?? null, row.id);
        const source = this.database
          .prepare('SELECT id FROM memory_sources WHERE memory_id = ? LIMIT 1')
          .get(row.id) as { id: string } | undefined;
        if (!source) {
          this.database
            .prepare(
              'INSERT INTO memory_sources (id, memory_id, source_type, source_id) VALUES (?, ?, ?, ?)',
            )
            .run(`legacy-source:${row.id}`, row.id, 'system', 'legacy-migration');
        }
      }
    })();
  }

  private sources(memoryId: string): MemorySource[] {
    return (
      this.database
        .prepare(
          `SELECT source_type, source_id FROM memory_sources
           WHERE memory_id = ? ORDER BY source_type, source_id`,
        )
        .all(memoryId) as SourceRow[]
    ).map((row) => memorySourceSchema.parse({ type: row.source_type, id: row.source_id }));
  }

  private map(row: MemoryRow): MemoryRecord {
    if (!row.content_hash) throw new Error('MEMORY_HASH_MISSING');
    return memoryRecordSchema.parse({
      id: row.id,
      scope: row.scope,
      ...(row.scope_id ? { scopeId: row.scope_id } : {}),
      ...(row.project_id ? { projectId: row.project_id } : {}),
      category: row.category,
      content: row.content,
      contentHash: row.content_hash,
      confidence: row.confidence,
      status: row.status,
      sources: this.sources(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.superseded_by ? { supersededBy: row.superseded_by } : {}),
    });
  }

  public get(id: string): MemoryRecord | undefined {
    const row = this.database.prepare('SELECT * FROM memories WHERE id = ?').get(id) as
      MemoryRow | undefined;
    return row ? this.map(row) : undefined;
  }

  private assertNotDuplicate(
    scope: MemoryScope,
    scopeId: string | null,
    projectId: string | null,
    hash: string,
    excludedId?: string,
  ): void {
    const duplicate = this.database
      .prepare(
        `SELECT id FROM memories
         WHERE scope = ? AND COALESCE(scope_id, '') = COALESCE(?, '')
           AND COALESCE(project_id, '') = COALESCE(?, '') AND content_hash = ?
           AND (? IS NULL OR id <> ?) LIMIT 1`,
      )
      .get(scope, scopeId, projectId, hash, excludedId ?? null, excludedId ?? null) as
      { id: string } | undefined;
    if (duplicate) throw new Error(`MEMORY_DUPLICATE:${duplicate.id}`);
  }

  private insert(input: CreateMemoryInput, status: 'candidate' | 'approved'): MemoryRecord {
    const scope = memoryScopeSchema.parse(input.scope);
    const category = memoryCategorySchema.parse(input.category);
    const confidence = input.confidence;
    if (confidence < 0 || confidence > 1) throw new Error('MEMORY_CONFIDENCE_INVALID');
    const sources = memorySourceSchema.array().min(1).parse(input.sources);
    const { scopeId, projectId } = scopeValues(input);
    const content = normalizeContent(input.content);
    const hash = contentHash(content);
    this.assertNotDuplicate(scope, scopeId, projectId, hash);
    const id = input.id ?? randomUUID();
    const now = this.now();
    this.database
      .prepare(
        `INSERT INTO memories (
          id, scope, scope_id, project_id, category, content, content_hash,
          confidence, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, scope, scopeId, projectId, category, content, hash, confidence, status, now, now);
    const insertSource = this.database.prepare(
      'INSERT INTO memory_sources (id, memory_id, source_type, source_id) VALUES (?, ?, ?, ?)',
    );
    for (const source of sources) {
      insertSource.run(randomUUID(), id, source.type, source.id);
    }
    const memory = this.get(id);
    if (!memory) throw new Error('MEMORY_CREATE_FAILED');
    return memory;
  }

  public createCandidate(input: CreateMemoryInput): MemoryRecord {
    return this.database.transaction(() => this.insert(input, 'candidate'))();
  }

  public approve(id: string, editedContent?: string): MemoryRecord {
    return this.database.transaction(() => {
      const current = this.get(id);
      if (!current) throw new Error('MEMORY_NOT_FOUND');
      if (current.status !== 'candidate') throw new Error('MEMORY_NOT_CANDIDATE');
      const content =
        editedContent === undefined ? current.content : normalizeContent(editedContent);
      const hash = contentHash(content);
      this.assertNotDuplicate(
        current.scope,
        current.scopeId ?? null,
        current.projectId ?? null,
        hash,
        current.id,
      );
      this.database
        .prepare(
          `UPDATE memories SET content = ?, content_hash = ?, status = 'approved', updated_at = ?
           WHERE id = ?`,
        )
        .run(content, hash, this.now(), id);
      const approved = this.get(id);
      if (!approved) throw new Error('MEMORY_APPROVE_FAILED');
      return approved;
    })();
  }

  public reject(id: string): MemoryRecord {
    return this.setDeleted(id, 'MEMORY_NOT_CANDIDATE', ['candidate']);
  }

  public delete(id: string): MemoryRecord {
    return this.setDeleted(id, 'MEMORY_NOT_DELETABLE', ['candidate', 'approved']);
  }

  private setDeleted(
    id: string,
    invalidCode: string,
    allowed: MemoryRecord['status'][],
  ): MemoryRecord {
    const current = this.get(id);
    if (!current) throw new Error('MEMORY_NOT_FOUND');
    if (!allowed.includes(current.status)) throw new Error(invalidCode);
    this.database
      .prepare("UPDATE memories SET status = 'deleted', updated_at = ? WHERE id = ?")
      .run(this.now(), id);
    const deleted = this.get(id);
    if (!deleted) throw new Error('MEMORY_DELETE_FAILED');
    return deleted;
  }

  public supersede(
    id: string,
    replacement: Omit<CreateMemoryInput, 'scope' | 'scopeId' | 'projectId'>,
  ): MemoryRecord {
    return this.database.transaction(() => {
      const current = this.get(id);
      if (!current) throw new Error('MEMORY_NOT_FOUND');
      if (current.status !== 'approved') throw new Error('MEMORY_NOT_APPROVED');
      const next = this.insert(
        {
          ...replacement,
          scope: current.scope,
          ...(current.scopeId ? { scopeId: current.scopeId } : {}),
          ...(current.projectId ? { projectId: current.projectId } : {}),
        },
        'approved',
      );
      this.database
        .prepare(
          `UPDATE memories SET status = 'superseded', superseded_by = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(next.id, this.now(), id);
      return next;
    })();
  }

  private inScope(memory: MemoryRecord, input: RetrieveMemoryInput): boolean {
    if (memory.scope === 'global') return true;
    if (memory.scope === 'team') return input.teamIds?.includes(memory.scopeId ?? '') ?? false;
    if (memory.projectId !== input.projectId) return false;
    if (memory.scope === 'project') return true;
    if (memory.scope === 'conversation') {
      return input.conversationIds?.includes(memory.scopeId ?? '') ?? false;
    }
    return input.workflowIds?.includes(memory.scopeId ?? '') ?? false;
  }

  public retrieve(input: RetrieveMemoryInput): MemoryRetrievalResult {
    if (input.maxItems <= 0 || input.maxCharacters <= 0) throw new Error('MEMORY_BUDGET_INVALID');
    const queryTokens = tokens(input.query);
    const rows = this.database
      .prepare("SELECT * FROM memories WHERE status = 'approved'")
      .all() as MemoryRow[];
    const ranked = rows
      .map((row) => this.map(row))
      .filter((memory) => this.inScope(memory, input))
      .filter((memory) => !input.categories || input.categories.includes(memory.category))
      .map((memory) => {
        const memoryTokens = tokens(memory.content);
        const overlap = [...queryTokens].filter((item) => memoryTokens.has(item)).length;
        return {
          memory,
          score: overlap * 100 + categoryWeights[memory.category] + memory.confidence * 10,
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.memory.updatedAt.localeCompare(left.memory.updatedAt) ||
          left.memory.id.localeCompare(right.memory.id),
      );
    const items: MemoryRecord[] = [];
    let totalCharacters = 0;
    for (const item of ranked) {
      const characters = characterCount(item.memory.content);
      if (items.length >= input.maxItems || totalCharacters + characters > input.maxCharacters) {
        continue;
      }
      items.push(item.memory);
      totalCharacters += characters;
    }
    return memoryRetrievalResultSchema.parse({
      items,
      omittedCount: ranked.length - items.length,
      totalCharacters,
    });
  }

  public buildBootstrap(input: BootstrapInput): MemoryBootstrap {
    const base = [
      '# Project bootstrap',
      `Project: ${input.project.name} (${input.project.id})`,
      `Repository: ${input.project.repositoryRoot}`,
      `Product goal: ${input.productGoal}`,
      `Stable architecture: ${input.stableArchitecture}`,
      `Current status: ${input.currentStatus}`,
      `Current objective: ${input.currentObjective}`,
      `Active blockers: ${input.activeBlockers.join('; ') || 'none'}`,
      `Handoff protocol: ${input.handoffProtocol}`,
      'Approved memories:',
    ].join('\n');
    if (characterCount(base) > input.maxCharacters) throw new Error('BOOTSTRAP_BUDGET_TOO_SMALL');
    const retrieved = this.retrieve({
      projectId: input.project.id,
      query: input.query,
      ...(input.teamIds ? { teamIds: input.teamIds } : {}),
      ...(input.conversationIds ? { conversationIds: input.conversationIds } : {}),
      maxItems: input.maxMemories,
      maxCharacters: input.maxCharacters,
    });
    const included: MemoryRecord[] = [];
    let rendered = base;
    let budgetOmissions = 0;
    for (const memory of retrieved.items) {
      const sourceText = memory.sources.map((source) => `${source.type}:${source.id}`).join(', ');
      const line = `\n- [${memory.category}] ${memory.content} (sources: ${sourceText})`;
      if (characterCount(rendered + line) > input.maxCharacters) {
        budgetOmissions += 1;
        continue;
      }
      rendered += line;
      included.push(memory);
    }
    return memoryBootstrapSchema.parse({
      projectId: input.project.id,
      rendered,
      memories: included,
      omittedMemoryCount: retrieved.omittedCount + budgetOmissions,
      totalCharacters: characterCount(rendered),
      maxCharacters: input.maxCharacters,
    });
  }
}
