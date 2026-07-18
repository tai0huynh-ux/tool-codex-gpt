import type {
  LocalTransportOperation,
  LocalTransportResult,
} from '@codex-context-bridge/contracts';
import { describe, expect, it } from 'vitest';
import { runInstalledChatGptSmoke } from '../../scripts/smoke-installed-chatgpt';

describe('installed ChatGPT smoke harness', () => {
  it('captures only redacted evidence and inserts without submitting before exact cleanup', async () => {
    const operations: LocalTransportOperation[] = [];
    const bridge = {
      execute(operation: LocalTransportOperation): Promise<LocalTransportResult> {
        operations.push(operation);
        let result: LocalTransportResult;
        switch (operation.type) {
          case 'bridge.health':
            result = { type: 'bridge.health.result', status: 'ready' };
            break;
          case 'page.inspect':
            result = {
              type: 'page.inspect.result',
              inspection: {
                page: { mode: 'existing', conversationId: 'private-conversation-id' },
                composer: { available: true, readOnly: false },
              },
            };
            break;
          case 'conversation.capture':
            result = {
              type: 'conversation.capture.result',
              snapshot: {
                title: 'Private title',
                messages: [{ role: 'user', text: 'Private rendered message' }],
                contentHash: 'a'.repeat(64),
                capturedAt: '2026-07-18T15:00:00.000Z',
              },
            };
            break;
          case 'composer.insert':
            result = {
              type: 'composer.insert.result',
              inserted: true,
              sent: false,
              textHash: operation.payloadHash,
            };
            break;
          case 'composer.clear':
            result = { type: 'composer.clear.result', cleared: true };
            break;
          default:
            throw new Error('UNEXPECTED_OPERATION');
        }
        return Promise.resolve(result);
      },
    };

    const result = await runInstalledChatGptSmoke(bridge, () => 'effect-1');

    expect(result).toEqual({
      status: 'passed',
      health: 'ready',
      pageMode: 'existing',
      capturedMessages: 1,
      snapshotHash: 'a'.repeat(64),
      composerInserted: true,
      composerSent: false,
      composerCleared: true,
    });
    expect(JSON.stringify(result)).not.toContain('Private');
    expect(operations.map((operation) => operation.type)).toEqual([
      'bridge.health',
      'page.inspect',
      'conversation.capture',
      'composer.insert',
      'composer.clear',
    ]);
  });

  it('refuses to overwrite an existing composer draft', async () => {
    const bridge = {
      execute(operation: LocalTransportOperation): Promise<LocalTransportResult> {
        if (operation.type === 'bridge.health') {
          return Promise.resolve({ type: 'bridge.health.result', status: 'ready' });
        }
        if (operation.type === 'page.inspect') {
          return Promise.resolve({
            type: 'page.inspect.result',
            inspection: {
              page: { mode: 'new' },
              composer: { available: true, readOnly: false, textHash: 'b'.repeat(64) },
            },
          });
        }
        return Promise.reject(new Error('UNEXPECTED_OPERATION'));
      },
    };

    await expect(runInstalledChatGptSmoke(bridge)).rejects.toThrow(
      'LIVE_CHATGPT_COMPOSER_NOT_EMPTY',
    );
  });
});
