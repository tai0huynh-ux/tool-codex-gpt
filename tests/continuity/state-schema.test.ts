import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { scanTextForSecrets } from '@codex-context-bridge/secret-scanner';

const root = path.resolve(import.meta.dirname, '../..');
const state = JSON.parse(
  readFileSync(path.join(root, '.agent-state/state.json'), 'utf8'),
) as object;
const schema = JSON.parse(
  readFileSync(path.join(root, '.agent-state/state.schema.json'), 'utf8'),
) as object;

describe('project continuity', () => {
  it('validates the committed state and rejects missing required fields', () => {
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    expect(validate(state)).toBe(true);
    expect(validate({ schemaVersion: '1.0' })).toBe(false);
  });

  it('runs the read-only project status helper', () => {
    const output = execFileSync(
      process.execPath,
      [path.join(root, 'scripts/project-status.mjs'), '--json'],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );
    const report = JSON.parse(output) as {
      head: string;
      currentTask: string;
      activeBlockers: string[];
    };

    expect(report.head).toMatch(/^[a-f0-9]{40}$/);
    expect(report.currentTask).toBe('P1-TOOL-001');
    expect(report.activeBlockers).toContain('CODEX-SDK-001');
  });

  it('keeps continuity records free of detected secrets', () => {
    const files = [
      'STATUS.md',
      'ROADMAP.md',
      'RECOVERY.md',
      'WORKLOG.md',
      'BLOCKERS.md',
      'TEST_MATRIX.md',
      'RELEASE_CHECKLIST.md',
      'RESEARCH.md',
    ];
    const content = files
      .map((file) => readFileSync(path.join(root, 'docs/continuity', file), 'utf8'))
      .join('\n');

    expect(scanTextForSecrets(content)).toEqual([]);
  });
});
