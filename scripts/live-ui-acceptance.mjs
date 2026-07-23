/* global console, document, process */

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
const inventoryByKey = new Map();
async function collectControls(stage) {
  const controls = await page
    .locator('button, input, select, textarea, form, [role]')
    .evaluateAll((nodes) =>
      nodes.map((node, index) => ({
        id: node.getAttribute('data-testid') ?? `control-${index + 1}`,
        tag: node.tagName.toLowerCase(),
        role:
          node.getAttribute('role') ??
          (node.tagName.toLowerCase() === 'button' ? 'button' : 'input'),
        label:
          node.getAttribute('aria-label') ??
          node.textContent?.trim() ??
          node.getAttribute('placeholder') ??
          '',
      })),
    );
  for (const control of controls) {
    const key = `${control.tag}:${control.role}:${control.label}`;
    if (!inventoryByKey.has(key)) inventoryByKey.set(key, { ...control, firstObservedAt: stage });
  }
}
await collectControls('initial');
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
  await collectControls(`${id}:after`);
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
  async () =>
    (await page
      .locator('.project-list .project-item')
      .filter({ hasText: 'UI Fixture Project' })
      .count()) === 1,
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
  'refresh-codex-catalog-and-expand-threads',
  async () => {
    await page.locator('.pilot-target-browser .pilot-card-heading button').click();
    const project = page.locator('.pilot-target-project').filter({ hasText: 'ai-manga-upscaler' });
    await project.locator(':scope > button').click();
    const showMore = project.locator('.show-more');
    if ((await showMore.count()) > 0) await showMore.click();
  },
  async () => {
    const project = page.locator('.pilot-target-project').filter({ hasText: 'ai-manga-upscaler' });
    return (await project.locator('.pilot-target-threads > button').count()) >= 5;
  },
);

await check(
  'sample-request-and-destination-toggle',
  async () => {
    await page.locator('.pilot-inline button').click();
    await page.locator('input[type="radio"]').first().check();
    await page.locator('input[type="radio"]').nth(1).check();
  },
  async () =>
    (await page.locator('input[type="radio"]').nth(1).isChecked()) &&
    (await page.locator('textarea').first().inputValue()).length > 0,
);

await check(
  'pilot-create-and-delete-draft',
  async () => {
    await page.locator('textarea').first().fill('UI pilot smoke request');
    await page.locator('textarea').nth(1).fill('Keep the result concise.');
    await page
      .locator('.pilot-notes-editor')
      .first()
      .locator('select')
      .first()
      .selectOption('codex');
    await page
      .locator('.pilot-notes-editor')
      .first()
      .locator('select')
      .last()
      .selectOption('repeat');
    await page.locator('.pilot-notes-editor').first().locator('button').first().click();
    await page.locator('.pilot-notes-editor').first().locator('.pilot-note-list button').click();
    await page.locator('textarea').nth(1).fill('Keep the result concise.');
    await page.locator('.pilot-notes-editor').first().locator('button').first().click();
    await page.locator('.pilot-primary').click();
  },
  async () => {
    const deleteButton = page.locator('.pilot-run-delete').first();
    if ((await deleteButton.count()) !== 1) return false;
    page.once('dialog', (dialog) => void dialog.accept());
    await deleteButton.click();
    await deleteButton.waitFor({ state: 'detached' });
    return true;
  },
);

await check(
  'start-run-stop-workflow',
  async () => {
    await page.getByRole('button', { name: 'Start guided workflow' }).click();
    await page.locator('[aria-label^="Chạy workflow"]').first().click();
    await page.getByRole('button', { name: /Dừng workflow/ }).click();
  },
  async () => {
    const stop = page.getByRole('button', { name: /Dừng workflow/ }).first();
    return await stop.isDisabled();
  },
);

