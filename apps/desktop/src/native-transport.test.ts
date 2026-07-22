import { NativeMessageDecoder, encodeNativeMessage } from '@codex-context-bridge/local-transport';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createNativeDesktopBridgeService,
  ensureNativeCapability,
  startNativeHostServer,
} from './native-transport';

const temporaryDirectories: string[] = [];

function temporaryPaths(): { capabilityPath: string; pipePath: string } {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'context-bridge-native-'));
  temporaryDirectories.push(directory);
  return {
    capabilityPath: path.join(directory, 'capability'),
    pipePath:
      process.platform === 'win32'
        ? `\\\\.\\pipe\\context-bridge-test-${randomUUID()}`
        : path.join(directory, 'relay.sock'),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('native host runtime', () => {
  it('persists one valid per-user capability without overwriting it', () => {
    const paths = temporaryPaths();
    const first = ensureNativeCapability(paths.capabilityPath);
    const second = ensureNativeCapability(paths.capabilityPath);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it('relays a real framed socket request to the extension and back', async () => {
    const paths = temporaryPaths();
    ensureNativeCapability(paths.capabilityPath);
    const extensionInput = new PassThrough();
    const extensionOutput = new PassThrough();
    const host = await startNativeHostServer({
      ...paths,
      extensionInput,
      extensionOutput,
      timeoutMs: 1_000,
      now: () => Date.parse('2026-07-18T09:00:00.000Z'),
    });
    const decoder = new NativeMessageDecoder();
    extensionOutput.on('data', (chunk: Buffer) => {
      for (const request of decoder.push(chunk)) {
        expect(JSON.stringify(request)).not.toContain('capability');
        extensionInput.write(
          encodeNativeMessage({
            protocolVersion: '1.0',
            requestId: (request as { requestId: string }).requestId,
            ok: true,
            result: { type: 'bridge.health.result', status: 'ready' },
          }),
        );
      }
    });
    const ids = ['request-0000000001', 'nonce-000000000001'];
    const desktop = createNativeDesktopBridgeService({
      ...paths,
      permissionActive: false,
      now: () => Date.parse('2026-07-18T09:00:00.000Z'),
      randomId: () => ids.shift() ?? 'unexpected-identifier',
      timeoutMs: 1_000,
    });

    await expect(
      desktop.execute({ type: 'bridge.health', contentVersion: '1.0' }),
    ).resolves.toEqual({
      type: 'bridge.health.result',
      status: 'ready',
    });
    await host.close();
  });

  it('reports disconnected status without a host and keeps permission state honest', async () => {
    const paths = temporaryPaths();
    ensureNativeCapability(paths.capabilityPath);
    const desktop = createNativeDesktopBridgeService({
      ...paths,
      permissionActive: false,
      timeoutMs: 50,
    });
    await expect(desktop.getStatus()).resolves.toMatchObject({
      state: 'disconnected',
      permissionActive: false,
      lastErrorCode: 'TRANSPORT_DISCONNECTED',
    });
  });

  it('falls back to the legacy health shape while keeping the stale extension visible', async () => {
    const paths = temporaryPaths();
    ensureNativeCapability(paths.capabilityPath);
    const extensionInput = new PassThrough();
    const extensionOutput = new PassThrough();
    const host = await startNativeHostServer({
      ...paths,
      extensionInput,
      extensionOutput,
      timeoutMs: 200,
    });
    const decoder = new NativeMessageDecoder();
    extensionOutput.on('data', (chunk: Buffer) => {
      for (const input of decoder.push(chunk)) {
        const request = input as {
          requestId: string;
          operation: { type: string; contentVersion?: string };
        };
        if (request.operation.contentVersion) continue;
        extensionInput.write(
          encodeNativeMessage({
            protocolVersion: '1.0',
            requestId: request.requestId,
            ok: true,
            result: { type: 'bridge.health.result', status: 'ready' },
          }),
        );
      }
    });
    const desktop = createNativeDesktopBridgeService({
      ...paths,
      permissionActive: true,
      timeoutMs: 200,
    });

    await expect(desktop.getStatus()).resolves.toEqual({
      transport: 'native_messaging',
      state: 'connected',
      permissionActive: true,
      lastErrorCode: 'EXTENSION_LEGACY_COMPATIBILITY',
    });
    await host.close();
  });
});
