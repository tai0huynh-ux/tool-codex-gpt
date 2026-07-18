import {
  localTransportOperationSchema,
  localTransportResultSchema,
  type LocalTransportOperation,
  type LocalTransportResult,
} from '@codex-context-bridge/contracts';
import { z } from 'zod';

export const desktopIpcChannels = {
  getTransportStatus: 'bridge:get-transport-status',
  executeTransportOperation: 'bridge:execute-transport-operation',
} as const;

export const transportStatusSchema = z
  .object({
    transport: z.literal('native_messaging'),
    state: z.enum(['disconnected', 'pairing', 'connected', 'degraded']),
    permissionActive: z.boolean(),
    lastErrorCode: z.string().min(1).optional(),
  })
  .strict();

const ipcErrorCodeSchema = z.enum([
  'IPC_SENDER_REJECTED',
  'IPC_SCHEMA_INVALID',
  'IPC_TIMEOUT',
  'TRANSPORT_DISCONNECTED',
  'INTERNAL_ERROR',
]);

export const transportStatusResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: transportStatusSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.object({ code: ipcErrorCodeSchema, message: z.string().min(1) }).strict(),
    })
    .strict(),
]);

export const transportOperationResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: localTransportResultSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.object({ code: ipcErrorCodeSchema, message: z.string().min(1) }).strict(),
    })
    .strict(),
]);

export type TransportStatus = z.infer<typeof transportStatusSchema>;
export type TransportStatusResponse = z.infer<typeof transportStatusResponseSchema>;
export type TransportOperationResponse = z.infer<typeof transportOperationResponseSchema>;

export interface DesktopBridgeService {
  getStatus(): Promise<TransportStatus>;
  execute(operation: LocalTransportOperation): Promise<LocalTransportResult>;
}

export interface IpcInvokeEventLike {
  sender: { id: number };
}

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, input?: unknown) => Promise<unknown>,
  ): void;
}

export interface DesktopIpcOptions {
  validateSender: (event: IpcInvokeEventLike) => boolean;
  timeoutMs?: number;
  audit?: (event: {
    type: 'ipc.transfer';
    operation: string;
    outcome: 'accepted' | 'rejected';
  }) => void;
}

function failure(
  code: z.infer<typeof ipcErrorCodeSchema>,
  message: string,
): { ok: false; error: { code: z.infer<typeof ipcErrorCodeSchema>; message: string } } {
  return { ok: false, error: { code, message } };
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('IPC_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function registerDesktopIpc(
  ipcMain: IpcMainLike,
  service: DesktopBridgeService,
  options: DesktopIpcOptions,
): void {
  const timeoutMs = options.timeoutMs ?? 10_000;

  ipcMain.handle(desktopIpcChannels.getTransportStatus, async (event) => {
    if (!options.validateSender(event)) {
      return failure('IPC_SENDER_REJECTED', 'IPC sender is not trusted.');
    }
    try {
      const value = await withTimeout(service.getStatus(), timeoutMs);
      return transportStatusResponseSchema.parse({ ok: true, value });
    } catch (error) {
      if (error instanceof Error && error.message === 'IPC_TIMEOUT') {
        return failure('IPC_TIMEOUT', 'IPC request timed out.');
      }
      return failure('INTERNAL_ERROR', 'Transport status request failed.');
    }
  });

  ipcMain.handle(desktopIpcChannels.executeTransportOperation, async (event, input) => {
    if (!options.validateSender(event)) {
      options.audit?.({ type: 'ipc.transfer', operation: 'unknown', outcome: 'rejected' });
      return failure('IPC_SENDER_REJECTED', 'IPC sender is not trusted.');
    }
    const operation = localTransportOperationSchema.safeParse(input);
    if (!operation.success) {
      options.audit?.({ type: 'ipc.transfer', operation: 'unknown', outcome: 'rejected' });
      return failure('IPC_SCHEMA_INVALID', 'IPC operation is invalid.');
    }
    options.audit?.({
      type: 'ipc.transfer',
      operation: operation.data.type,
      outcome: 'accepted',
    });
    try {
      const value = await withTimeout(service.execute(operation.data), timeoutMs);
      return transportOperationResponseSchema.parse({ ok: true, value });
    } catch (error) {
      if (error instanceof Error && error.message === 'IPC_TIMEOUT') {
        return failure('IPC_TIMEOUT', 'IPC request timed out.');
      }
      if (error instanceof Error && error.message === 'TRANSPORT_DISCONNECTED') {
        return failure('TRANSPORT_DISCONNECTED', 'Extension transport is disconnected.');
      }
      return failure('INTERNAL_ERROR', 'Transport operation failed.');
    }
  });
}
