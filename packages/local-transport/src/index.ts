import {
  localTransportRequestSchema,
  localTransportResponseSchema,
  type LocalTransportRequest,
  type LocalTransportResponse,
  type LocalTransportResult,
} from '@codex-context-bridge/contracts';
import { createHash, timingSafeEqual } from 'node:crypto';

export const DEFAULT_MAX_NATIVE_MESSAGE_BYTES = 256 * 1024;

export type TransportAuditEvent =
  | { type: 'transport.accepted'; requestId: string; operation: string }
  | { type: 'transport.rejected'; requestId?: string; code: string };

export interface AuthenticatedHostOptions {
  capability: string;
  handler: (request: AuthenticatedTransportRequest) => Promise<LocalTransportResult>;
  audit?: (event: TransportAuditEvent) => void;
  now?: () => number;
  maxPayloadBytes?: number;
  rateLimit?: { maxRequests: number; windowMs: number };
}

export type AuthenticatedTransportRequest = Omit<LocalTransportRequest, 'capability'>;

function hashCapability(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function safeCapabilityMatch(expected: Buffer, actual: string): boolean {
  const actualHash = hashCapability(actual);
  return expected.length === actualHash.length && timingSafeEqual(expected, actualHash);
}

function errorResponse(
  requestId: string,
  code: Extract<LocalTransportResponse, { ok: false }>['error']['code'],
  message: string,
): LocalTransportResponse {
  return { protocolVersion: '1.0', requestId, ok: false, error: { code, message } };
}

export function createAuthenticatedNativeHost(options: AuthenticatedHostOptions): {
  handle(input: unknown): Promise<LocalTransportResponse>;
} {
  const expectedCapability = hashCapability(options.capability);
  const acceptedRequestIds = new Map<string, number>();
  const acceptedNonces = new Map<string, number>();
  const acceptedTimes: number[] = [];
  const now = options.now ?? Date.now;
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_NATIVE_MESSAGE_BYTES;
  const rateLimit = options.rateLimit ?? { maxRequests: 30, windowMs: 10_000 };

  return {
    async handle(input: unknown): Promise<LocalTransportResponse> {
      const serializedBytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
      if (serializedBytes > maxPayloadBytes) {
        options.audit?.({ type: 'transport.rejected', code: 'PAYLOAD_TOO_LARGE' });
        return errorResponse('unknown', 'PAYLOAD_TOO_LARGE', 'Transport payload is too large.');
      }

      const parsed = localTransportRequestSchema.safeParse(input);
      if (!parsed.success) {
        options.audit?.({ type: 'transport.rejected', code: 'SCHEMA_INVALID' });
        return errorResponse('unknown', 'SCHEMA_INVALID', 'Transport request is invalid.');
      }
      const request = parsed.data;
      if (!safeCapabilityMatch(expectedCapability, request.capability)) {
        options.audit?.({
          type: 'transport.rejected',
          requestId: request.requestId,
          code: 'AUTHENTICATION_FAILED',
        });
        return errorResponse(
          request.requestId,
          'AUTHENTICATION_FAILED',
          'Transport authentication failed.',
        );
      }

      const currentTime = now();
      for (const [requestId, expiresAt] of acceptedRequestIds) {
        if (expiresAt < currentTime) acceptedRequestIds.delete(requestId);
      }
      for (const [nonce, expiresAt] of acceptedNonces) {
        if (expiresAt < currentTime) acceptedNonces.delete(nonce);
      }
      if (
        Date.parse(request.sentAt) > currentTime + 5_000 ||
        Date.parse(request.expiresAt) < currentTime
      ) {
        options.audit?.({
          type: 'transport.rejected',
          requestId: request.requestId,
          code: 'REQUEST_EXPIRED',
        });
        return errorResponse(request.requestId, 'REQUEST_EXPIRED', 'Transport request expired.');
      }
      if (acceptedRequestIds.has(request.requestId) || acceptedNonces.has(request.nonce)) {
        options.audit?.({
          type: 'transport.rejected',
          requestId: request.requestId,
          code: 'REQUEST_REPLAYED',
        });
        return errorResponse(
          request.requestId,
          'REQUEST_REPLAYED',
          'Transport request was replayed.',
        );
      }

      while (
        acceptedTimes[0] !== undefined &&
        acceptedTimes[0] <= currentTime - rateLimit.windowMs
      ) {
        acceptedTimes.shift();
      }
      if (acceptedTimes.length >= rateLimit.maxRequests) {
        options.audit?.({
          type: 'transport.rejected',
          requestId: request.requestId,
          code: 'RATE_LIMITED',
        });
        return errorResponse(request.requestId, 'RATE_LIMITED', 'Transport rate limit exceeded.');
      }

      const requestExpiry = Date.parse(request.expiresAt);
      acceptedRequestIds.set(request.requestId, requestExpiry);
      acceptedNonces.set(request.nonce, requestExpiry);
      acceptedTimes.push(currentTime);
      const authenticatedRequest: AuthenticatedTransportRequest = {
        protocolVersion: request.protocolVersion,
        requestId: request.requestId,
        nonce: request.nonce,
        sentAt: request.sentAt,
        expiresAt: request.expiresAt,
        operation: request.operation,
      };
      options.audit?.({
        type: 'transport.accepted',
        requestId: request.requestId,
        operation: request.operation.type,
      });

      try {
        const result = await options.handler(authenticatedRequest);
        return localTransportResponseSchema.parse({
          protocolVersion: '1.0',
          requestId: request.requestId,
          ok: true,
          result,
        });
      } catch {
        return errorResponse(request.requestId, 'INTERNAL_ERROR', 'Transport handler failed.');
      }
    },
  };
}

export function encodeNativeMessage(
  input: unknown,
  maxBytes = DEFAULT_MAX_NATIVE_MESSAGE_BYTES,
): Buffer {
  const payload = Buffer.from(JSON.stringify(input), 'utf8');
  if (payload.length > maxBytes) throw new Error('NATIVE_MESSAGE_TOO_LARGE');
  const frame = Buffer.allocUnsafe(payload.length + 4);
  frame.writeUInt32LE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

export class NativeMessageDecoder {
  private buffered = Buffer.alloc(0);

  public constructor(private readonly maxBytes = DEFAULT_MAX_NATIVE_MESSAGE_BYTES) {}

  public push(chunk: Uint8Array): unknown[] {
    this.buffered = Buffer.concat([this.buffered, Buffer.from(chunk)]);
    const messages: unknown[] = [];
    while (this.buffered.length >= 4) {
      const payloadLength = this.buffered.readUInt32LE(0);
      if (payloadLength > this.maxBytes) throw new Error('NATIVE_MESSAGE_TOO_LARGE');
      if (this.buffered.length < payloadLength + 4) break;
      const payload = this.buffered.subarray(4, payloadLength + 4);
      this.buffered = this.buffered.subarray(payloadLength + 4);
      try {
        messages.push(JSON.parse(payload.toString('utf8')) as unknown);
      } catch {
        throw new Error('NATIVE_MESSAGE_INVALID_JSON');
      }
    }
    return messages;
  }
}

export function reconnectDelay(
  attempt: number,
  options: { baseMs?: number; maxMs?: number; jitter?: number; random?: () => number } = {},
): number {
  const baseMs = options.baseMs ?? 250;
  const maxMs = options.maxMs ?? 5_000;
  const jitter = options.jitter ?? 0.2;
  const random = options.random ?? Math.random;
  const bounded = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
  const factor = 1 - jitter + random() * jitter * 2;
  return Math.round(bounded * factor);
}
