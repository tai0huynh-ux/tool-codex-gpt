import {
  localTransportResponseSchema,
  type LocalTransportOperation,
  type LocalTransportResult,
} from '@codex-context-bridge/contracts';
import {
  NativeMessageDecoder,
  createNativeRelay,
  encodeNativeMessage,
} from '@codex-context-bridge/local-transport';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import net, { type Server } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import type { DesktopBridgeService, TransportStatus } from './ipc';

const CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;

export interface NativeTransportPaths {
  capabilityPath: string;
  pipePath: string;
}

export function nativeTransportPaths(applicationDataRoot: string): NativeTransportPaths {
  const dataDirectory = path.join(applicationDataRoot, 'Codex Context Bridge');
  const identity = createHash('sha256')
    .update(dataDirectory.toLowerCase())
    .digest('hex')
    .slice(0, 24);
  return {
    capabilityPath: path.join(dataDirectory, 'native-transport-capability'),
    pipePath:
      process.platform === 'win32'
        ? `\\\\.\\pipe\\codex-context-bridge-${identity}`
        : path.join(os.tmpdir(), `codex-context-bridge-${identity}.sock`),
  };
}

export function ensureNativeCapability(capabilityPath: string): string {
  if (existsSync(capabilityPath)) {
    const existing = readFileSync(capabilityPath, 'utf8').trim();
    if (!CAPABILITY_PATTERN.test(existing)) throw new Error('NATIVE_CAPABILITY_INVALID');
    return existing;
  }

  mkdirSync(path.dirname(capabilityPath), { recursive: true });
  const capability = randomBytes(32).toString('hex');
  try {
    writeFileSync(capabilityPath, capability, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return capability;
  } catch (error) {
    if (!existsSync(capabilityPath)) throw error;
    const existing = readFileSync(capabilityPath, 'utf8').trim();
    if (!CAPABILITY_PATTERN.test(existing)) throw new Error('NATIVE_CAPABILITY_INVALID');
    return existing;
  }
}

function readNativeCapability(capabilityPath: string): string {
  const capability = readFileSync(capabilityPath, 'utf8').trim();
  if (!CAPABILITY_PATTERN.test(capability)) throw new Error('NATIVE_CAPABILITY_INVALID');
  return capability;
}

export interface NativeHostServerOptions extends NativeTransportPaths {
  extensionInput: Readable;
  extensionOutput: Writable;
  timeoutMs?: number;
  now?: () => number;
  debug?: (event: string) => void;
}

export interface NativeHostServer {
  close(): Promise<void>;
}

export async function startNativeHostServer(
  options: NativeHostServerOptions,
): Promise<NativeHostServer> {
  const capability = readNativeCapability(options.capabilityPath);
  if (process.platform !== 'win32' && existsSync(options.pipePath)) unlinkSync(options.pipePath);
  const extensionDecoder = new NativeMessageDecoder();
  const relay = createNativeRelay({
    capability,
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.now ? { now: options.now } : {}),
    sendToExtension: (request) => {
      options.debug?.('relay.forwarded');
      options.extensionOutput.write(encodeNativeMessage(request));
    },
    audit: (event) => options.debug?.(event.type),
  });
  options.extensionInput.on('data', (chunk: Buffer | string) => {
    options.debug?.('extension.data');
    try {
      for (const message of extensionDecoder.push(Buffer.from(chunk))) {
        relay.handleExtensionResponse(message);
      }
    } catch {
      relay.disconnect();
    }
  });
  options.extensionInput.on('end', () => relay.disconnect());

  const server: Server = net.createServer((socket) => {
    options.debug?.('pipe.connected');
    const decoder = new NativeMessageDecoder();
    socket.on('data', (chunk) => {
      options.debug?.('desktop.data');
      try {
        for (const message of decoder.push(chunk)) {
          options.debug?.('desktop.frame');
          void relay.handleDesktopRequest(message).then((response) => {
            if (!socket.destroyed) socket.write(encodeNativeMessage(response));
          });
        }
      } catch {
        socket.destroy();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.pipePath, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        relay.disconnect();
        server.close((error) => {
          if (process.platform !== 'win32' && existsSync(options.pipePath)) {
            unlinkSync(options.pipePath);
          }
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

export interface NativeDesktopBridgeOptions extends NativeTransportPaths {
  permissionActive: boolean;
  timeoutMs?: number;
  now?: () => number;
  randomId?: () => string;
}

export function createNativeDesktopBridgeService(
  options: NativeDesktopBridgeOptions,
): DesktopBridgeService {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const now = options.now ?? Date.now;
  const randomId = options.randomId ?? randomUUID;

  async function execute(operation: LocalTransportOperation): Promise<LocalTransportResult> {
    let capability: string;
    try {
      capability = readNativeCapability(options.capabilityPath);
    } catch {
      throw new Error('TRANSPORT_DISCONNECTED');
    }
    const requestId = randomId();
    const sentAt = now();
    return new Promise<LocalTransportResult>((resolve, reject) => {
      const socket = net.createConnection(options.pipePath);
      const decoder = new NativeMessageDecoder();
      let settled = false;
      const finish = (work: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        work();
      };
      const timer = setTimeout(() => finish(() => reject(new Error('REQUEST_TIMEOUT'))), timeoutMs);
      socket.once('connect', () => {
        socket.write(
          encodeNativeMessage({
            protocolVersion: '1.0',
            requestId,
            nonce: randomId(),
            capability,
            sentAt: new Date(sentAt).toISOString(),
            expiresAt: new Date(sentAt + Math.min(timeoutMs, 60_000)).toISOString(),
            operation,
          }),
        );
      });
      socket.on('data', (chunk) => {
        try {
          for (const input of decoder.push(chunk)) {
            const response = localTransportResponseSchema.safeParse(input);
            if (!response.success || response.data.requestId !== requestId) continue;
            if (response.data.ok) {
              const result = response.data.result;
              finish(() => resolve(result));
            } else {
              const code = response.data.error.code;
              finish(() => reject(new Error(code)));
            }
          }
        } catch {
          finish(() => reject(new Error('TRANSPORT_DISCONNECTED')));
        }
      });
      socket.once('error', () => finish(() => reject(new Error('TRANSPORT_DISCONNECTED'))));
      socket.once('end', () => finish(() => reject(new Error('TRANSPORT_DISCONNECTED'))));
    });
  }

  return {
    async getStatus(): Promise<TransportStatus> {
      try {
        const result = await execute({ type: 'bridge.health' });
        if (result.type !== 'bridge.health.result') throw new Error('TRANSPORT_DISCONNECTED');
        return {
          transport: 'native_messaging',
          state: result.status === 'ready' ? 'connected' : 'degraded',
          permissionActive: options.permissionActive,
        };
      } catch (error) {
        return {
          transport: 'native_messaging',
          state: 'disconnected',
          permissionActive: options.permissionActive,
          lastErrorCode: error instanceof Error ? error.message : 'TRANSPORT_DISCONNECTED',
        };
      }
    },
    execute,
  };
}
