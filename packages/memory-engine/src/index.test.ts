import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, type SqliteDatabase } from '@codex-context-bridge/database';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryEngine, type CreateMemoryInput } from './index';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'memory-engine-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

function addProject(database: SqliteDatabase, id: string): void {
  database
    .prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(id, id, '2026-07-18T10:00:00.000Z', '2026-07-18T10:00:00.000Z');
}

function clock(): () => string {
  let second = 0;
  return () => `2026-07-18T10:00:${String(second++).padStart(2, '0')}.000Z`;
}

function projectMemory(
  content: string,
  overrides: Partial<CreateMemoryInput> = {},
): CreateMemoryInput {
  return {
    scope: 'project',
    scopeId: 'project-1',
    projectId: 'project-1',
    category: 'rule',
    content,
    confidence: 0.9,
    sources: [{ type: 'user', id: 'user-confirmation-1' }],
    ...overrides,
  };
}

describe('MemoryEngine lifecycle', () => {
  it('keeps candidates out of retrieval until explicit approval and preserves sources', () => {
    const database = openDatabase(':memory:');
    addProject(database, 'project-1');
    const engine = new MemoryEngine(database, clock());
    const candidate = engine.createCandidate(
      projectMemory('Use the old wording.', { id: 'memory-1' }),
    );

    expect(
      engine.retrieve({
        projectId: 'project-1',
        query: 'wording',
        maxItems: 10,
        maxCharacters: 1_000,
      }).items,
    ).toEqual([]);

    const approved = engine.approve(candidate.id, 'Use the reviewed wording.');
    expect(approved).toMatchObject({
      status: 'approved',
      content: 'Use the reviewed wording.',
      sources: [{ type: 'user', id: 'user-confirmation-1' }],
    });
    expect(
      engine
        .retrieve({
          projectId: 'project-1',
          query: 'reviewed wording',
          maxItems: 10,
          maxCharacters: 1_000,
        })
        .items.map((memory) => memory.id),
    ).toEqual(['memory-1']);
    database.close();
  });

  it('persists rejection, deletion, and supersession without returning inactive history', () => {
    const database = openDatabase(':memory:');
    addProject(database, 'project-1');
    const engine = new MemoryEngine(database, clock());
    const rejected = engine.createCandidate(projectMemory('Reject me.', { id: 'reject-me' }));
    expect(engine.reject(rejected.id).status).toBe('deleted');

    const old = engine.approve(
      engine.createCandidate(projectMemory('Use architecture v1.', { id: 'memory-old' })).id,
    );
    const replacement = engine.supersede(old.id, {
      id: 'memory-new',
      category: 'architecture',
      content: 'Use architecture v2.',
      confidence: 0.98,
      sources: [{ type: 'file', id: 'docs/ARCHITECTURE.md' }],
    });
    expect(engine.get(old.id)).toMatchObject({
      status: 'superseded',
      supersededBy: replacement.id,
    });
    expect(
      engine
        .retrieve({
          projectId: 'project-1',
          query: 'architecture',
          maxItems: 10,
          maxCharacters: 1_000,
        })
        .items.map((memory) => memory.id),
    ).toEqual(['memory-new']);
    expect(engine.delete(replacement.id).status).toBe('deleted');
    expect(
      engine.retrieve({
        projectId: 'project-1',
        query: 'architecture',
        maxItems: 10,
        maxCharacters: 1_000,
      }).items,
    ).toEqual([]);
    database.close();
  });

  it('isolates projects while merging matching global, team, project, and conversation scopes', () => {
    const database = openDatabase(':memory:');
    addProject(database, 'project-1');
    addProject(database, 'project-2');
    const engine = new MemoryEngine(database, clock());
    const inputs: CreateMemoryInput[] = [
      {
        scope: 'global',
        category: 'preference',
        content: 'Prefer concise reports.',
        confidence: 0.8,
        sources: [{ type: 'user', id: 'global-preference' }],
        id: 'global',
      },
      {
        scope: 'team',
        scopeId: 'team-1',
        category: 'rule',
        content: 'Team requires reviewed migrations.',
        confidence: 0.9,
        sources: [{ type: 'user', id: 'team-rule' }],
        id: 'team',
      },
      projectMemory('Project one uses SQLite.', { id: 'project-one', category: 'architecture' }),
      projectMemory('Project two uses Postgres.', {
        id: 'project-two',
        scopeId: 'project-2',
        projectId: 'project-2',
        category: 'architecture',
      }),
      projectMemory('Conversation selected assisted mode.', {
        id: 'conversation',
        scope: 'conversation',
        scopeId: 'conversation-1',
        category: 'decision',
      }),
    ];
    for (const item of inputs) engine.approve(engine.createCandidate(item).id);

    const result = engine.retrieve({
      projectId: 'project-1',
      teamIds: ['team-1'],
      conversationIds: ['conversation-1'],
      query: 'project migration mode',
      maxItems: 10,
      maxCharacters: 2_000,
    });
    expect(result.items.map((memory) => memory.id).sort()).toEqual([
      'conversation',
      'global',
      'project-one',
      'team',
    ]);
    expect(result.items.map((memory) => memory.id)).not.toContain('project-two');
    database.close();
  });

  it('detects duplicate content and produces stable relevance ranking', () => {
    const database = openDatabase(':memory:');
    addProject(database, 'project-1');
    const engine = new MemoryEngine(database, clock());
    engine.approve(
      engine.createCandidate(
        projectMemory('Migration rules protect project data.', {
          id: 'rule',
          category: 'rule',
          confidence: 0.95,
        }),
      ).id,
    );
    engine.approve(
      engine.createCandidate(
        projectMemory('The interface uses green accents.', {
          id: 'fact',
          category: 'fact',
          confidence: 0.95,
        }),
      ).id,
    );
    expect(() =>
      engine.createCandidate(projectMemory('Migration rules protect project data.')),
    ).toThrow('MEMORY_DUPLICATE:rule');

    const query = {
      projectId: 'project-1',
      query: 'migration project data',
      maxItems: 10,
      maxCharacters: 1_000,
    } as const;
    const first = engine.retrieve(query);
    const repeated = engine.retrieve(query);
    expect(first.items.map((memory) => memory.id)).toEqual(['rule', 'fact']);
    expect(repeated).toEqual(first);
    database.close();
  });

  it('uses recency as a deterministic tie-breaker after relevance and category', () => {
    const database = openDatabase(':memory:');
    addProject(database, 'project-1');
    const engine = new MemoryEngine(database, clock());
    engine.approve(
      engine.createCandidate(
        projectMemory('Migration rule alpha.', { id: 'older', confidence: 0.9 }),
      ).id,
    );
    engine.approve(
      engine.createCandidate(
        projectMemory('Migration rule beta.', { id: 'newer', confidence: 0.9 }),
      ).id,
    );

    expect(
      engine
        .retrieve({
          projectId: 'project-1',
          query: 'migration rule',
          maxItems: 10,
          maxCharacters: 1_000,
        })
        .items.map((memory) => memory.id),
    ).toEqual(['newer', 'older']);
    database.close();
  });

  it('builds an approved-only bootstrap within the exact character budget', () => {
    const database = openDatabase(':memory:');
    addProject(database, 'project-1');
    const engine = new MemoryEngine(database, clock());
    engine.createCandidate(projectMemory('Candidate must stay hidden.', { id: 'candidate' }));
    engine.approve(
      engine.createCandidate(projectMemory('Approved rule enters bootstrap.', { id: 'approved' }))
        .id,
    );
    engine.approve(
      engine.createCandidate(
        projectMemory('A very long secondary fact '.repeat(30), {
          id: 'too-large',
          category: 'fact',
        }),
      ).id,
    );

    const bootstrap = engine.buildBootstrap({
      project: { id: 'project-1', name: 'Bridge', repositoryRoot: 'C:/work/bridge' },
      productGoal: 'Coordinate ChatGPT and Codex.',
      stableArchitecture: 'Local-first TypeScript monorepo.',
      currentStatus: 'Context packs complete.',
      activeBlockers: ['CODEX-SDK-001'],
      currentObjective: 'Build approved memory.',
      handoffProtocol: 'Assisted and reviewed.',
      query: 'approved rule',
      maxMemories: 10,
      maxCharacters: 600,
    });
    expect(bootstrap.rendered).toContain('Approved rule enters bootstrap.');
    expect(bootstrap.rendered).not.toContain('Candidate must stay hidden.');
    expect(bootstrap.rendered).not.toContain('very long secondary');
    expect(bootstrap.memories.map((memory) => memory.id)).toEqual(['approved']);
    expect(bootstrap.totalCharacters).toBeLessThanOrEqual(bootstrap.maxCharacters);
    expect(bootstrap.omittedMemoryCount).toBeGreaterThan(0);
    database.close();
  });

  it('recovers approved memory after reopening the SQLite database', async () => {
    const directory = await temporaryDirectory();
    const filename = path.join(directory, 'memory.sqlite');
    const firstDatabase = openDatabase(filename);
    addProject(firstDatabase, 'project-1');
    const firstEngine = new MemoryEngine(firstDatabase, clock());
    firstEngine.approve(
      firstEngine.createCandidate(projectMemory('Persistent approved memory.', { id: 'persisted' }))
        .id,
    );
    firstEngine.reject(
      firstEngine.createCandidate(projectMemory('Persisted rejection.', { id: 'rejected' })).id,
    );
    firstDatabase.close();

    const reopenedDatabase = openDatabase(filename);
    const reopened = new MemoryEngine(reopenedDatabase);
    expect(
      reopened
        .retrieve({
          projectId: 'project-1',
          query: 'persistent',
          maxItems: 10,
          maxCharacters: 1_000,
        })
        .items.map((memory) => memory.id),
    ).toEqual(['persisted']);
    expect(reopened.get('rejected')?.status).toBe('deleted');
    reopenedDatabase.close();
  });

  it('backfills legacy hashes, project isolation, and source provenance deterministically', () => {
    const database = openDatabase(':memory:');
    addProject(database, 'project-1');
    database
      .prepare(
        `INSERT INTO memories (
          id, scope, scope_id, project_id, category, content, content_hash,
          confidence, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'legacy-memory',
        'project',
        'project-1',
        null,
        'rule',
        'Legacy approved rule.',
        null,
        0.75,
        'approved',
        '2026-07-18T09:00:00.000Z',
        '2026-07-18T09:00:00.000Z',
      );

    const memory = new MemoryEngine(database).get('legacy-memory');
    expect(memory).toMatchObject({
      projectId: 'project-1',
      status: 'approved',
      sources: [{ type: 'system', id: 'legacy-migration' }],
    });
    expect(memory?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    database.close();
  });
});
