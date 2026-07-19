import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PILOT_HEADING, PILOT_PARAGRAPH, verifyStaticWebsite } from './website-verifier';

const directories: string[] = [];

function fixture(html: string, css = 'body { color: #17251d; }'): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'context-bridge-website-'));
  directories.push(directory);
  writeFileSync(path.join(directory, 'index.html'), html, 'utf8');
  writeFileSync(path.join(directory, 'styles.css'), css, 'utf8');
  return directory;
}

afterEach(() => {
  while (directories.length) {
    const directory = directories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe('static website verifier', () => {
  it('accepts the required local HTML and CSS without executing either file', async () => {
    const root = fixture(`<!doctype html>
      <html lang="vi"><head><link rel="stylesheet" href="styles.css"></head>
      <body><h1>${PILOT_HEADING}</h1><p>${PILOT_PARAGRAPH}</p></body></html>`);
    const result = await verifyStaticWebsite(root, () => '2026-07-19T08:00:00.000Z');
    expect(result.status).toBe('passed');
    expect(result.files.sort()).toEqual(['index.html', 'styles.css']);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it('rejects missing required Vietnamese content and malformed HTML', async () => {
    const root = fixture('<main><h1>Wrong heading</h1></main>');
    const result = await verifyStaticWebsite(root);
    expect(result.status).toBe('failed');
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'html_parse', passed: false }),
        expect.objectContaining({ name: 'heading_text', passed: false }),
        expect.objectContaining({ name: 'paragraph_text', passed: false }),
      ]),
    );
  });

  it('rejects scripts, forms, iframes, handlers, external URLs, and CSS imports', async () => {
    const root = fixture(
      `<html><body onload="run()"><h1>${PILOT_HEADING}</h1><p>${PILOT_PARAGRAPH}</p>
       <script src="https://example.com/a.js"></script><iframe></iframe><form></form></body></html>`,
      '@import "https://example.com/site.css";',
    );
    const result = await verifyStaticWebsite(root);
    expect(result.status).toBe('failed');
    for (const name of [
      'no_script',
      'no_iframe',
      'no_form',
      'no_external_url',
      'no_inline_handler',
      'styles_file',
    ]) {
      expect(result.checks).toContainEqual(expect.objectContaining({ name, passed: false }));
    }
  });

  it('fails closed when the canonical repository root does not exist', async () => {
    const result = await verifyStaticWebsite(path.join(tmpdir(), 'missing-context-bridge-root'));
    expect(result).toMatchObject({
      status: 'failed',
      files: [],
      checks: [{ name: 'repository_root', passed: false }],
    });
  });
});
