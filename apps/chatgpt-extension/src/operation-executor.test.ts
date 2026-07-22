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
  it('discovers conversations from the active rendered ChatGPT sidebar', async () => {
    const sendMessage = vi.fn(() =>
      Promise.resolve({
        conversations: [
          {
            conversationId: 'target',
            conversationPath: '/g/project-1/c/target',
            title: 'Target chat',
            projectId: 'project-1',
            projectName: 'Project One',
            current: false,
          },
        ],
        capturedAt: '2026-07-20T08:00:00.000Z',
        truncated: false,
      }),
    );
    const executor = createExtensionOperationExecutor(tabs({ sendMessage }));
    await expect(executor.execute({ type: 'conversation.discover' })).resolves.toMatchObject({
      type: 'conversation.discover.result',
      catalog: { conversations: [{ conversationId: 'target' }] },
    });
    expect(sendMessage).toHaveBeenCalledWith(30, { type: 'discover-conversations' });
  });

  it('merges rendered conversations across every open ChatGPT tab', async () => {
    const sendMessage = vi.fn((tabId: number) =>
      Promise.resolve({
        conversations:
          tabId === 30
            ? []
            : [
                {
                  conversationId: tabId === 20 ? 'target' : 'other',
                  conversationPath: tabId === 20 ? '/g/project-1/c/target' : '/c/other',
                  title: tabId === 20 ? 'Target chat' : 'Other chat',
                  ...(tabId === 20 ? { projectId: 'project-1', projectName: 'Project One' } : {}),
                  current: false,
                },
              ],
        capturedAt: '2026-07-21T08:00:00.000Z',
        truncated: false,
      }),
    );
    const executor = createExtensionOperationExecutor(tabs({ sendMessage }));

    const result = await executor.execute({ type: 'conversation.discover' });
    expect(result).toMatchObject({ type: 'conversation.discover.result' });
    expect(
      result.type === 'conversation.discover.result' ? result.catalog.conversations : [],
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conversationId: 'target', title: 'Target chat' }),
        expect.objectContaining({ conversationId: 'other', title: 'Other chat' }),
      ]),
    );
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it('filters legacy navigation links and repairs conversation identity from its path', async () => {
    const sendMessage = vi.fn(() =>
      Promise.resolve({
        conversations: [
          {
            conversationId: 'wrong-id',
            conversationPath: '/library',
            title: 'Library',
            current: false,
          },
          {
            conversationId: 'also-wrong',
            conversationPath: '/c/real-conversation?from=sidebar#message',
            title: 'Real conversation',
            current: true,
          },
        ],
        capturedAt: '2026-07-21T08:00:00.000Z',
        truncated: false,
      }),
    );
    const executor = createExtensionOperationExecutor(tabs({ sendMessage }));

    const result = await executor.execute({ type: 'conversation.discover' });
    expect(result).toMatchObject({ type: 'conversation.discover.result' });
    if (result.type === 'conversation.discover.result') {
      expect(result.catalog.conversations).toEqual([
        {
          conversationId: 'real-conversation',
          conversationPath: '/c/real-conversation',
          title: 'Real conversation',
          current: true,
        },
      ]);
    }
  });

  it('fails closed when a legacy catalog has a malformed top-level shape', async () => {
    const sendMessage = vi.fn(() => Promise.resolve({ conversations: [] }));
    const executor = createExtensionOperationExecutor(tabs({ sendMessage }));

    await expect(executor.execute({ type: 'conversation.discover' })).rejects.toThrow(
      'CHATGPT_DISCOVERY_FAILED',
    );
  });

  it('does not let an unresponsive ChatGPT tab block discovery', async () => {
    vi.useFakeTimers();
    try {
      const sendMessage = vi.fn((tabId: number) => {
        if (tabId === 30) return new Promise<never>(() => undefined);
        return Promise.resolve({
          conversations: [
            {
              conversationId: `tab-${String(tabId)}`,
              conversationPath: `/c/tab-${String(tabId)}`,
              title: `Tab ${String(tabId)}`,
              current: false,
            },
          ],
          capturedAt: '2026-07-21T08:00:00.000Z',
          truncated: false,
        });
      });
      const executor = createExtensionOperationExecutor(tabs({ sendMessage }));
      const pending = executor.execute({ type: 'conversation.discover' });
      await vi.advanceTimersByTimeAsync(2_000);
      const result = await pending;
      expect(result.type).toBe('conversation.discover.result');
      if (result.type === 'conversation.discover.result') {
        expect(result.catalog.conversations).toHaveLength(2);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports degraded health without a rendered ChatGPT tab', async () => {
    const executor = createExtensionOperationExecutor(tabs({ query: () => Promise.resolve([]) }));
    await expect(
      executor.execute({ type: 'bridge.health', contentVersion: '1.0' }),
    ).resolves.toEqual({
      type: 'bridge.health.result',
      status: 'degraded',
      contentVersion: '1.0',
    });
  });

  it('reports ready health only when a rendered tab answers the content-version ping', async () => {
    const sendMessage = vi.fn(() => Promise.resolve({ ready: true, contentVersion: '1.0' }));
    const executor = createExtensionOperationExecutor(tabs({ sendMessage }));

    await expect(
      executor.execute({ type: 'bridge.health', contentVersion: '1.0' }),
    ).resolves.toEqual({
      type: 'bridge.health.result',
      status: 'ready',
      contentVersion: '1.0',
    });
    expect(sendMessage).toHaveBeenCalledWith(30, {
      type: 'bridge-ping',
      contentVersion: '1.0',
    });
  });

  it('degrades health when tabs exist but their content scripts are stale or unreachable', async () => {
    const executor = createExtensionOperationExecutor(
      tabs({ sendMessage: () => Promise.reject(new Error('REQUEST_TIMEOUT')) }),
    );
    await expect(
      executor.execute({ type: 'bridge.health', contentVersion: '1.0' }),
    ).resolves.toEqual({
      type: 'bridge.health.result',
      status: 'degraded',
      contentVersion: '1.0',
    });
  });

  it('accepts the legacy health request while reporting the current content version', async () => {
    const sendMessage = vi.fn(() => Promise.resolve({ ready: true, contentVersion: '1.0' }));
    const executor = createExtensionOperationExecutor(tabs({ sendMessage }));

    await expect(executor.execute({ type: 'bridge.health' })).resolves.toEqual({
      type: 'bridge.health.result',
      status: 'ready',
      contentVersion: '1.0',
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

  it('inspects only the requested conversation instead of the active unrelated tab', async () => {
    const sendMessage = vi.fn(() =>
      Promise.resolve({
        page: {
          mode: 'existing',
          conversationId: 'target',
          conversationPath: '/g/project-1/c/target',
        },
        composer: { available: true, readOnly: false },
      }),
    );
    const executor = createExtensionOperationExecutor(tabs({ sendMessage }));

    await expect(
      executor.execute({
        type: 'page.inspect',
        destination: {
          mode: 'existing',
          conversationId: 'target',
          conversationPath: '/g/project-1/c/target',
        },
      }),
    ).resolves.toMatchObject({ type: 'page.inspect.result' });
    expect(sendMessage).toHaveBeenCalledWith(20, { type: 'inspect-page' });
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
