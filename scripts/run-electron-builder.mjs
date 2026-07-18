import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const environment = { ...process.env };
delete environment.npm_execpath;
delete environment.NPM_CLI_JS;

const cliPath = path.resolve('node_modules/electron-builder/cli.js');
const result = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
  env: environment,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
