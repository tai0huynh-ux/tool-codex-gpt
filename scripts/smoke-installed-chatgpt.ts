import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  ChatGptDestination,
  LocalTransportOperation,
  LocalTransportResult,
} from '@codex-context-bridge/contracts';
import {
  createNativeDesktopBridgeService,
  nativeTransportPaths,
} from '../apps/desktop/src/native-transport';

interface SmokeBridge {
  execute(operation: LocalTransportOperation): Promise<LocalTransportResult>;
}

export interface InstalledChatGptSmokeResult {
  status: 'passed';
  health: 'ready';
  pageMode: 'existing' | 'new';
  capturedMessages: number;
  snapshotHash: string;
  composerInserted: true;
  composerSent: false;
  composerCleared: true;
}

function smokeText(effectId: string): string {
  return `CODEX_CONTEXT_BRIDGE_LIVE_SMOKE_${effectId}`;
}

function textHash(text: string): string {
  return createHash('sha256').update(text.trim(), 'utf8').digest('hex');
}

export async function runInstalledChatGptSmoke(
  bridge: SmokeBridge,
  createId: () => string = randomUUID,
): Promise<InstalledChatGptSmokeResult> {
  const execute = async (operation: LocalTransportOperation): Promise<LocalTransportResult> => {
    try {
      return await bridge.execute(operation);
    } catch (error) {
      throw new Error(`LIVE_CHATGPT_${operation.type.toUpperCase().replaceAll('.', '_')}_FAILED`, {
        cause: error,
      });
    }
  };

  const health = await execute({ type: 'bridge.health' });
  if (health.type !== 'bridge.health.result' || health.status !== 'ready') {
    throw new Error('LIVE_CHATGPT_BRIDGE_NOT_READY');
  }

  const inspected = await execute({ type: 'page.inspect' });
  if (inspected.type !== 'page.inspect.result') throw new Error('LIVE_CHATGPT_INSPECT_INVALID');
  const { page, composer } = inspected.inspection;
  if (page.mode === 'unsupported' || !composer.available || composer.readOnly) {
    throw new Error('LIVE_CHATGPT_COMPOSER_UNAVAILABLE');
  }
  if (composer.textHash) throw new Error('LIVE_CHATGPT_COMPOSER_NOT_EMPTY');

  const captured = await execute({ type: 'conversation.capture' });
  if (captured.type !== 'conversation.capture.result') {
    throw new Error('LIVE_CHATGPT_CAPTURE_INVALID');
  }

  const destination: ChatGptDestination =
    page.mode === 'existing'
      ? { mode: 'existing', conversationId: page.conversationId }
      : { mode: 'new' };
  const effectId = createId();
  const text = smokeText(effectId);
  const payloadHash = textHash(text);
  let inserted = false;
  let cleared = false;
  try {
    const insertion = await execute({
      type: 'composer.insert',
      text,
      effectId,
      payloadHash,
      destination,
    });
    if (
      insertion.type !== 'composer.insert.result' ||
      !insertion.inserted ||
      insertion.textHash !== payloadHash
    ) {
      throw new Error('LIVE_CHATGPT_INSERT_INVALID');
    }
    inserted = true;

    const clearing = await execute({
      type: 'composer.clear',
      effectId,
      expectedTextHash: payloadHash,
    });
    if (clearing.type !== 'composer.clear.result' || !clearing.cleared) {
      throw new Error('LIVE_CHATGPT_CLEAR_INVALID');
    }
    cleared = true;
  } finally {
    if (inserted && !cleared) {
      await bridge
        .execute({ type: 'composer.clear', effectId, expectedTextHash: payloadHash })
        .catch(() => undefined);
    }
  }

  return {
    status: 'passed',
    health: 'ready',
    pageMode: page.mode,
    capturedMessages: captured.snapshot.messages.length,
    snapshotHash: captured.snapshot.contentHash,
    composerInserted: true,
    composerSent: false,
    composerCleared: true,
  };
}

async function main(): Promise<void> {
  const applicationDataRoot = process.env.APPDATA;
  if (!applicationDataRoot) throw new Error('NATIVE_APP_DATA_UNAVAILABLE');
  const bridge = createNativeDesktopBridgeService({
    ...nativeTransportPaths(applicationDataRoot),
    permissionActive: true,
    timeoutMs: 15_000,
  });
  const result = await runInstalledChatGptSmoke(bridge);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (entry === import.meta.url) await main();
