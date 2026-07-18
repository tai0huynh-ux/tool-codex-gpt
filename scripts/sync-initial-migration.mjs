import { readFileSync, writeFileSync } from 'node:fs';
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

const sourcePath = optionPath(
  '--source',
  path.join(repositoryRoot, 'packages/database/migrations/0001_initial.sql'),
);
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

function renderModule(sql) {
  return [
    '// Generated from migrations/0001_initial.sql by scripts/sync-initial-migration.mjs.',
    '// Edit the SQL source, then run `pnpm migrations:generate`.',
    'export const initialMigration =',
    `  ${JSON.stringify(sql)};`,
    '',
  ].join('\n');
}

const expected = renderModule(normalizeSql(readFileSync(sourcePath, 'utf8')));

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
