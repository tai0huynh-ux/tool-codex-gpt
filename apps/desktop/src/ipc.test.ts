import { describe, expect, it, vi } from 'vitest';
import {
  desktopIpcChannels,
  registerDesktopIpc,
  type DesktopBridgeService,
  type IpcInvokeEventLike,
  type IpcMainLike,
} from './ipc';

class FakeIpcMain implements IpcMainLike {
  public readonly handlers = new Map<
    string,
    (event: IpcInvokeEventLike, input?: unknown) => Promise<unknown>
  >();

  public handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, input?: unknown) => Promise<unknown>,
  ): void {
    this.handlers.set(channel, listener);
  }
}

function service(overrides: Partial<DesktopBridgeService> = {}): DesktopBridgeService {
  return {
    getStatus: () =>
      Promise.resolve({
        transport: 'native_messaging',
        state: 'disconnected',
        permissionActive: false,
      }),
    execute: () => Promise.resolve({ type: 'bridge.health.result', status: 'ready' }),
    ...overrides,
  };
}

describe('desktop typed IPC', () => {
  it('registers allowlisted typed methods and validates the sender', async () => {
    const ipc = new FakeIpcMain();
    registerDesktopIpc(ipc, service(), { validateSender: (event) => event.sender.id === 7 });
    expect([...ipc.handlers.keys()]).toEqual([
      desktopIpcChannels.getTransportStatus,
      desktopIpcChannels.executeTransportOperation,
    ]);
    await expect(
      ipc.handlers.get(desktopIpcChannels.getTransportStatus)?.({ sender: { id: 8 } }),
    ).resolves.toMatchObject({ error: { code: 'IPC_SENDER_REJECTED' } });
    await expect(
      ipc.handlers.get(desktopIpcChannels.getTransportStatus)?.({ sender: { id: 7 } }),
    ).resolves.toMatchObject({ ok: true, value: { permissionActive: false } });
  });

  it('validates operation input and audits transfers without payload content', async () => {
    const ipc = new FakeIpcMain();
    const audit = vi.fn();
    registerDesktopIpc(ipc, service(), { validateSender: () => true, audit });
    const handler = ipc.handlers.get(desktopIpcChannels.executeTransportOperation);
    await expect(handler?.({ sender: { id: 7 } }, { type: 'unknown' })).resolves.toMatchObject({
      error: { code: 'IPC_SCHEMA_INVALID' },
    });
    await expect(
      handler?.({ sender: { id: 7 } }, { type: 'bridge.health', contentVersion: '1.0' }),
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(audit).toHaveBeenLastCalledWith({
      type: 'ipc.transfer',
      operation: 'bridge.health',
      outcome: 'accepted',
    });
    expect(JSON.stringify(audit.mock.calls)).not.toContain('capability');
  });

  it('maps bounded timeout and disconnected failures to explicit codes', async () => {
    vi.useFakeTimers();
    const ipc = new FakeIpcMain();
    registerDesktopIpc(ipc, service({ getStatus: () => new Promise(() => undefined) }), {
      validateSender: () => true,
      timeoutMs: 10,
    });
    const result = ipc.handlers.get(desktopIpcChannels.getTransportStatus)?.({ sender: { id: 7 } });
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toMatchObject({ error: { code: 'IPC_TIMEOUT' } });
    vi.useRealTimers();

    const disconnectedIpc = new FakeIpcMain();
    registerDesktopIpc(
      disconnectedIpc,
      service({ execute: async () => Promise.reject(new Error('TRANSPORT_DISCONNECTED')) }),
      { validateSender: () => true },
    );
    await expect(
      disconnectedIpc.handlers.get(desktopIpcChannels.executeTransportOperation)?.(
        { sender: { id: 7 } },
        { type: 'bridge.health', contentVersion: '1.0' },
      ),
    ).resolves.toMatchObject({ error: { code: 'TRANSPORT_DISCONNECTED' } });
  });
});
