import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createChatHistoryTransferBundle } from './chat-history-transfer';

const history = {
  schemaVersion: '1.0' as const,
  exportedAt: '2026-07-21T08:00:00.000Z',
  projectId: 'project-1',
  conversations: [
    {
      source: {
        id: 'source-1',
        provider: 'chatgpt',
        conversationId: 'conversation-1',
        title: 'Old account conversation',
        createdAt: '2026-07-20T08:00:00.000Z',
      },
      revisions: [
        {
          capturedAt: '2026-07-21T08:00:00.000Z',
          contentHash: 'a'.repeat(64),
          messages: [
            { role: 'user', text: 'Continue the project.' },
            { role: 'assistant', text: 'The current state is ready.' },
          ],
        },
      ],
    },
  ],
};

describe('ChatGPT account transfer bundle', () => {
  it('creates a secret-safe ZIP and an inline bootstrap for bounded history', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'chat-transfer-'));
    try {
      const result = await createChatHistoryTransferBundle({
        history,
        pilotId: 'pilot-1',
        outputDirectory: directory,
        now: () => '2026-07-21T08:00:00.000Z',
        createId: () => 'bundle-1',
      });

      expect(result).toMatchObject({
        conversationCount: 1,
        revisionCount: 1,
        deliveryMode: 'inline',
        createdAt: '2026-07-21T08:00:00.000Z',
      });
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.bootstrapContext).toContain('Continue the project.');
      expect(existsSync(result.zipPath)).toBe(true);

      const entries = unzipSync(readFileSync(result.zipPath));
      expect(strFromU8(entries['chat-history.json'] ?? new Uint8Array())).toContain(
        'Old account conversation',
      );
      expect(strFromU8(entries['manifest.json'] ?? new Uint8Array())).toContain('project-1');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps oversized history local and blocks detected secrets from transfer', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'chat-transfer-'));
    try {
      const oversized = structuredClone(history);
      const oversizedMessage = oversized.conversations[0]?.revisions[0]?.messages[0];
      if (!oversizedMessage) throw new Error('FIXTURE_MESSAGE_MISSING');
      oversizedMessage.text = 'x'.repeat(60_000);
      const oversizedResult = await createChatHistoryTransferBundle({
        history: oversized,
        pilotId: 'pilot-1',
        outputDirectory: directory,
        createId: () => 'bundle-2',
      });
      expect(oversizedResult).toMatchObject({ deliveryMode: 'manual_attachment' });
      expect(oversizedResult).not.toHaveProperty('bootstrapContext');

      const unsafe = structuredClone(history);
      const unsafeMessage = unsafe.conversations[0]?.revisions[0]?.messages[0];
      if (!unsafeMessage) throw new Error('FIXTURE_MESSAGE_MISSING');
      unsafeMessage.text = 'authorization: bearer abcdefghijklmnopqrstuvwxyz';
      await expect(
        createChatHistoryTransferBundle({
          history: unsafe,
          pilotId: 'pilot-1',
          outputDirectory: directory,
          createId: () => 'bundle-3',
        }),
      ).rejects.toThrow('CHAT_TRANSFER_SECRET_DETECTED');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
