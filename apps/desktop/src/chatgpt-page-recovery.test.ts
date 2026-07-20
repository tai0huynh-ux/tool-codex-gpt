import { describe, expect, it, vi } from 'vitest';
import type { DesktopBridgeService } from './ipc';
import { ensureChatGptPageReadable } from './chatgpt-page-recovery';

const existingInspection = {
  page: { mode: 'existing' as const, conversationId: 'conversation-1' },
  composer: { available: true, readOnly: false },
};

function bridge(overrides: Partial<DesktopBridgeService> = {}): DesktopBridgeService {
  return {
    getStatus: () =>
      Promise.resolve({
        transport: 'native_messaging',
        state: 'connected',
        permissionActive: true,
      }),
    execute: () => Promise.resolve({ type: 'page.inspect.result', inspection: existingInspection }),
    ...overrides,
  };
}

describe('ChatGPT page startup recovery', () => {
  it('does nothing when the exact destination is already readable', async () => {
    const openExternal = vi.fn(() => Promise.resolve());
    const execute = vi.fn<DesktopBridgeService['execute']>(() =>
      Promise.resolve({ type: 'page.inspect.result', inspection: existingInspection }),
    );

    await expect(
      ensureChatGptPageReadable({
        bridge: bridge({ execute }),
        destination: { mode: 'existing', conversationId: 'conversation-1' },
        openExternal,
      }),
    ).resolves.toMatchObject({ action: 'none' });
    expect(openExternal).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      type: 'page.inspect',
      destination: { mode: 'existing', conversationId: 'conversation-1' },
    });
  });

  it('reloads the exact existing conversation once before retrying inspection', async () => {
    const execute = vi
      .fn<DesktopBridgeService['execute']>()
      .mockRejectedValueOnce(new Error('INTERNAL_ERROR'))
      .mockResolvedValueOnce({ type: 'page.reload.result', reloaded: true })
      .mockResolvedValueOnce({ type: 'page.inspect.result', inspection: existingInspection });
    const openExternal = vi.fn(() => Promise.resolve());

    await expect(
      ensureChatGptPageReadable({
        bridge: bridge({ execute }),
        destination: { mode: 'existing', conversationId: 'conversation-1' },
        openExternal,
        wait: () => Promise.resolve(),
      }),
    ).resolves.toMatchObject({ action: 'reloaded' });
    expect(execute).toHaveBeenNthCalledWith(2, {
      type: 'page.reload',
      destination: { mode: 'existing', conversationId: 'conversation-1' },
    });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('opens only the allowlisted ChatGPT URL when no rendered tab exists', async () => {
    const execute = vi
      .fn<DesktopBridgeService['execute']>()
      .mockRejectedValueOnce(new Error('INTERNAL_ERROR'))
      .mockResolvedValueOnce({ type: 'page.inspect.result', inspection: existingInspection });
    const openExternal = vi.fn(() => Promise.resolve());

    await expect(
      ensureChatGptPageReadable({
        bridge: bridge({
          getStatus: () =>
            Promise.resolve({
              transport: 'native_messaging',
              state: 'degraded',
              permissionActive: true,
            }),
          execute,
        }),
        destination: { mode: 'existing', conversationId: 'conversation-1' },
        openExternal,
        wait: () => Promise.resolve(),
      }),
    ).resolves.toMatchObject({ action: 'opened' });
    expect(openExternal).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith('https://chatgpt.com/c/conversation-1');
  });

  it('opens the exact URL once when a reload does not restore readability', async () => {
    const execute = vi
      .fn<DesktopBridgeService['execute']>()
      .mockRejectedValueOnce(new Error('INTERNAL_ERROR'))
      .mockResolvedValueOnce({ type: 'page.reload.result', reloaded: true })
      .mockRejectedValueOnce(new Error('INTERNAL_ERROR'))
      .mockResolvedValueOnce({ type: 'page.inspect.result', inspection: existingInspection });
    const openExternal = vi.fn(() => Promise.resolve());

    await expect(
      ensureChatGptPageReadable({
        bridge: bridge({ execute }),
        destination: { mode: 'existing', conversationId: 'conversation-1' },
        openExternal,
        wait: () => Promise.resolve(),
        retryDelaysMs: [1, 1],
      }),
    ).resolves.toMatchObject({ action: 'opened' });
    expect(openExternal).toHaveBeenCalledOnce();
  });

  it('reopens the persisted ChatGPT Project conversation path', async () => {
    const execute = vi
      .fn<DesktopBridgeService['execute']>()
      .mockRejectedValueOnce(new Error('CHATGPT_TAB_NOT_FOUND'))
      .mockResolvedValueOnce({ type: 'page.inspect.result', inspection: existingInspection });
    const openExternal = vi.fn(() => Promise.resolve());

    await expect(
      ensureChatGptPageReadable({
        bridge: bridge({
          getStatus: () =>
            Promise.resolve({
              transport: 'native_messaging',
              state: 'degraded',
              permissionActive: true,
            }),
          execute,
        }),
        destination: {
          mode: 'existing',
          conversationId: 'conversation-1',
          conversationPath: '/g/project-1/c/conversation-1',
        },
        openExternal,
        wait: () => Promise.resolve(),
      }),
    ).resolves.toMatchObject({ action: 'opened' });
    expect(openExternal).toHaveBeenCalledWith('https://chatgpt.com/g/project-1/c/conversation-1');
  });

  it('reports an unavailable conversation when ChatGPT redirects the exact tab away', async () => {
    const openExternal = vi.fn(() => Promise.resolve());
    const execute = vi.fn<DesktopBridgeService['execute']>(() =>
      Promise.reject(new Error('CHATGPT_TAB_NOT_FOUND')),
    );

    await expect(
      ensureChatGptPageReadable({
        bridge: bridge({ execute }),
        destination: { mode: 'existing', conversationId: 'conversation-missing' },
        openExternal,
        wait: () => Promise.resolve(),
        retryDelaysMs: [1, 1],
      }),
    ).rejects.toThrow('CHATGPT_CONVERSATION_UNAVAILABLE');
    expect(openExternal).toHaveBeenCalledWith('https://chatgpt.com/c/conversation-missing');
  });

  it('stops after bounded retries instead of reopening forever', async () => {
    const openExternal = vi.fn(() => Promise.resolve());
    const execute = vi.fn<DesktopBridgeService['execute']>(() =>
      Promise.reject(new Error('INTERNAL_ERROR')),
    );

    await expect(
      ensureChatGptPageReadable({
        bridge: bridge({
          getStatus: () =>
            Promise.resolve({
              transport: 'native_messaging',
              state: 'degraded',
              permissionActive: true,
            }),
          execute,
        }),
        destination: { mode: 'new' },
        openExternal,
        wait: () => Promise.resolve(),
        retryDelaysMs: [1, 1],
      }),
    ).rejects.toThrow('CHATGPT_NOT_READY');
    expect(openExternal).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('never opens a new tab for a background check after reload fails', async () => {
    const openExternal = vi.fn(() => Promise.resolve());
    const execute = vi.fn<DesktopBridgeService['execute']>(() =>
      Promise.reject(new Error('CHATGPT_TAB_NOT_FOUND')),
    );

    await expect(
      ensureChatGptPageReadable({
        bridge: bridge({ execute }),
        destination: { mode: 'existing', conversationId: 'conversation-missing' },
        openExternal,
        allowOpenExternal: false,
        wait: () => Promise.resolve(),
        retryDelaysMs: [1, 1],
      }),
    ).rejects.toThrow('CHATGPT_CONVERSATION_UNAVAILABLE');
    expect(openExternal).not.toHaveBeenCalled();
  });
});
