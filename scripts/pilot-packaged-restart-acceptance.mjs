/* global console, process */

import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktopArtifactRoot = process.env.CODEX_CONTEXT_BRIDGE_DESKTOP_ARTIFACT_ROOT
  ? path.resolve(process.env.CODEX_CONTEXT_BRIDGE_DESKTOP_ARTIFACT_ROOT)
  : path.join(root, 'artifacts', 'desktop');
const executable = path.join(desktopArtifactRoot, 'win-unpacked', 'CodexContextBridge.exe');
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const outputRoot = path.join(root, 'artifacts', 'pilot-restart-acceptance', stamp);
const appData = await mkdtemp(path.join(tmpdir(), 'context-bridge-pilot-restart-app-'));
const fixtureRepository = await mkdtemp(path.join(tmpdir(), 'context-bridge-pilot-restart-repo-'));
const require = createRequire(path.join(root, 'apps', 'desktop', 'package.json'));
const BetterSqlite3 = require('better-sqlite3');
const finalResponse = 'Packaged restart retained the persisted terminal Codex report.';

await access(executable);
await mkdir(outputRoot, { recursive: true });
execFileSync('git', ['init', '--quiet', fixtureRepository]);
execFileSync('git', ['-C', fixtureRepository, 'config', 'user.email', 'fixture@example.invalid']);
execFileSync('git', ['-C', fixtureRepository, 'config', 'user.name', 'Fixture']);
await writeFile(path.join(fixtureRepository, 'README.md'), '# Packaged pilot restart fixture\n');

async function findDatabase(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findDatabase(candidate);
      if (nested) return nested;
    } else if (entry.name === 'context-bridge.sqlite') {
      return candidate;
    }
  }
  return undefined;
}

async function launchPackaged() {
  const runtimeErrors = [];
  const application = await electron.launch({
    executablePath: executable,
    env: { ...process.env, CODEX_CONTEXT_BRIDGE_APP_DATA: appData },
  });
  const page = await application.firstWindow();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  await page.waitForSelector('.workspace-shell');
  await page.setViewportSize({ width: 1440, height: 1000 });
  return { application, page, runtimeErrors };
}

let firstRun;
let secondRun;
try {
  firstRun = await launchPackaged();
  await firstRun.page.locator('.create-project input').fill('Packaged Restart Fixture');
  await firstRun.page.locator('.create-project button').click();
  await firstRun.page.locator('.repository-form input').first().fill(fixtureRepository);
  await firstRun.page.locator('.repository-form .primary-action').click();
  await firstRun.page.waitForSelector('.preview-card');
  await firstRun.page.locator('.confirm-action').click();
  await firstRun.page.waitForSelector('.pilot-deck');
  await firstRun.page.locator('.pilot-field textarea').fill('Create a restart-safe fixture.');
  await firstRun.page.locator('.pilot-primary').click();
  await firstRun.page.waitForSelector('.pilot-run-tabs button');
  await firstRun.page.screenshot({
    path: path.join(outputRoot, '01-before-restart.png'),
    fullPage: true,
  });
  await firstRun.application.close();
  firstRun = undefined;

  const databasePath = await findDatabase(appData);
  if (!databasePath) throw new Error('PACKAGED_RESTART_DATABASE_NOT_FOUND');
  const database = new BetterSqlite3(databasePath);
  const row = database
    .prepare("SELECT key, value_json FROM settings WHERE key LIKE 'live-project-pilot:%'")
    .get();
  if (!row) throw new Error('PACKAGED_RESTART_PILOT_NOT_FOUND');
  const pilot = JSON.parse(row.value_json);
  const terminalPilot = {
    ...pilot,
    status: 'codex_completed',
    codexRunId: 'packaged-restart-missing-run-handle',
    finalResponse,
    updatedAt: new Date().toISOString(),
  };
  database
    .prepare('UPDATE settings SET value_json = ?, updated_at = ? WHERE key = ?')
    .run(JSON.stringify(terminalPilot), terminalPilot.updatedAt, row.key);
  database.close();

  secondRun = await launchPackaged();
  await secondRun.page.waitForSelector('.pilot-run-tabs button');
  await secondRun.page.getByText(finalResponse, { exact: true }).waitFor();
  await secondRun.page.screenshot({
    path: path.join(outputRoot, '02-after-restart.png'),
    fullPage: true,
  });
  if (secondRun.runtimeErrors.length > 0) {
    throw new Error(`PACKAGED_RESTART_RUNTIME_ERRORS: ${secondRun.runtimeErrors.join(' | ')}`);
  }

  const result = {
    status: 'PASS',
    evidenceType: 'fixture-only packaged restart',
    executable,
    pilotId: terminalPilot.id,
    restoredStatus: terminalPilot.status,
    finalResponseVisible: true,
    runtimeErrors: secondRun.runtimeErrors,
  };
  await writeFile(path.join(outputRoot, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ outputRoot, ...result }, null, 2));
} finally {
  if (firstRun) await firstRun.application.close().catch(() => undefined);
  if (secondRun) await secondRun.application.close().catch(() => undefined);
  await rm(appData, { recursive: true, force: true });
  await rm(fixtureRepository, { recursive: true, force: true });
}
