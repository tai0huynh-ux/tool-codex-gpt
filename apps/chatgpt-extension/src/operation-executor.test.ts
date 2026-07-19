import { describe, expect, it, vi } from 'vitest';
import { createExtensionOperationExecutor, type BrowserTabs } from './operation-executor';

function tabs(overrides: Partial<BrowserTabs> = {}): BrowserTabs {
  return {
    query: () =>
      Promise.resolve([
        { id: 10, url: 'https://chatgpt.com/c/other', active: false, lastAccessed: 2 },
        {
          id: 20,
          url: 'https://chatgpt.com/g/project-1/c/target',
          active: false,
          lastAccessed: 1,
        },
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

  it('captures only the exact existing conversation tab', async () => {
    const sendMessage = vi.fn(() =>
      Promise.resolve({
        title: 'Target',
        messages: [{ role: 'user', text: 'hello' }],
        contentHash: 'a'.repeat(64),
        capturedAt: '2026-07-19T08:00:00.000Z',
      }),
    );
    const executor = createExtensionOperationExecutor(tabs({ sendMessage }));
    await executor.execute({
      type: 'conversation.capture',
      destination: { mode: 'existing', conversationId: 'target' },
    });
    expect(sendMessage).toHaveBeenCalledWith(20, { type: 'capture-conversation' });
  });

  it('checks streaming status on the exact existing conversation tab', async () => {
    const sendMessage = vi.fn(() =>
      Promise.resolve({
        streaming: false,
        structuredResponse: {
          ok: false,
          error: { code: 'MARKER_NOT_FOUND', message: 'Not found.' },
        },
      }),
    );
    const executor = createExtensionOperationExecutor(tabs({ sendMessage }));
    await executor.execute({
      type: 'page.status',
      destination: { mode: 'existing', conversationId: 'target' },
    });
    expect(sendMessage).toHaveBeenCalledWith(20, { type: 'page-status' });
  });

  it('reloads only the requested existing conversation tab', async () => {
    const sendMessage = vi.fn(() => Promise.resolve({ reloaded: true }));
    const executor = createExtensionOperationExecutor(tabs({ sendMessage }));

    await expect(
      executor.execute({
        type: 'page.reload',
        destination: { mode: 'existing', conversationId: 'target' },
      }),
    ).resolves.toEqual({ type: 'page.reload.result', reloaded: true });
    expect(sendMessage).toHaveBeenCalledWith(20, { type: 'reload-page' });
  });

  it('injects the content script once when an existing tab has no receiver', async () => {
    const sendMessage = vi
      .fn<BrowserTabs['sendMessage']>()
      .mockRejectedValueOnce(
        new Error('Could not establish connection. Receiving end does not exist.'),
      )
      .mockResolvedValueOnce({ inserted: true, sent: false, textHash: 'a'.repeat(64) });
    const injectContentScript = vi.fn(() => Promise.resolve());
    const executor = createExtensionOperationExecutor(tabs({ sendMessage, injectContentScript }));

    await expect(
      executor.execute({
        type: 'composer.insert',
        text: 'reviewed text',
        effectId: 'effect-inject',
        payloadHash: 'a'.repeat(64),
        destination: { mode: 'existing', conversationId: 'target' },
      }),
    ).resolves.toMatchObject({ type: 'composer.insert.result', inserted: true, sent: false });
    expect(injectContentScript).toHaveBeenCalledWith(20);
    expect(sendMessage).toHaveBeenCalledTimes(2);
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

  it('routes an approved submit to the same exact destination identity', async () => {
    const sendMessage = vi.fn(() => Promise.resolve({ submitted: true, textHash: 'b'.repeat(64) }));
    const executor = createExtensionOperationExecutor(tabs({ sendMessage }));
    await expect(
      executor.execute({
        type: 'composer.submit',
        effectId: 'effect-submit',
        expectedTextHash: 'b'.repeat(64),
        destination: { mode: 'existing', conversationId: 'target' },
      }),
    ).resolves.toEqual({
      type: 'composer.submit.result',
      submitted: true,
      textHash: 'b'.repeat(64),
    });
    expect(sendMessage).toHaveBeenCalledWith(20, {
      type: 'submit-composer',
      effectId: 'effect-submit',
      expectedTextHash: 'b'.repeat(64),
      destination: { mode: 'existing', conversationId: 'target' },
    });
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
