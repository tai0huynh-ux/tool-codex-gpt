import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { assertNoSecrets } from '@codex-context-bridge/secret-scanner';

export const defaultExclusions = [
  '.env',
  '*.pem',
  '*.key',
  'id_rsa*',
  'credentials*',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
] as const;

export interface FileAuditEvent {
  id: string;
  eventType: 'file.accepted' | 'file.blocked' | 'file.deduplicated';
  outcome: 'allowed' | 'blocked';
  sourcePath: string;
  sha256?: string;
  reason?: string;
}

export interface StoredFile {
  sha256: string;
  size: number;
  storagePath: string;
  deduplicated: boolean;
}

export interface FileStoreOptions {
  storageRoot: string;
  repositoryRoots: string[];
  maxBytes?: number;
  exclusions?: string[];
  audit?: (event: FileAuditEvent) => void | Promise<void>;
}

export interface SafeFileInspection {
  canonicalPath: string;
  relativePath: string;
  content: Buffer;
  sha256: string;
  size: number;
}

export interface SafeFileInspectionOptions {
  repositoryRoots: string[];
  maxBytes?: number;
  exclusions?: string[];
}

function normalizeForComparison(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(normalizeForComparison(root), normalizeForComparison(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function wildcardMatch(value: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) return value.toLowerCase().endsWith(pattern.slice(1).toLowerCase());
  if (pattern.endsWith('*'))
    return value.toLowerCase().startsWith(pattern.slice(0, -1).toLowerCase());
  return value.toLowerCase() === pattern.toLowerCase();
}

export function isExcludedPath(relativePath: string, rules: string[]): boolean {
  return relativePath
    .split(/[\\/]/)
    .some((segment) => rules.some((rule) => wildcardMatch(segment, rule)));
}

export async function inspectAllowedFile(
  sourcePath: string,
  options: SafeFileInspectionOptions,
): Promise<SafeFileInspection> {
  const absoluteInput = path.resolve(sourcePath);
  const allowedRoot = options.repositoryRoots.find((root) => isPathInside(root, absoluteInput));
  if (!allowedRoot) throw new Error('PATH_OUTSIDE_ALLOWLIST');

  const canonicalRoot = await realpath(allowedRoot);
  const canonicalSource = await realpath(absoluteInput);
  if (!isPathInside(canonicalRoot, canonicalSource)) throw new Error('SYMLINK_OUTSIDE_ALLOWLIST');

  const relativePath = path.relative(canonicalRoot, canonicalSource);
  const exclusions = [...defaultExclusions, ...(options.exclusions ?? [])];
  if (isExcludedPath(relativePath, exclusions)) throw new Error('FILE_EXCLUDED');

  const metadata = await stat(canonicalSource);
  if (!metadata.isFile()) throw new Error('NOT_A_FILE');
  if (metadata.size > (options.maxBytes ?? 10 * 1024 * 1024)) throw new Error('FILE_TOO_LARGE');

  const content = await readFile(canonicalSource);
  assertNoSecrets(content.toString('utf8'));
  return {
    canonicalPath: canonicalSource,
    relativePath,
    content,
    sha256: createHash('sha256').update(content).digest('hex'),
    size: metadata.size,
  };
}

export class ContentAddressedFileStore {
  private readonly maxBytes: number;

  public constructor(private readonly options: FileStoreOptions) {
    this.maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  }

  public async ingest(sourcePath: string): Promise<StoredFile> {
    const absoluteInput = path.resolve(sourcePath);
    try {
      const inspected = await inspectAllowedFile(sourcePath, {
        repositoryRoots: this.options.repositoryRoots,
        maxBytes: this.maxBytes,
        ...(this.options.exclusions ? { exclusions: this.options.exclusions } : {}),
      });
      const { canonicalPath, sha256, size } = inspected;
      const storagePath = path.join(this.options.storageRoot, sha256.slice(0, 2), sha256);

      let deduplicated = false;
      try {
        const existing = await stat(storagePath);
        deduplicated = existing.isFile();
      } catch {
        await mkdir(path.dirname(storagePath), { recursive: true });
        await copyFile(canonicalPath, storagePath);
      }

      await this.options.audit?.({
        id: randomUUID(),
        eventType: deduplicated ? 'file.deduplicated' : 'file.accepted',
        outcome: 'allowed',
        sourcePath: canonicalPath,
        sha256,
      });
      return { sha256, size, storagePath, deduplicated };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'UNKNOWN_FILE_ERROR';
      await this.options.audit?.({
        id: randomUUID(),
        eventType: 'file.blocked',
        outcome: 'blocked',
        sourcePath: absoluteInput,
        reason,
      });
      throw error;
    }
  }
}
