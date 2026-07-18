import {
  extensionTransportRequestSchema,
  localTransportResponseSchema,
  localTransportResultSchema,
  type LocalTransportResult,
} from '@codex-context-bridge/contracts';

interface NativePortEvent<T> {
  addListener(listener: T): void;
}

export interface NativePortLike {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: NativePortEvent<(message: unknown) => void>;
  onDisconnect: NativePortEvent<() => void>;
}

export interface ExtensionOperationExecutor {
  execute(operation: unknown): Promise<LocalTransportResult>;
}

export interface NativeExtensionBridgeOptions {
  hostName: string;
  connectNative: (hostName: string) => NativePortLike;
  executor: ExtensionOperationExecutor;
  now?: () => number;
  maxMessageBytes?: number;
  reconnectMs?: number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

type BridgeFailureCode =
  | 'SCHEMA_INVALID'
  | 'PAYLOAD_TOO_LARGE'
  | 'REQUEST_EXPIRED'
  | 'REQUEST_REPLAYED'
  | 'INTERNAL_ERROR';

function failure(requestId: string, code: BridgeFailureCode, message: string) {
  return localTransportResponseSchema.parse({
    protocolVersion: '1.0',
    requestId,
    ok: false,
    error: { code, message },
  });
}

export class NativeExtensionBridge {
  private port: NativePortLike | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private readonly acceptedRequestIds = new Map<string, number>();
  private readonly acceptedNonces = new Map<string, number>();

  public constructor(private readonly options: NativeExtensionBridgeOptions) {}

  public start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  public stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      (this.options.clearTimer ?? clearTimeout)(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.port?.disconnect();
    this.port = undefined;
  }

  private connect(): void {
    if (this.stopped || this.port) return;
    const port = this.options.connectNative(this.options.hostName);
    port.onMessage.addListener((message) => void this.handleMessage(port, message));
    port.onDisconnect.addListener(() => this.handleDisconnect(port));
    this.port = port;
  }

  private async handleMessage(port: NativePortLike, message: unknown): Promise<void> {
    if (port !== this.port) return;
    if (
      new TextEncoder().encode(JSON.stringify(message)).byteLength >
      (this.options.maxMessageBytes ?? 256 * 1024)
    ) {
      port.postMessage(failure('unknown', 'PAYLOAD_TOO_LARGE', 'Extension request is too large.'));
      return;
    }
    const parsed = extensionTransportRequestSchema.safeParse(message);
    if (!parsed.success) {
      port.postMessage(failure('unknown', 'SCHEMA_INVALID', 'Extension request is invalid.'));
      return;
    }

    const currentTime = (this.options.now ?? Date.now)();
    for (const [requestId, expiresAt] of this.acceptedRequestIds) {
      if (expiresAt < currentTime) this.acceptedRequestIds.delete(requestId);
    }
    for (const [nonce, expiresAt] of this.acceptedNonces) {
      if (expiresAt < currentTime) this.acceptedNonces.delete(nonce);
    }
    if (
      Date.parse(parsed.data.sentAt) > currentTime + 5_000 ||
      Date.parse(parsed.data.expiresAt) < currentTime
    ) {
      port.postMessage(
        failure(parsed.data.requestId, 'REQUEST_EXPIRED', 'Extension request expired.'),
      );
      return;
    }
    if (
      this.acceptedRequestIds.has(parsed.data.requestId) ||
      this.acceptedNonces.has(parsed.data.nonce)
    ) {
      port.postMessage(
        failure(parsed.data.requestId, 'REQUEST_REPLAYED', 'Extension request was replayed.'),
      );
      return;
    }
    const expiresAt = Date.parse(parsed.data.expiresAt);
    this.acceptedRequestIds.set(parsed.data.requestId, expiresAt);
    this.acceptedNonces.set(parsed.data.nonce, expiresAt);

    try {
      const result = localTransportResultSchema.parse(
        await this.options.executor.execute(parsed.data.operation),
      );
      port.postMessage(
        localTransportResponseSchema.parse({
          protocolVersion: '1.0',
          requestId: parsed.data.requestId,
          ok: true,
          result,
        }),
      );
    } catch {
      port.postMessage(
        failure(parsed.data.requestId, 'INTERNAL_ERROR', 'Extension operation failed.'),
      );
    }
  }

  private handleDisconnect(port: NativePortLike): void {
    if (port !== this.port) return;
    this.port = undefined;
    if (this.stopped || this.reconnectTimer) return;
    const setTimer = this.options.setTimer ?? setTimeout;
    this.reconnectTimer = setTimer(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, this.options.reconnectMs ?? 1_000);
  }
}
