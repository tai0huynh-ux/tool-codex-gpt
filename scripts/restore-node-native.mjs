import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const repositoryRoot = path.resolve(import.meta.dirname, '..');
const desktopDirectory = path.join(repositoryRoot, 'apps/desktop');
const packageDirectory = path.dirname(
  require.resolve('better-sqlite3/package.json', { paths: [desktopDirectory] }),
);

function canLoadNativeDatabase() {
  const probe = spawnSync(
    process.execPath,
    [
      '-e',
      `const Database=require(${JSON.stringify(packageDirectory)});const db=new Database(':memory:');db.close()`,
    ],
    { cwd: packageDirectory, stdio: 'ignore' },
  );
  return probe.status === 0;
}

if (!canLoadNativeDatabase()) {
  const installer = require.resolve('prebuild-install/bin.js', { paths: [packageDirectory] });
  const restore = spawnSync(
    process.execPath,
    [
      installer,
      '--runtime',
      'node',
      '--target',
      process.versions.node,
      '--arch',
      process.arch,
      '--platform',
      process.platform,
    ],
    { cwd: packageDirectory, stdio: 'inherit' },
  );
  if (restore.error) throw restore.error;
  if (restore.status !== 0) process.exit(restore.status ?? 1);
}

if (!canLoadNativeDatabase()) throw new Error('NODE_NATIVE_RUNTIME_RESTORE_FAILED');
