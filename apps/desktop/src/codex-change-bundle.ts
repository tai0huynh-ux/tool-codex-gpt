import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { strToU8, zipSync } from 'fflate';
import { inspectAllowedFile } from '@codex-context-bridge/file-store';
import { assertNoSecrets } from '@codex-context-bridge/secret-scanner';

const execFileAsync = promisify(execFile);
const MAX_STATUS_ENTRIES = 5_000;
const MAX_BUNDLE_FILES = 100;
const MAX_SINGLE_FILE_BYTES = 5 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;

export interface GitChangeBaselineEntry {
  path: string;
  status: string;
  sha256?: string;
  blockedReason?: string;
}

export interface GitChangeBaseline {
  head: string;
  entries: GitChangeBaselineEntry[];
  capturedAt: string;
}

export interface CodexChangeBundleResult {
  zipPath: string;
  sha256: string;
  size: number;
  changedFiles: string[];
  includedFiles: string[];
  blockedFiles: { path: string; reason: string }[];
  createdAt: string;
}

export interface CodexChangeBundleAuditEvent {
  action: 'bundle.file.included' | 'bundle.file.blocked' | 'bundle.created';
  outcome: 'allowed' | 'blocked';
  relativePath?: string;
  reason?: string;
}

interface GitStatusEntry {
  path: string;
  status: string;
}

async function runGit(repositoryRoot: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout;
}

function normalizeGitPath(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error('GIT_PATH_INVALID');
  }
  return normalized;
}

export function parsePorcelainStatus(output: string): GitStatusEntry[] {
  const records = output.split('\0');
  const entries: GitStatusEntry[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    if (record.length < 4 || record[2] !== ' ') throw new Error('GIT_STATUS_INVALID');
    const status = record.slice(0, 2);
    const currentPath = normalizeGitPath(record.slice(3));
    entries.push({ path: currentPath, status });
    if (status.includes('R') || status.includes('C')) index += 1;
  }
  if (entries.length > MAX_STATUS_ENTRIES) throw new Error('GIT_STATUS_TOO_LARGE');
  return entries;
}

function parseCommittedChanges(output: string): GitStatusEntry[] {
  const records = output.split('\0');
  const entries: GitStatusEntry[] = [];
  for (let index = 0; index < records.length;) {
    const status = records[index++];
    if (!status) continue;
    const firstPath = records[index++];
    if (!firstPath) throw new Error('GIT_DIFF_INVALID');
    if (status.startsWith('R') || status.startsWith('C')) {
      const destination = records[index++];
      if (!destination) throw new Error('GIT_DIFF_INVALID');
      entries.push({ path: normalizeGitPath(destination), status });
    } else {
      entries.push({ path: normalizeGitPath(firstPath), status });
    }
  }
  if (entries.length > MAX_STATUS_ENTRIES) throw new Error('GIT_DIFF_TOO_LARGE');
  return entries;
}

async function fingerprintEntry(
  repositoryRoot: string,
  entry: GitStatusEntry,
): Promise<GitChangeBaselineEntry> {
  if (entry.status.includes('D')) return entry;
  try {
    const inspected = await inspectAllowedFile(path.resolve(repositoryRoot, entry.path), {
      repositoryRoots: [repositoryRoot],
      maxBytes: MAX_SINGLE_FILE_BYTES,
    });
    return { ...entry, sha256: inspected.sha256 };
  } catch (error) {
    return {
      ...entry,
      blockedReason: error instanceof Error ? error.message : 'FILE_INSPECTION_FAILED',
    };
  }
}

