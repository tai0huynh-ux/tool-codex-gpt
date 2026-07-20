import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { scanTextForSecrets } from '@codex-context-bridge/secret-scanner';
import type { ChatHistoryExport } from './chat-archive';

const MAX_INLINE_HISTORY_CHARACTERS = 45_000;

export interface ChatHistoryTransferBundleResult {
  zipPath: string;
  sha256: string;
  payloadSha256: string;
  size: number;
  conversationCount: number;
  revisionCount: number;
  deliveryMode: 'inline' | 'manual_attachment';
  bootstrapContext?: string;
  createdAt: string;
}

export interface ChatHistoryTransferAuditEvent {
  action: 'chat.transfer.bundle.created' | 'chat.transfer.bundle.blocked';
  outcome: 'allowed' | 'blocked';
  reason?: string;
}

export async function createChatHistoryTransferBundle(input: {
  history: ChatHistoryExport;
  pilotId: string;
  outputDirectory: string;
  now?: () => string;
  createId?: () => string;
  audit?: (event: ChatHistoryTransferAuditEvent) => void | Promise<void>;
}): Promise<ChatHistoryTransferBundleResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const createId = input.createId ?? randomUUID;
  const historyJson = `${JSON.stringify(input.history, null, 2)}\n`;
  const findings = scanTextForSecrets(historyJson);
  if (findings.length > 0) {
    await input.audit?.({
      action: 'chat.transfer.bundle.blocked',
      outcome: 'blocked',
      reason: `SECRET_DETECTED:${findings.map((finding) => finding.ruleId).join(',')}`,
    });
    throw new Error('CHAT_TRANSFER_SECRET_DETECTED');
  }

  const revisionCount = input.history.conversations.reduce(
    (total, conversation) => total + conversation.revisions.length,
    0,
  );
  if (input.history.conversations.length === 0 || revisionCount === 0) {
    throw new Error('CHAT_ARCHIVE_EMPTY');
  }
  const createdAt = now();
  const historySha256 = createHash('sha256').update(historyJson, 'utf8').digest('hex');
  const manifest = {
    schemaVersion: '1.0',
    pilotId: input.pilotId,
    projectId: input.history.projectId,
    conversationCount: input.history.conversations.length,
    revisionCount,
    historySha256,
    createdAt,
  };
  const readme = [
    'Codex Context Bridge - ChatGPT account transfer',
    '',
    'This archive was generated from locally stored rendered conversation snapshots.',
    'Review it before attaching or sending it to another ChatGPT account.',
    `Project: ${input.history.projectId}`,
    `History SHA-256: ${historySha256}`,
    '',
  ].join('\n');
  const zip = zipSync(
    {
      'chat-history.json': strToU8(historyJson),
      'manifest.json': strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
      'README.txt': strToU8(readme),
    },
    { level: 9 },
  );
  const sha256 = createHash('sha256').update(zip).digest('hex');
  const safePilotId = input.pilotId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  const safeId = createId()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 80);
  const zipPath = path.join(input.outputDirectory, `chat-transfer-${safePilotId}-${safeId}.zip`);
  await mkdir(input.outputDirectory, { recursive: true });
  await writeFile(zipPath, zip, { flag: 'wx' });
  await input.audit?.({ action: 'chat.transfer.bundle.created', outcome: 'allowed' });

  const deliveryMode =
    historyJson.length <= MAX_INLINE_HISTORY_CHARACTERS ? 'inline' : 'manual_attachment';
  return {
    zipPath,
    sha256,
    payloadSha256: historySha256,
    size: zip.byteLength,
    conversationCount: input.history.conversations.length,
    revisionCount,
    deliveryMode,
    ...(deliveryMode === 'inline' ? { bootstrapContext: historyJson } : {}),
    createdAt,
  };
}
