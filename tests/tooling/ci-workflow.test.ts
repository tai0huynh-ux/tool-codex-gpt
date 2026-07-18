import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = readFileSync(path.join(root, '.github/workflows/verify.yml'), 'utf8');

describe('repository verification workflow', () => {
  it('runs the complete credential-free gate with bounded execution', () => {
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('timeout-minutes: 20');
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).toContain('pnpm install --frozen-lockfile');
    expect(workflow).toContain('playwright install --with-deps chromium');
    expect(workflow).toContain('pnpm run verify');
    expect(workflow).toContain('actions/checkout@v7');
    expect(workflow).toContain('actions/setup-node@v7');
    expect(workflow).toContain('pnpm/action-setup@v6');
  });

  it('keeps live and Windows-only commands out of CI', () => {
    expect(workflow).not.toContain('test:codex-spike');
    expect(workflow).not.toContain('test:live');
    expect(workflow).not.toContain('pnpm.cmd');
    expect(workflow).not.toMatch(/secrets\./);
  });

  it('retains Playwright diagnostics when verification fails', () => {
    expect(workflow).toContain('if: failure()');
    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow).toContain('playwright-report/');
    expect(workflow).toContain('test-results/');
  });
});
