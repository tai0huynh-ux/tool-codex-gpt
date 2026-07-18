import { describe, expect, it } from 'vitest';
import {
  NativeMessageDecoder,
  createAuthenticatedNativeHost,
  encodeNativeMessage,
  reconnectDelay,
  type TransportAuditEvent,
} from './index';

const capability = 'a'.repeat(48);
const now = Date.parse('2026-07-18T09:00:00.000Z');

function request(overrides: Record<string, unknown> = {}): unknown {
  return {
    protocolVersion: '1.0',
    requestId: 'request-0000000001',
    nonce: 'nonce-000000000001',
    capability,
    sentAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 10_000).toISOString(),
    operation: { type: 'bridge.health' },
    ...overrides,
  };
}

describe('authenticated native host', () => {
  it('authenticates, strips the capability, and audits accepted requests', async () => {
    const events: TransportAuditEvent[] = [];
    const host = createAuthenticatedNativeHost({
      capability,
      now: () => now,
      audit: (event) => events.push(event),
      handler: (input) => {
        expect(input).not.toHaveProperty('capability');
        return Promise.resolve({ type: 'bridge.health.result', status: 'ready' });
      },
    });

    await expect(host.handle(request())).resolves.toMatchObject({ ok: true });
    expect(events).toEqual([
      {
        type: 'transport.accepted',
        requestId: 'request-0000000001',
        operation: 'bridge.health',
      },
    ]);
  });

  it('rejects spoofing, expiry, replay, oversized payloads, and rate bursts', async () => {
    const host = createAuthenticatedNativeHost({
      capability,
      now: () => now,
      maxPayloadBytes: 2_000,
      rateLimit: { maxRequests: 1, windowMs: 10_000 },
      handler: () => Promise.resolve({ type: 'bridge.health.result', status: 'ready' }),
    });

    await expect(host.handle(request({ capability: 'b'.repeat(48) }))).resolves.toMatchObject({
      error: { code: 'AUTHENTICATION_FAILED' },
    });
    await expect(
      host.handle(request({ expiresAt: new Date(now - 1).toISOString() })),
    ).resolves.toMatchObject({ error: { code: 'REQUEST_EXPIRED' } });
    await expect(host.handle(request())).resolves.toMatchObject({ ok: true });
    await expect(host.handle(request())).resolves.toMatchObject({
      error: { code: 'REQUEST_REPLAYED' },
    });
    await expect(
      host.handle(request({ requestId: 'request-0000000002', nonce: 'nonce-000000000002' })),
    ).resolves.toMatchObject({ error: { code: 'RATE_LIMITED' } });
    await expect(host.handle({ value: 'x'.repeat(3_000) })).resolves.toMatchObject({
      error: { code: 'PAYLOAD_TOO_LARGE' },
    });
  });

  it('bounds replay memory to the request validity window', async () => {
    let currentTime = now;
    const host = createAuthenticatedNativeHost({
      capability,
      now: () => currentTime,
      handler: () => Promise.resolve({ type: 'bridge.health.result', status: 'ready' }),
    });
    await expect(host.handle(request())).resolves.toMatchObject({ ok: true });
    currentTime += 11_000;
    await expect(
      host.handle(
        request({
          sentAt: new Date(currentTime - 1_000).toISOString(),
          expiresAt: new Date(currentTime + 10_000).toISOString(),
        }),
      ),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe('native message framing', () => {
  it('decodes fragmented and adjacent UTF-8 frames', () => {
    const first = encodeNativeMessage({ text: 'xin chao' });
    const second = encodeNativeMessage({ ok: true });
    const decoder = new NativeMessageDecoder();
    expect(decoder.push(first.subarray(0, 3))).toEqual([]);
    expect(decoder.push(Buffer.concat([first.subarray(3), second]))).toEqual([
      { text: 'xin chao' },
      { ok: true },
    ]);
  });

  it('rejects oversized declarations and malformed JSON', () => {
    const oversized = Buffer.alloc(4);
    oversized.writeUInt32LE(1_000, 0);
    expect(() => new NativeMessageDecoder(10).push(oversized)).toThrow('NATIVE_MESSAGE_TOO_LARGE');
    const invalid = Buffer.concat([Buffer.from([1, 0, 0, 0]), Buffer.from('{')]);
    expect(() => new NativeMessageDecoder().push(invalid)).toThrow('NATIVE_MESSAGE_INVALID_JSON');
  });
});

it('uses bounded exponential reconnect delay with injectable jitter', () => {
  expect(reconnectDelay(0, { random: () => 0.5 })).toBe(250);
  expect(reconnectDelay(10, { random: () => 0.5 })).toBe(5_000);
});
