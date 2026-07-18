import { describe, expect, it, vi } from 'vitest';
import { NativeMessagingClient, type NativePortLike } from './native-client';

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

describe('native messaging client', () => {
  it('correlates validated responses without exposing a raw port', async () => {
    const port = new FakePort();
    const ids = ['request-0000000001', 'nonce-000000000001'];
    const client = new NativeMessagingClient({
      hostName: 'com.codex_context_bridge.host',
      capability: 'a'.repeat(48),
      connectNative: () => port,
      now: () => Date.parse('2026-07-18T09:00:00.000Z'),
      randomId: () => ids.shift() ?? 'unexpected-id',
    });

    const result = client.request({ type: 'bridge.health' });
    expect(port.messages).toHaveLength(1);
    port.onMessage.listener?.({
      protocolVersion: '1.0',
      requestId: 'request-0000000001',
      ok: true,
      result: { type: 'bridge.health.result', status: 'ready' },
    });
    await expect(result).resolves.toEqual({ type: 'bridge.health.result', status: 'ready' });
  });

  it('rejects pending work on disconnect and reconnects on the next request', async () => {
    const ports = [new FakePort(), new FakePort()];
    let connectionCount = 0;
    let id = 0;
    const client = new NativeMessagingClient({
      hostName: 'com.codex_context_bridge.host',
      capability: 'a'.repeat(48),
      connectNative: () => ports[connectionCount++] ?? new FakePort(),
      randomId: () => `identifier-000000${String(++id).padStart(4, '0')}`,
    });

    const first = client.request({ type: 'bridge.health' });
    ports[0]?.onDisconnect.listener?.();
    await expect(first).rejects.toThrow('TRANSPORT_DISCONNECTED');

    const second = client.request({ type: 'bridge.health' });
    expect(connectionCount).toBe(2);
    const sent = ports[1]?.messages[0] as { requestId?: string } | undefined;
    ports[1]?.onMessage.listener?.({
      protocolVersion: '1.0',
      requestId: sent?.requestId,
      ok: true,
      result: { type: 'bridge.health.result', status: 'ready' },
    });
    await expect(second).resolves.toMatchObject({ status: 'ready' });
  });

  it('times out bounded requests', async () => {
    vi.useFakeTimers();
    const client = new NativeMessagingClient({
      hostName: 'com.codex_context_bridge.host',
      capability: 'a'.repeat(48),
      connectNative: () => new FakePort(),
      randomId: () => 'identifier-0000000001',
      timeoutMs: 10,
    });
    const result = client.request({ type: 'bridge.health' });
    const rejection = expect(result).rejects.toThrow('REQUEST_TIMEOUT');
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    vi.useRealTimers();
  });
});
