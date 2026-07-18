/* global console, process */

import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const out = path.join(root, 'artifacts', 'ui-acceptance', stamp);
const shots = path.join(out, 'screenshots');
await mkdir(shots, { recursive: true });
const appData = await mkdtemp(path.join(tmpdir(), 'codex-context-bridge-ui-'));
const fixture = await mkdtemp(path.join(tmpdir(), 'codex-context-bridge-fixture-'));
execFileSync('git', ['init', '--quiet', fixture]);
execFileSync('git', ['-C', fixture, 'config', 'user.email', 'fixture@example.invalid']);
execFileSync('git', ['-C', fixture, 'config', 'user.name', 'Fixture']);
await writeFile(path.join(fixture, 'README.md'), '# UI acceptance fixture\n');

const require = createRequire(path.join(root, 'apps', 'desktop', 'package.json'));
const electronPath = require('electron', { paths: [path.join(root, 'apps', 'desktop')] });
const acceptanceExecutable = process.env.CODEX_CONTEXT_BRIDGE_ACCEPTANCE_EXECUTABLE ?? electronPath;
const app = await electron.launch({
  executablePath: acceptanceExecutable,
  args:
    acceptanceExecutable === electronPath
      ? [path.join(root, 'apps', 'desktop', 'dist', 'main', 'main.js')]
      : [],
  env: { ...process.env, CODEX_CONTEXT_BRIDGE_APP_DATA: appData },
});
const page = await app.firstWindow();
page.setDefaultTimeout(5_000);
const runtimeErrors = [];
page.on('pageerror', (error) => runtimeErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(message.text());
});
await page.waitForSelector('.workspace-shell');
await page.setViewportSize({ width: 1280, height: 900 });
const results = [];
const inventory = await page.locator('button, input, form, [role]').evaluateAll((nodes) =>
  nodes.map((node, index) => ({
    id: node.getAttribute('data-testid') ?? `control-${index + 1}`,
    tag: node.tagName.toLowerCase(),
    role:
      node.getAttribute('role') ?? (node.tagName.toLowerCase() === 'button' ? 'button' : 'input'),
    label:
      node.getAttribute('aria-label') ??
      node.textContent?.trim() ??
      node.getAttribute('placeholder') ??
      '',
  })),
);
await page.screenshot({ path: path.join(shots, '01-initial.png'), fullPage: true });

async function check(id, action, expected) {
  const before = `${id}-before.png`;
  const after = `${id}-after.png`;
  await page.screenshot({ path: path.join(shots, before), fullPage: true });
  let actual = 'completed';
  let status = 'PASS';
  let error = '';
  try {
    await action();
    await page.waitForTimeout(120);
    if (!(await expected())) status = 'FAIL';
  } catch (caught) {
    status = 'FAIL';
    error = caught instanceof Error ? caught.message : String(caught);
    actual = 'error';
  }
  await page.screenshot({ path: path.join(shots, after), fullPage: true });
  results.push({
    id,
    status,
    input: id,
    expected: 'state predicate',
    actual,
    error,
    before,
    after,
  });
}

await check(
  'create-project',
  async () => {
    await page.getByLabel('Tên project mới').fill('UI Fixture Project');
    await page.getByRole('button', { name: 'Tạo' }).click();
  },
  async () => (await page.getByRole('button', { name: /UI Fixture Project/ }).count()) === 1,
);

await check(
  'invalid-repository-preview',
  async () => {
    await page.locator('.repository-form input').first().fill(path.join(root, 'not-a-repository'));
    await page.getByRole('button', { name: 'Phân tích repository' }).click();
  },
  async () =>
    (await page.getByRole('status').first().textContent())?.includes('Git repository') ?? false,
);

await check(
  'valid-repository-preview',
  async () => {
    await page.locator('.repository-form input').first().fill(fixture);
    await page.getByRole('button', { name: 'Phân tích repository' }).click();
  },
  async () => (await page.locator('.preview-card').count()) === 1,
);

await check(
  'confirm-mapping',
  async () => {
    await page.getByRole('button', { name: 'Xác nhận và ghi nhớ mapping' }).click();
  },
  async () => (await page.getByRole('status').first().textContent())?.includes('đăng ký') ?? false,
);

await check(
  'add-alias',
  async () => {
    await page.getByPlaceholder('Tên gọi khác').fill('fixture-alias');
    await page.getByRole('button', { name: 'Thêm bí danh' }).click();
  },
  async () => (await page.getByText('fixture-alias', { exact: true }).count()) > 0,
);

await check(
  'start-and-cancel-workflow',
  async () => {
    await page.getByRole('button', { name: 'Start guided workflow' }).click();
    await page.getByRole('button', { name: 'Cancel workflow' }).click();
  },
  async () =>
    (await page
      .getByText('Workflow cancelled through the validated main-process boundary.')
      .count()) === 1,
);

await check(
  'refresh-workflows',
  async () => {
    await page.getByRole('button', { name: 'Refresh diagnostics' }).click();
  },
  async () => (await page.getByText(/History is reconstructed|No workflow yet/).count()) > 0,
);

const summary = [
  `# Live UI Acceptance (${stamp})`,
  '',
  `- App: Electron renderer from commit ${execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()}`,
  `- Fixture: temporary Git repository (removed after run)`,
  `- Controls inventoried: ${inventory.length}`,
  `- Checks: ${results.length}; passed: ${results.filter((item) => item.status === 'PASS').length}; failed: ${results.filter((item) => item.status === 'FAIL').length}`,
  '- Folder picker, Edge live capture, and destructive archive were not invoked because they require native/user-session boundaries.',
].join('\n');
await writeFile(path.join(out, 'control-inventory.json'), JSON.stringify(inventory, null, 2));
await writeFile(path.join(out, 'control-results.json'), JSON.stringify(results, null, 2));
await writeFile(
  path.join(out, 'logs', 'runtime-errors.json'),
  JSON.stringify(runtimeErrors, null, 2),
).catch(async () => {
  await mkdir(path.join(out, 'logs'), { recursive: true });
  await writeFile(
    path.join(out, 'logs', 'runtime-errors.json'),
    JSON.stringify(runtimeErrors, null, 2),
  );
});
await writeFile(path.join(out, 'summary.md'), `${summary}\n`);
await app.close();
await rm(appData, { recursive: true, force: true });
await rm(fixture, { recursive: true, force: true });
console.log(JSON.stringify({ out, controls: inventory.length, results }, null, 2));
