import {
  localTransportResponseSchema,
  type LocalTransportOperation,
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

export interface NativeMessagingClientOptions {
  hostName: string;
  capability: string;
  connectNative: (hostName: string) => NativePortLike;
  now?: () => number;
  randomId?: () => string;
  timeoutMs?: number;
}

interface PendingRequest {
  resolve: (result: LocalTransportResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class NativeMessagingClient {
  private port: NativePortLike | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly now: () => number;
  private readonly randomId: () => string;
  private readonly timeoutMs: number;

  public constructor(private readonly options: NativeMessagingClientOptions) {
    this.now = options.now ?? Date.now;
    this.randomId = options.randomId ?? (() => crypto.randomUUID());
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  public request(operation: LocalTransportOperation): Promise<LocalTransportResult> {
    const requestId = this.randomId();
    const sentAt = this.now();
    const port = this.ensureConnected();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('REQUEST_TIMEOUT'));
      }, this.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      port.postMessage({
        protocolVersion: '1.0',
        requestId,
        nonce: this.randomId(),
        capability: this.options.capability,
        sentAt: new Date(sentAt).toISOString(),
        expiresAt: new Date(sentAt + Math.min(this.timeoutMs, 60_000)).toISOString(),
        operation,
      });
    });
  }

  public disconnect(): void {
    this.port?.disconnect();
    this.handleDisconnect();
  }

  private ensureConnected(): NativePortLike {
    if (this.port) return this.port;
    const port = this.options.connectNative(this.options.hostName);
    port.onMessage.addListener((message) => this.handleMessage(message));
    port.onDisconnect.addListener(() => this.handleDisconnect());
    this.port = port;
    return port;
  }

  private handleMessage(message: unknown): void {
    const parsed = localTransportResponseSchema.safeParse(message);
    if (!parsed.success) return;
    const pending = this.pending.get(parsed.data.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(parsed.data.requestId);
    if (parsed.data.ok) pending.resolve(parsed.data.result);
    else pending.reject(new Error(parsed.data.error.code));
  }

  private handleDisconnect(): void {
    this.port = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('TRANSPORT_DISCONNECTED'));
    }
    this.pending.clear();
  }
}