await check(
  'rerun-stopped-workflow',
  async () => {
    await page.locator('[aria-label^="Chạy lại workflow"]').first().click();
  },
  async () =>
    (await page.locator('.run-card.active .state-badge').textContent())?.trim() ===
      'Review context' && (await page.locator('.run-card').count()) === 2,
);

await check(
  'workflow-controlled-note-add-delete-stop',
  async () => {
    await page.getByLabel('Đích ghi chú workflow').selectOption('chatgpt');
    await page.getByLabel('Chế độ ghi chú workflow').selectOption('repeat');
    await page
      .getByLabel('Ghi chú workflow', { exact: true })
      .fill('Ghi chú acceptance có kiểm soát.');
    await page.getByRole('button', { name: 'Thêm ghi chú', exact: true }).click();
    await page.locator('.workflow-note-row').waitFor();
    await page.locator('.workflow-note-row button').click();
    await page.locator('.run-card.active [aria-label^="Dừng workflow"]').click();
  },
  async () => {
    const active = page.locator('.run-card.active');
    return (
      (await page.locator('.workflow-note-row').count()) === 0 &&
      (await active.locator('.state-badge').textContent())?.trim() === 'Cancelled' &&
      (await active.locator('[aria-label^="Dừng workflow"]').isDisabled())
    );
  },
);

await check(
  'delete-terminal-workflows',
  async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const deleteButton = page.locator('.run-delete:not([disabled])').first();
      if ((await deleteButton.count()) === 0) return;
      const beforeCount = await page.locator('.run-card').count();
      page.once('dialog', (dialog) => void dialog.accept());
      await deleteButton.click();
      await page.waitForFunction(
        (count) => document.querySelectorAll('.run-card').length < count,
        beforeCount,
      );
    }
    throw new Error('Terminal workflow cleanup exceeded its safety bound.');
  },
  async () => (await page.locator('.run-card').count()) === 0,
);

await check(
  'workflow-log-dialog-refresh-close',
  async () => {
    await page.locator('.workflow-log-trigger').click();
    await page.locator('.workflow-log-actions button').first().click();
    await page.locator('.workflow-log-actions button').last().click();
  },
  async () => (await page.locator('.workflow-log-dialog').count()) === 0,
);

await check(
  'refresh-workflows',
  async () => {
    await page.getByRole('button', { name: 'Refresh diagnostics' }).click();
  },
  async () => (await page.getByText(/History is reconstructed|No workflow yet/).count()) > 0,
);

await check(
  'cleanup-preserved-pilot-workflow',
  async () => {
    const card = page.locator('.run-card').first();
    if ((await card.count()) === 0) return;
    const stop = card.locator('button[aria-label^="Dừng workflow"]');
    if ((await stop.count()) > 0 && !(await stop.isDisabled())) await stop.click();
    const deleteButton = card.locator('.run-delete');
    if ((await deleteButton.count()) === 0) return;
    page.once('dialog', (dialog) => void dialog.accept());
    await deleteButton.click();
  },
  async () => (await page.locator('.run-card').count()) === 0,
);

await check(
  'archive-fixture-project',
  async () => {
    page.once('dialog', (dialog) => void dialog.accept());
    await page.locator('.archive-action').click();
  },
  async () => (await page.locator('.project-list .project-item').count()) === 0,
);

const summary = [
  `# Live UI Acceptance (${stamp})`,
  '',
  `- App: Electron renderer from commit ${execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()}`,
  `- Fixture: temporary Git repository (removed after run)`,
  `- Controls inventoried: ${inventoryByKey.size}`,
  `- Checks: ${results.length}; passed: ${results.filter((item) => item.status === 'PASS').length}; failed: ${results.filter((item) => item.status === 'FAIL').length}`,
  '- Folder picker, Edge live capture, account transfer, and Codex write actions were not invoked because they require native/user-session boundaries or explicit external approval.',
].join('\n');
const inventory = [...inventoryByKey.values()];
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
if (results.some((item) => item.status === 'FAIL')) process.exitCode = 1;
