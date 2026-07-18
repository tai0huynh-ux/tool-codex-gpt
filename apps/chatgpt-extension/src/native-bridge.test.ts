import { describe, expect, it, vi } from 'vitest';
import { NativeExtensionBridge, type NativePortLike } from './native-bridge';

class EventHook<T extends (...arguments_: never[]) => void> {
  public listener: T | undefined;

  public addListener(listener: T): void {
    this.listener = listener;
  }
}

class FakePort implements NativePortLike {
  public readonly onMessage = new EventHook<(message: unknown) => void>();
  public readonly onDisconnect = new EventHook<() => void>();
  public readonly messages: unknown[] = [];
  public disconnected = false;

  public postMessage(message: unknown): void {
    this.messages.push(message);
  }

  public disconnect(): void {
    this.disconnected = true;
  }
}

function request(): unknown {
  return {
    protocolVersion: '1.0',
    requestId: 'request-0000000001',
    nonce: 'nonce-000000000001',
    sentAt: '2026-07-18T09:00:00.000Z',
    expiresAt: '2026-07-18T09:00:30.000Z',
    operation: { type: 'bridge.health' },
  };
}

describe('native extension bridge', () => {
  it('executes validated host requests without receiving a capability', async () => {
    const port = new FakePort();
    const execute = vi.fn(() =>
      Promise.resolve({ type: 'bridge.health.result' as const, status: 'ready' as const }),
    );
    const bridge = new NativeExtensionBridge({
      hostName: 'com.codex_context_bridge.host',
      connectNative: () => port,
      executor: { execute },
      now: () => Date.parse('2026-07-18T09:00:10.000Z'),
    });

    bridge.start();
    port.onMessage.listener?.(request());
    await vi.waitFor(() => expect(port.messages).toHaveLength(1));

    expect(execute).toHaveBeenCalledWith({ type: 'bridge.health' });
    expect(JSON.stringify(execute.mock.calls)).not.toContain('capability');
    expect(port.messages[0]).toMatchObject({
      requestId: 'request-0000000001',
      ok: true,
      result: { type: 'bridge.health.result', status: 'ready' },
    });
  });

  it('rejects malformed requests and redacts executor failures', async () => {
    const port = new FakePort();
    const bridge = new NativeExtensionBridge({
      hostName: 'com.codex_context_bridge.host',
      connectNative: () => port,
      executor: { execute: () => Promise.reject(new Error('secret detail')) },
      now: () => Date.parse('2026-07-18T09:00:10.000Z'),
    });
    bridge.start();

    port.onMessage.listener?.({ capability: 'must-not-cross' });
    await vi.waitFor(() => expect(port.messages).toHaveLength(1));
    expect(port.messages[0]).toMatchObject({ error: { code: 'SCHEMA_INVALID' } });
    expect(JSON.stringify(port.messages[0])).not.toContain('must-not-cross');

    port.onMessage.listener?.(request());
    await vi.waitFor(() => expect(port.messages).toHaveLength(2));
    expect(port.messages[1]).toMatchObject({
      requestId: 'request-0000000001',
      error: { code: 'INTERNAL_ERROR', message: 'Extension operation failed.' },
    });
    expect(JSON.stringify(port.messages[1])).not.toContain('secret detail');
  });

  it('rejects expired, replayed, and oversized host requests before DOM execution', async () => {
    const port = new FakePort();
    const execute = vi.fn(() =>
      Promise.resolve({ type: 'bridge.health.result' as const, status: 'ready' as const }),
    );
    const bridge = new NativeExtensionBridge({
      hostName: 'com.codex_context_bridge.host',
      connectNative: () => port,
      executor: { execute },
      now: () => Date.parse('2026-07-18T09:00:10.000Z'),
      maxMessageBytes: 1_000,
    });
    bridge.start();

    port.onMessage.listener?.({
      ...(request() as object),
      requestId: 'expired-0000000001',
      expiresAt: '2026-07-18T09:00:09.000Z',
    });
    await vi.waitFor(() => expect(port.messages).toHaveLength(1));
    expect(port.messages[0]).toMatchObject({ error: { code: 'REQUEST_EXPIRED' } });

    port.onMessage.listener?.(request());
    await vi.waitFor(() => expect(port.messages).toHaveLength(2));
    port.onMessage.listener?.(request());
    await vi.waitFor(() => expect(port.messages).toHaveLength(3));
    expect(port.messages[2]).toMatchObject({ error: { code: 'REQUEST_REPLAYED' } });

    port.onMessage.listener?.({ value: 'x'.repeat(2_000) });
    await vi.waitFor(() => expect(port.messages).toHaveLength(4));
    expect(port.messages[3]).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('reconnects after disconnect and stops reconnecting when requested', () => {
    vi.useFakeTimers();
    const ports = [new FakePort(), new FakePort()];
    let connections = 0;
    const bridge = new NativeExtensionBridge({
      hostName: 'com.codex_context_bridge.host',
      connectNative: () => ports[connections++] ?? new FakePort(),
      executor: {
        execute: () => Promise.resolve({ type: 'bridge.health.result', status: 'ready' }),
      },
      now: () => Date.parse('2026-07-18T09:00:10.000Z'),
      reconnectMs: 10,
    });

    bridge.start();
    ports[0]?.onDisconnect.listener?.();
    vi.advanceTimersByTime(10);
    expect(connections).toBe(2);
    bridge.stop();
    ports[1]?.onDisconnect.listener?.();
    vi.advanceTimersByTime(20);
    expect(connections).toBe(2);
    vi.useRealTimers();
  });
});
