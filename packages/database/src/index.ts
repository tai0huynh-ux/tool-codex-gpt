import BetterSqlite3 from 'better-sqlite3';
import { migrations } from './migration';

export type SqliteDatabase = BetterSqlite3.Database;

export function openDatabase(filename: string): SqliteDatabase {
  const database = new BetterSqlite3(filename);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  migrate(database);
  return database;
}

export function migrate(database: SqliteDatabase): void {
  let currentVersion = database.pragma('user_version', { simple: true }) as number;
  const latestVersion = Math.max(...migrations.map((migration) => migration.version));
  if (currentVersion > latestVersion) throw new Error('DATABASE_SCHEMA_NEWER_THAN_RUNTIME');
  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;
    database.transaction(() => {
      database.exec(migration.sql);
      database.pragma(`user_version = ${String(migration.version)}`);
    })();
    currentVersion = migration.version;
  }
}

export interface AuditEventInput {
  id: string;
  eventType: string;
  actor: string;
  projectId?: string;
  correlationId?: string;
  resourceType?: string;
  resourceId?: string;
  outcome: 'allowed' | 'blocked' | 'failed';
  details?: Record<string, unknown>;
  createdAt?: string;
}

export function appendAuditEvent(database: SqliteDatabase, event: AuditEventInput): void {
  database
    .prepare(
      `INSERT INTO audit_events (
        id, event_type, actor, project_id, correlation_id, resource_type,
        resource_id, outcome, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.id,
      event.eventType,
      event.actor,
      event.projectId ?? null,
      event.correlationId ?? null,
      event.resourceType ?? null,
      event.resourceId ?? null,
      event.outcome,
      JSON.stringify(event.details ?? {}),
      event.createdAt ?? new Date().toISOString(),
    );
}
