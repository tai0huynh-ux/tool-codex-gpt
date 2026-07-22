import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const environment = { ...process.env };
delete environment.npm_execpath;
delete environment.NPM_CLI_JS;

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const desktopDirectory = path.join(repositoryRoot, 'apps/desktop');
const cliPath = require.resolve('electron-builder/cli.js', { paths: [desktopDirectory] });
const outputOverride = environment.CODEX_CONTEXT_BRIDGE_DESKTOP_ARTIFACT_ROOT
  ? path.resolve(environment.CODEX_CONTEXT_BRIDGE_DESKTOP_ARTIFACT_ROOT)
  : undefined;
const builderArguments = [
  ...process.argv.slice(2),
  ...(outputOverride ? [`--config.directories.output=${outputOverride}`] : []),
];
const result = spawnSync(process.execPath, [cliPath, ...builderArguments], {
  env: environment,
  stdio: 'inherit',
});

if (result.error) throw result.error;

const restorePath = path.resolve(import.meta.dirname, 'restore-node-native.mjs');
const restore = spawnSync(process.execPath, [restorePath], { stdio: 'inherit' });
if (restore.error) throw restore.error;

process.exitCode = result.status || restore.status || 0;
