import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

describe('desktop renderer artifact', () => {
  it('configures relative asset URLs for Electron file loading', () => {
    const config = readFileSync(path.join(repositoryRoot, 'apps/desktop/vite.config.ts'), 'utf8');
    expect(config).toContain("base: './'");
  });

  it('builds the sandboxed preload as CommonJS', () => {
    const packageJson = readFileSync(
      path.join(repositoryRoot, 'apps/desktop/package.json'),
      'utf8',
    );
    const buildConfig = readFileSync(
      path.join(repositoryRoot, 'apps/desktop/tsup.desktop.config.ts'),
      'utf8',
    );
    const mainSource = readFileSync(path.join(repositoryRoot, 'apps/desktop/src/main.ts'), 'utf8');
    expect(packageJson).toContain('tsup.desktop.config.ts');
    expect(buildConfig).toContain("entry: ['src/preload.ts']");
    expect(buildConfig).toContain("format: ['cjs']");
    expect(mainSource).toContain("'preload.cjs'");
  });

  it('packages the Codex runtime and rebuilds workspace dependencies first', () => {
    const packageJson = readFileSync(
      path.join(repositoryRoot, 'apps/desktop/package.json'),
      'utf8',
    );
    const packageScript = readFileSync(
      path.join(repositoryRoot, 'scripts/package-windows.ps1'),
      'utf8',
    );
    expect(packageJson).toContain('"@openai/codex": "0.144.5"');
    expect(packageJson).toContain(
      '"@openai/codex-win32-x64": "npm:@openai/codex@0.144.5-win32-x64"',
    );
    expect(packageScript).toContain('& pnpm.cmd run build');
  });

  it('keeps packaged pilot restart acceptance available as an explicit fixture-only gate', () => {
    const rootPackage = readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8');
    const acceptanceScript = readFileSync(
      path.join(repositoryRoot, 'scripts/pilot-packaged-restart-acceptance.mjs'),
      'utf8',
    );
    expect(rootPackage).toContain('"test:pilot-packaged-restart"');
    expect(acceptanceScript).toContain("evidenceType: 'fixture-only packaged restart'");
    expect(acceptanceScript).toContain("status: 'codex_completed'");
    expect(acceptanceScript).toContain('packaged-restart-missing-run-handle');
  });
});
