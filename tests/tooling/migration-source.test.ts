import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { initialMigration, migrations } from '../../packages/database/src/migration';

const root = path.resolve(import.meta.dirname, '../..');
const script = path.join(root, 'scripts/sync-initial-migration.mjs');
const canonicalSql = path.join(root, 'packages/database/migrations/0001_initial.sql');
const projectMappingSql = path.join(root, 'packages/database/migrations/0002_project_mapping.sql');

function runSync(...argumentsList: string[]) {
  return spawnSync(process.execPath, [script, ...argumentsList], {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('canonical database migration source', () => {
  it('keeps runtime SQL identical to the distributable SQL source', () => {
    expect(initialMigration).toBe(readFileSync(canonicalSql, 'utf8').replace(/\r\n/g, '\n'));
    expect(migrations).toEqual([
      {
        version: 1,
        name: 'initial',
        sql: readFileSync(canonicalSql, 'utf8').replace(/\r\n/g, '\n'),
      },
      {
        version: 2,
        name: 'project_mapping',
        sql: readFileSync(projectMappingSql, 'utf8').replace(/\r\n/g, '\n'),
      },
    ]);
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
