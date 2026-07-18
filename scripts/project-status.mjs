import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function git(args, fallback = null) {
  try {
    return execFileSync('git', args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return fallback;
  }
}

const state = JSON.parse(
  readFileSync(path.join(repositoryRoot, '.agent-state', 'state.json'), 'utf8'),
);
const counts = git(['rev-list', '--left-right', '--count', 'origin/main...HEAD'], 'unknown');
const [behind, ahead] = counts === 'unknown' ? ['unknown', 'unknown'] : counts.split(/\s+/);
const workingTree = git(['status', '--porcelain'], 'unknown');

const report = {
  repo: git(['rev-parse', '--show-toplevel'], repositoryRoot),
  branch: git(['branch', '--show-current'], 'detached'),
  head: git(['rev-parse', 'HEAD'], 'unavailable'),
  originMain: git(['rev-parse', 'origin/main'], 'unavailable'),
  ahead,
  behind,
  workingTree: workingTree === '' ? 'clean' : workingTree === 'unknown' ? 'unknown' : 'dirty',
  currentPhase: state.currentPhase,
  currentTask: state.currentTaskId,
  lastCheckpoint: {
    id: state.lastCheckpoint.id,
    commit:
      git(['log', '-1', '--format=%H', '--', '.agent-state/state.json'], 'uncommitted') ||
      'uncommitted',
  },
  activeBlockers: state.activeBlockers,
  nextAction: state.nextActions[0],
};

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  for (const [key, value] of Object.entries(report)) {
    process.stdout.write(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}\n`);
  }
}
