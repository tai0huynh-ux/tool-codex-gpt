import type {
  ChatGptDestination,
  ChatGptPageInspection,
  LocalTransportResult,
} from '@codex-context-bridge/contracts';
import type { DesktopBridgeService } from './ipc';

const CHATGPT_ORIGIN = 'https://chatgpt.com';

export interface ChatGptPageRecoveryResult {
  action: 'none' | 'opened' | 'reloaded';
  inspection: ChatGptPageInspection;
}

export interface ChatGptPageRecoveryOptions {
  bridge: DesktopBridgeService;
  destination: ChatGptDestination;
  openExternal(url: string): Promise<void>;
  audit?: (event: { action: 'inspect' | 'reload' | 'open'; outcome: 'allowed' | 'failed' }) => void;
  wait?: (milliseconds: number) => Promise<void>;
  retryDelaysMs?: readonly number[];
}

function destinationUrl(destination: ChatGptDestination): string {
  if (destination.mode === 'new') return `${CHATGPT_ORIGIN}/`;
  const url = new URL(`${CHATGPT_ORIGIN}/c/${encodeURIComponent(destination.conversationId)}`);
  if (url.origin !== CHATGPT_ORIGIN) throw new Error('CHATGPT_DESTINATION_INVALID');
  return url.href;
}

function matchesDestination(
  destination: ChatGptDestination,
  inspection: ChatGptPageInspection,
): boolean {
  return destination.mode === 'existing'
    ? inspection.page.mode === 'existing' &&
        inspection.page.conversationId === destination.conversationId
    : inspection.page.mode === 'new';
}

function inspectionFrom(result: LocalTransportResult): ChatGptPageInspection {
  if (result.type !== 'page.inspect.result') throw new Error('CHATGPT_NOT_READY');
  return result.inspection;
}

async function inspect(
  options: ChatGptPageRecoveryOptions,
): Promise<ChatGptPageInspection | undefined> {
  try {
    const value = inspectionFrom(await options.bridge.execute({ type: 'page.inspect' }));
    const matches = matchesDestination(options.destination, value);
    options.audit?.({ action: 'inspect', outcome: matches ? 'allowed' : 'failed' });
    return matches ? value : undefined;
  } catch {
    options.audit?.({ action: 'inspect', outcome: 'failed' });
    return undefined;
  }
}

async function openDestination(options: ChatGptPageRecoveryOptions): Promise<void> {
  try {
    await options.openExternal(destinationUrl(options.destination));
    options.audit?.({ action: 'open', outcome: 'allowed' });
  } catch (error) {
    options.audit?.({ action: 'open', outcome: 'failed' });
    throw error;
  }
}

export async function ensureChatGptPageReadable(
  options: ChatGptPageRecoveryOptions,
): Promise<ChatGptPageRecoveryResult> {
  const wait =
    options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const retryDelaysMs = options.retryDelaysMs ?? [500, 1_000, 2_000];
  const initial = await inspect(options);
  if (initial) return { action: 'none', inspection: initial };

  let action: ChatGptPageRecoveryResult['action'] = 'opened';
  const health = await options.bridge.getStatus();
  if (health.state === 'connected') {
    try {
      const reload = await options.bridge.execute({
        type: 'page.reload',
        destination: options.destination,
      });
      if (reload.type !== 'page.reload.result' || !reload.reloaded) {
        throw new Error('CHATGPT_RELOAD_REJECTED');
      }
      action = 'reloaded';
      options.audit?.({ action: 'reload', outcome: 'allowed' });
      const firstDelay = retryDelaysMs[0];
      if (firstDelay !== undefined) {
        await wait(firstDelay);
        const reloaded = await inspect(options);
        if (reloaded) return { action, inspection: reloaded };
      }
    } catch {
      options.audit?.({ action: 'reload', outcome: 'failed' });
    }
  }

  await openDestination(options);
  action = 'opened';

  for (const delay of health.state === 'connected' ? retryDelaysMs.slice(1) : retryDelaysMs) {
    await wait(delay);
    const recovered = await inspect(options);
    if (recovered) return { action, inspection: recovered };
  }
  throw new Error(health.state === 'disconnected' ? 'TRANSPORT_DISCONNECTED' : 'CHATGPT_NOT_READY');
}
