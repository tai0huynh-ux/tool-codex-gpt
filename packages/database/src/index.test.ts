import BetterSqlite3 from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendAuditEvent, openDatabase } from './index';

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
});
