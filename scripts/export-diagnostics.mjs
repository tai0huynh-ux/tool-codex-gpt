import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, process.argv[2] ?? 'artifacts/diagnostics.json');
const state = JSON.parse(readFileSync(path.join(root, '.agent-state/state.json'), 'utf8'));
const git = (...args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();

const diagnostics = {
  schemaVersion: '1.0',
  product: 'Codex Context Bridge',
  appVersion: '0.1.0',
  platform: process.platform,
  architecture: process.arch,
  nodeVersion: process.version,
  branch: git('branch', '--show-current'),
  headCommit: git('rev-parse', 'HEAD'),
  originMain: git('rev-parse', 'origin/main'),
  workingTreeClean: git('status', '--short') === '',
  currentPhase: state.currentPhase,
  currentTaskId: state.currentTaskId,
  activeBlockers: state.activeBlockers,
  knownFailures: state.knownFailures,
  generatedAt: new Date().toISOString(),
};

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(diagnostics, null, 2)}\n`, 'utf8');
process.stdout.write(`${output}\n`);
