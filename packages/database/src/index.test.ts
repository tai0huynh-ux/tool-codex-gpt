import BetterSqlite3 from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendAuditEvent, migrate, openDatabase } from './index';
import { initialMigration } from './migration';

describe('database migrations and audit log', () => {
  it('creates the required schema and records an audit event', () => {
    const database = openDatabase(':memory:');
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];

    expect(tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(['projects', 'repositories', 'handoffs', 'audit_events']),
    );

    appendAuditEvent(database, {
      id: 'audit-1',
      eventType: 'repository.registered',
      actor: 'test',
      outcome: 'allowed',
    });

    expect(database.prepare('SELECT COUNT(*) AS count FROM audit_events').get()).toEqual({
      count: 1,
    });
    database.close();
  });

  it('executes the distributable SQL migration file', () => {
    const migrationPath = path.resolve(import.meta.dirname, '../migrations/0001_initial.sql');
    const database = new BetterSqlite3(':memory:');
    database.pragma('foreign_keys = ON');

    expect(() => database.exec(readFileSync(migrationPath, 'utf8'))).not.toThrow();
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE name = 'settings'").get(),
    ).toEqual({
      name: 'settings',
    });
    database.close();
  });

  it('upgrades an existing v1 database without losing project data', () => {
    const database = new BetterSqlite3(':memory:');
    database.pragma('foreign_keys = ON');
    database.exec(initialMigration);
    database.pragma('user_version = 1');
    database
      .prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('project-1', 'Bridge', '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z');

    migrate(database);

    expect(database.pragma('user_version', { simple: true })).toBe(5);
    expect(database.prepare('SELECT name FROM projects WHERE id = ?').get('project-1')).toEqual({
      name: 'Bridge',
    });
    expect(
      database
        .prepare("SELECT name FROM pragma_table_info('projects') WHERE name = 'archived_at'")
        .get(),
    ).toEqual({ name: 'archived_at' });
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mapping_confirmations'",
        )
        .get(),
    ).toEqual({ name: 'mapping_confirmations' });
    database.close();
  });

  it('refuses to open a database created by a newer runtime', () => {
    const database = new BetterSqlite3(':memory:');
    database.pragma('user_version = 999');
    expect(() => migrate(database)).toThrow('DATABASE_SCHEMA_NEWER_THAN_RUNTIME');
    database.close();
  });

  it('upgrades v2 memory rows with isolation, hash, and supersession columns', () => {
    const database = new BetterSqlite3(':memory:');
    database.pragma('foreign_keys = ON');
    database.exec(initialMigration);
    database.exec(
      readFileSync(
        path.resolve(import.meta.dirname, '../migrations/0002_project_mapping.sql'),
        'utf8',
      ),
    );
    database.pragma('user_version = 2');
    database
      .prepare(
        `INSERT INTO memories (
          id, scope, scope_id, category, content, confidence, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'memory-legacy',
        'global',
        null,
        'rule',
        'Preserve history.',
        0.8,
        'approved',
        '2026-07-18T00:00:00.000Z',
        '2026-07-18T00:00:00.000Z',
      );

    migrate(database);

    expect(database.pragma('user_version', { simple: true })).toBe(5);
    expect(database.prepare('SELECT id, content_hash FROM memories').get()).toEqual({
      id: 'memory-legacy',
      content_hash: null,
    });
    expect(
      database
        .prepare(
          "SELECT name FROM pragma_table_info('memories') WHERE name IN ('project_id', 'content_hash', 'superseded_by') ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: 'content_hash' }, { name: 'project_id' }, { name: 'superseded_by' }]);
    database.close();
  });

  it('upgrades v3 workflows without losing events or approvals', () => {
    const database = new BetterSqlite3(':memory:');
    database.pragma('foreign_keys = ON');
    database.exec(initialMigration);
    database.exec(
      readFileSync(
        path.resolve(import.meta.dirname, '../migrations/0002_project_mapping.sql'),
        'utf8',
      ),
    );
    database.exec(
      readFileSync(
        path.resolve(import.meta.dirname, '../migrations/0003_memory_engine.sql'),
        'utf8',
      ),
    );
    database.pragma('user_version = 3');
    database
      .prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('project-1', 'Bridge', '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z');
    database
      .prepare(
        `INSERT INTO workflow_runs (
          id, correlation_id, project_id, state, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'workflow-legacy',
        'correlation-legacy',
        'project-1',
        'idle',
        'workflow-key-legacy',
        '2026-07-18T00:00:00.000Z',
        '2026-07-18T00:00:00.000Z',
      );
    database
      .prepare(
        `INSERT INTO workflow_events (
          id, workflow_run_id, sequence, from_state, to_state, event_type, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'event-legacy',
        'workflow-legacy',
        1,
        null,
        'idle',
        'workflow.created',
        '2026-07-18T00:00:00.000Z',
      );
    database
      .prepare(
        `INSERT INTO user_approvals (
          id, workflow_run_id, action, approval_token_hash, approved_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'approval-legacy',
        'workflow-legacy',
        'send_chatgpt',
        'hash-only',
        '2026-07-18T00:00:00.000Z',
        '2026-07-18T00:01:00.000Z',
      );

    migrate(database);

    expect(database.pragma('user_version', { simple: true })).toBe(5);
    expect(
      database.prepare('SELECT id, max_iterations, recovery_status FROM workflow_runs').get(),
    ).toEqual({
      id: 'workflow-legacy',
      max_iterations: 5,
      recovery_status: 'none',
    });
    expect(database.prepare('SELECT id, actor, payload_json FROM workflow_events').get()).toEqual({
      id: 'event-legacy',
      actor: 'system',
      payload_json: '{}',
    });
    expect(database.prepare('SELECT id, project_id, scope FROM user_approvals').get()).toEqual({
      id: 'approval-legacy',
      project_id: null,
      scope: null,
    });
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workflow_effects'",
        )
        .get(),
    ).toEqual({ name: 'workflow_effects' });
    database.close();
  });
});
