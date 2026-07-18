import { describe, expect, it, vi } from 'vitest';
import { createExtensionOperationExecutor, type BrowserTabs } from './operation-executor';

function tabs(overrides: Partial<BrowserTabs> = {}): BrowserTabs {
  return {
    query: () =>
      Promise.resolve([
        { id: 10, url: 'https://chatgpt.com/c/other', active: false, lastAccessed: 2 },
        { id: 20, url: 'https://chatgpt.com/c/target', active: false, lastAccessed: 1 },
        { id: 30, url: 'https://chatgpt.com/', active: true, lastAccessed: 3 },
      ]),
    sendMessage: () => Promise.resolve({ inserted: true, sent: false, textHash: 'a'.repeat(64) }),
    ...overrides,
  };
}

describe('extension operation executor', () => {
  it('reports degraded health without a rendered ChatGPT tab', async () => {
    const executor = createExtensionOperationExecutor(tabs({ query: () => Promise.resolve([]) }));
    await expect(executor.execute({ type: 'bridge.health' })).resolves.toEqual({
      type: 'bridge.health.result',
      status: 'degraded',
    });
  });

  it('routes an existing conversation to the exact URL identity', async () => {
    const sendMessage = vi.fn(() =>
      Promise.resolve({ inserted: true, sent: false, textHash: 'a'.repeat(64) }),
    );
    const executor = createExtensionOperationExecutor(tabs({ sendMessage }));
    const operation = {
      type: 'composer.insert',
      text: 'reviewed text',
      effectId: 'effect-1',
      payloadHash: 'a'.repeat(64),
      destination: { mode: 'existing', conversationId: 'target' },
    };

    await expect(executor.execute(operation)).resolves.toMatchObject({
      type: 'composer.insert.result',
      inserted: true,
      sent: false,
    });
    expect(sendMessage).toHaveBeenCalledWith(20, {
      type: 'insert-composer-text',
      text: 'reviewed text',
      effectId: 'effect-1',
      payloadHash: 'a'.repeat(64),
    });
  });

  it('uses the active user-opened tab for a new-chat destination', async () => {
    const sendMessage = vi.fn(() =>
      Promise.resolve({ inserted: true, sent: false, textHash: 'b'.repeat(64) }),
    );
    const executor = createExtensionOperationExecutor(tabs({ sendMessage }));
    await executor.execute({
      type: 'composer.insert',
      text: 'new chat text',
      effectId: 'effect-2',
      payloadHash: 'b'.repeat(64),
      destination: { mode: 'new' },
    });
    expect(sendMessage).toHaveBeenCalledWith(30, expect.any(Object));
  });

  it('fails closed when the requested conversation is not open', async () => {
    const executor = createExtensionOperationExecutor(tabs());
    await expect(
      executor.execute({
        type: 'composer.insert',
        text: 'text',
        effectId: 'effect-3',
        payloadHash: 'c'.repeat(64),
        destination: { mode: 'existing', conversationId: 'missing' },
      }),
    ).rejects.toThrow('CHATGPT_TAB_NOT_FOUND');
  });

  it('does not route a new-chat handoff into an existing conversation tab', async () => {
    const executor = createExtensionOperationExecutor(
      tabs({
        query: () =>
          Promise.resolve([{ id: 20, url: 'https://chatgpt.com/c/existing', active: true }]),
      }),
    );
    await expect(
      executor.execute({
        type: 'composer.insert',
        text: 'new chat only',
        effectId: 'effect-4',
        payloadHash: 'd'.repeat(64),
        destination: { mode: 'new' },
      }),
    ).rejects.toThrow('CHATGPT_TAB_NOT_FOUND');
  });
});
