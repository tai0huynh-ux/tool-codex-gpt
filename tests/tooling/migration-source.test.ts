import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { initialMigration, migrations } from '../../packages/database/src/migration';

const root = path.resolve(import.meta.dirname, '../..');
const script = path.join(root, 'scripts/sync-initial-migration.mjs');
const migrationsDirectory = path.join(root, 'packages/database/migrations');
const canonicalSql = path.join(migrationsDirectory, '0001_initial.sql');

function expectedMigrations() {
  return readdirSync(migrationsDirectory)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(name))
    .sort()
    .map((name) => ({
      version: Number(name.slice(0, 4)),
      name: name.replace(/^\d{4}_/, '').replace(/\.sql$/i, ''),
      sql: `${readFileSync(path.join(migrationsDirectory, name), 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n*$/, '')}\n`,
    }));
}

function runSync(...argumentsList: string[]) {
  return spawnSync(process.execPath, [script, ...argumentsList], {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('canonical database migration source', () => {
  it('keeps runtime SQL identical to the distributable SQL source', () => {
    expect(initialMigration).toBe(readFileSync(canonicalSql, 'utf8').replace(/\r\n/g, '\n'));
    expect(migrations).toEqual(expectedMigrations());
    expect(runSync('--check').status).toBe(0);
  });

  it('detects drift and regenerates the runtime module deterministically', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'context-bridge-migration-'));
    const source = path.join(directory, 'migration.sql');
    const target = path.join(directory, 'migration.ts');
    try {
      writeFileSync(source, 'CREATE TABLE canonical (id TEXT PRIMARY KEY);\n', 'utf8');
      writeFileSync(target, 'export const initialMigration = `stale`;\n', 'utf8');

      const staleCheck = runSync('--check', '--source', source, '--target', target);
      expect(staleCheck.status).toBe(1);
      expect(staleCheck.stderr).toContain('Generated migration is stale');

      expect(runSync('--source', source, '--target', target).status).toBe(0);
      const firstGeneration = readFileSync(target, 'utf8');
      expect(runSync('--source', source, '--target', target).status).toBe(0);
      expect(readFileSync(target, 'utf8')).toBe(firstGeneration);
      expect(runSync('--check', '--source', source, '--target', target).status).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
