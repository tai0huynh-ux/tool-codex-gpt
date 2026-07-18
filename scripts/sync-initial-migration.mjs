import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argumentsList = process.argv.slice(2);

function optionPath(name, fallback) {
  const index = argumentsList.indexOf(name);
  if (index === -1) return fallback;

  const value = argumentsList[index + 1];
  if (!value) throw new Error(`${name} requires a path`);
  return path.resolve(process.cwd(), value);
}

const sourcePath = optionPath('--source', null);
const migrationsDirectory = path.join(repositoryRoot, 'packages/database/migrations');
const targetPath = optionPath(
  '--target',
  path.join(repositoryRoot, 'packages/database/src/migration.ts'),
);

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function normalizeSql(value) {
  return `${normalizeNewlines(value).replace(/\n*$/, '')}\n`;
}

function renderLegacyModule(sql) {
  return [
    '// Generated from migrations/0001_initial.sql by scripts/sync-initial-migration.mjs.',
    '// Edit the SQL source, then run `pnpm migrations:generate`.',
    'export const initialMigration =',
    `  ${JSON.stringify(sql)};`,
    '',
  ].join('\n');
}

function readMigrations() {
  const entries = readdirSync(migrationsDirectory)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(name))
    .sort()
    .map((name) => {
      const version = Number(name.slice(0, 4));
      if (!Number.isSafeInteger(version) || version < 1) {
        throw new Error(`Invalid migration version: ${name}`);
      }
      return {
        version,
        name: name.replace(/^\d{4}_/, '').replace(/\.sql$/i, ''),
        sql: normalizeSql(readFileSync(path.join(migrationsDirectory, name), 'utf8')),
      };
    });
  for (const [index, entry] of entries.entries()) {
    if (entry.version !== index + 1) {
      throw new Error(`Migration versions must be contiguous from 0001; found ${entry.version}`);
    }
  }
  return entries;
}

function renderMigrationsModule(entries) {
  const lines = [
    '// Generated from migrations/*.sql by scripts/sync-initial-migration.mjs.',
    '// Edit the SQL sources, then run `pnpm migrations:generate`.',
    'export const migrations = [',
  ];
  for (const entry of entries) {
    lines.push(
      '  {',
      `    version: ${entry.version},`,
      `    name: '${entry.name}',`,
      `    sql: ${JSON.stringify(entry.sql)},`,
      '  },',
    );
  }
  lines.push('] as const;', '', 'export const initialMigration = migrations[0].sql;', '');
  return lines.join('\n');
}

const expected = sourcePath
  ? renderLegacyModule(normalizeSql(readFileSync(sourcePath, 'utf8')))
  : renderMigrationsModule(readMigrations());

if (argumentsList.includes('--check')) {
  let actual;
  try {
    actual = normalizeNewlines(readFileSync(targetPath, 'utf8'));
  } catch {
    actual = null;
  }

  if (actual !== expected) {
    process.stderr.write(
      `Generated migration is stale: ${path.relative(repositoryRoot, targetPath)}\n` +
        'Run `pnpm migrations:generate` and commit the result.\n',
    );
    process.exitCode = 1;
  }
} else {
  writeFileSync(targetPath, expected, 'utf8');
}
