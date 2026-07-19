import { openDatabase } from '@codex-context-bridge/database';
import { describe, expect, it } from 'vitest';
import { ChatArchiveStore } from './chat-archive';

const snapshot = (hash: string, text = 'hello') => ({
  title: 'Bridge conversation',
  projectName: 'Pilot project',
  messages: [
    { role: 'user', text },
    { role: 'assistant', text: 'response' },
  ],
  contentHash: hash,
  capturedAt: '2026-07-19T08:00:00.000Z',
});

describe('ChatArchiveStore', () => {
  it('persists one source, snapshot, and ordered messages atomically', () => {
    const database = openDatabase(':memory:');
    database
      .prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('project-1', 'Pilot', '2026-07-19T08:00:00.000Z', '2026-07-19T08:00:00.000Z');
    const store = new ChatArchiveStore(database, () => '2026-07-19T08:01:00.000Z');
    const result = store.archive({
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshot: snapshot('a'.repeat(64)),
    });
    expect(result).toMatchObject({
      conversationId: 'conversation-1',
      revisionCount: 1,
      latestMessageCount: 2,
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM chat_sources').get()).toEqual({
      count: 1,
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM chat_snapshots').get()).toEqual({
      count: 1,
    });
    expect(
      database.prepare('SELECT ordinal, role, content FROM chat_messages ORDER BY ordinal').all(),
    ).toEqual([
      { ordinal: 0, role: 'user', content: 'hello' },
      { ordinal: 1, role: 'assistant', content: 'response' },
    ]);
    database.close();
  });

  it('deduplicates the same content hash and records a changed revision', () => {
    const database = openDatabase(':memory:');
    database
      .prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('project-1', 'Pilot', '2026-07-19T08:00:00.000Z', '2026-07-19T08:00:00.000Z');
    const store = new ChatArchiveStore(database);
    const input = { projectId: 'project-1', conversationId: 'conversation-1' };
    store.archive({ ...input, snapshot: snapshot('b'.repeat(64)) });
    store.archive({ ...input, snapshot: snapshot('b'.repeat(64)) });
    store.archive({ ...input, snapshot: snapshot('c'.repeat(64), 'changed') });
    expect(database.prepare('SELECT COUNT(*) AS count FROM chat_sources').get()).toEqual({
      count: 1,
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM chat_snapshots').get()).toEqual({
      count: 2,
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM chat_messages').get()).toEqual({
      count: 4,
    });
    database.close();
  });

  it('exports only the selected project and preserves every revision losslessly', () => {
    const database = openDatabase(':memory:');
    const insertProject = database.prepare(
      'INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    );
    insertProject.run('project-1', 'One', '2026-07-19T08:00:00.000Z', '2026-07-19T08:00:00.000Z');
    insertProject.run('project-2', 'Two', '2026-07-19T08:00:00.000Z', '2026-07-19T08:00:00.000Z');
    const store = new ChatArchiveStore(database);
    store.archive({
      projectId: 'project-1',
      conversationId: 'one',
      snapshot: snapshot('d'.repeat(64)),
    });
    store.archive({
      projectId: 'project-1',
      conversationId: 'one',
      snapshot: snapshot('e'.repeat(64), 'second'),
    });
    store.archive({
      projectId: 'project-2',
      conversationId: 'two',
      snapshot: snapshot('f'.repeat(64)),
    });
    const exported = store.exportProject('project-1');
    expect(exported.conversations).toHaveLength(1);
    expect(exported.conversations[0]?.source.conversationId).toBe('one');
    expect(exported.conversations[0]?.revisions).toHaveLength(2);
    expect(exported.conversations[0]?.revisions[1]?.messages[0]).toEqual({
      role: 'user',
      text: 'second',
    });
    database.close();
  });

  it('fails closed for a new destination, malformed role, and oversized archive', () => {
    const database = openDatabase(':memory:');
    database
      .prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('project-1', 'Pilot', '2026-07-19T08:00:00.000Z', '2026-07-19T08:00:00.000Z');
    const store = new ChatArchiveStore(database);
    expect(() =>
      store.archive({
        projectId: 'project-1',
        conversationId: '   ',
        snapshot: snapshot('1'.repeat(64)),
      }),
    ).toThrow('CHAT_ARCHIVE_DESTINATION_REQUIRED');
    expect(() =>
      store.archive({
        projectId: 'project-1',
        conversationId: 'conversation-1',
        snapshot: { ...snapshot('2'.repeat(64)), messages: [{ role: '<script>', text: 'bad' }] },
      }),
    ).toThrow('CHAT_ARCHIVE_INVALID');
    expect(() =>
      store.archive({
        projectId: 'project-1',
        conversationId: 'conversation-1',
        snapshot: {
          ...snapshot('3'.repeat(64)),
          messages: [{ role: 'user', text: 'x'.repeat(240_001) }],
        },
      }),
    ).toThrow('CHAT_ARCHIVE_TOO_LARGE');
    database.close();
  });
});