export async function captureGitChangeBaseline(
  repositoryRoot: string,
  now: () => string = () => new Date().toISOString(),
): Promise<GitChangeBaseline> {
  const [head, statusOutput] = await Promise.all([
    runGit(repositoryRoot, ['rev-parse', 'HEAD']),
    runGit(repositoryRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
  ]);
  const entries = await Promise.all(
    parsePorcelainStatus(statusOutput).map((entry) => fingerprintEntry(repositoryRoot, entry)),
  );
  return { head: head.trim(), entries, capturedAt: now() };
}

function entrySignature(entry: GitChangeBaselineEntry | undefined): string {
  return entry
    ? JSON.stringify([entry.status, entry.sha256 ?? null, entry.blockedReason ?? null])
    : 'clean';
}

function isBinary(content: Buffer): boolean {
  return content.subarray(0, Math.min(content.length, 8_192)).includes(0);
}

async function writeZip(
  zipPath: string,
  report: string,
  manifest: object,
  files: { relativePath: string; content: Uint8Array }[],
): Promise<void> {
  await mkdir(path.dirname(zipPath), { recursive: true });
  const entries: Record<string, Uint8Array> = {
    'codex-report.txt': strToU8(report),
    'manifest.json': strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
  };
  for (const file of files) entries[`files/${file.relativePath}`] = file.content;
  await writeFile(zipPath, zipSync(entries, { level: 9 }), { flag: 'wx' });
}

export async function createCodexChangeBundle(input: {
  repositoryRoot: string;
  baseline: GitChangeBaseline;
  finalResponse: string;
  outputDirectory: string;
  pilotId: string;
  now?: () => string;
  audit?: (event: CodexChangeBundleAuditEvent) => void | Promise<void>;
}): Promise<CodexChangeBundleResult> {
  assertNoSecrets(input.finalResponse);
  const now = input.now ?? (() => new Date().toISOString());
  const [currentHead, currentStatusOutput] = await Promise.all([
    runGit(input.repositoryRoot, ['rev-parse', 'HEAD']),
    runGit(input.repositoryRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
  ]);
  const currentStatus = parsePorcelainStatus(currentStatusOutput);
  const committed =
    currentHead.trim() === input.baseline.head
      ? []
      : parseCommittedChanges(
          await runGit(input.repositoryRoot, [
            'diff',
            '--name-status',
            '-z',
            `${input.baseline.head}..${currentHead.trim()}`,
          ]),
        );
  const baselineByPath = new Map(input.baseline.entries.map((entry) => [entry.path, entry]));
  const currentFingerprints = await Promise.all(
    currentStatus.map((entry) => fingerprintEntry(input.repositoryRoot, entry)),
  );
  const currentByPath = new Map(currentFingerprints.map((entry) => [entry.path, entry]));
  const changed = new Map<string, string>();
  for (const entry of committed) changed.set(entry.path, entry.status);
  for (const entry of currentFingerprints) {
    if (entrySignature(entry) !== entrySignature(baselineByPath.get(entry.path))) {
      changed.set(entry.path, entry.status);
    }
  }
  const changedFiles = [...changed.keys()].sort((left, right) => left.localeCompare(right));
  const includedFiles: string[] = [];
  const blockedFiles: { path: string; reason: string }[] = [];
  const files: { relativePath: string; content: Uint8Array }[] = [];
  let totalBytes = 0;

  for (const relativePath of changedFiles) {
    const status = currentByPath.get(relativePath)?.status ?? changed.get(relativePath) ?? '';
    if (status.includes('D')) {
      blockedFiles.push({ path: relativePath, reason: 'DELETED_FILE_MANIFEST_ONLY' });
      continue;
    }
    if (files.length >= MAX_BUNDLE_FILES) {
      blockedFiles.push({ path: relativePath, reason: 'BUNDLE_FILE_LIMIT' });
      continue;
    }
    try {
      const inspected = await inspectAllowedFile(path.resolve(input.repositoryRoot, relativePath), {
        repositoryRoots: [input.repositoryRoot],
        maxBytes: MAX_SINGLE_FILE_BYTES,
      });
      if (isBinary(inspected.content)) throw new Error('BINARY_FILE');
      if (totalBytes + inspected.size > MAX_BUNDLE_BYTES) throw new Error('BUNDLE_SIZE_LIMIT');
      totalBytes += inspected.size;
      includedFiles.push(relativePath);
      files.push({ relativePath, content: inspected.content });
      await input.audit?.({
        action: 'bundle.file.included',
        outcome: 'allowed',
        relativePath,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'FILE_INSPECTION_FAILED';
      blockedFiles.push({ path: relativePath, reason });
      await input.audit?.({
        action: 'bundle.file.blocked',
        outcome: 'blocked',
        relativePath,
        reason,
      });
    }
  }

  const createdAt = now();
  const safePilotId = input.pilotId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  const timestamp = createdAt.replace(/[-:.]/g, '').replace('Z', 'Z');
  const zipPath = path.join(input.outputDirectory, `codex-${safePilotId}-${timestamp}.zip`);
  const manifest = {
    schemaVersion: '1.0',
    pilotId: input.pilotId,
    baselineHead: input.baseline.head,
    finalHead: currentHead.trim(),
    changedFiles,
    includedFiles,
    blockedFiles,
    createdAt,
  };
  const report = `Codex final report\n\n${input.finalResponse.trim()}\n`;
  await writeZip(zipPath, report, manifest, files);
  const content = await readFile(zipPath);
  const metadata = await stat(zipPath);
  const result = {
    zipPath,
    sha256: createHash('sha256').update(content).digest('hex'),
    size: metadata.size,
    changedFiles,
    includedFiles,
    blockedFiles,
    createdAt,
  };
  await input.audit?.({ action: 'bundle.created', outcome: 'allowed' });
  return result;
}
