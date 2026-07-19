import {
  localTransportOperationSchema,
  localTransportResultSchema,
  type ChatGptDestination,
  type LocalTransportOperation,
  type LocalTransportResult,
} from '@codex-context-bridge/contracts';

export interface BrowserTab {
  id?: number | undefined;
  url?: string | undefined;
  active?: boolean | undefined;
  lastAccessed?: number | undefined;
}

export interface BrowserTabs {
  query(queryInfo: { url: string }): Promise<BrowserTab[]>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
  injectContentScript?(tabId: number): Promise<void>;
}

function isMissingReceiver(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection')
  );
}

async function sendToTab(tabs: BrowserTabs, tabId: number, message: unknown): Promise<unknown> {
  try {
    return await tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!tabs.injectContentScript || !isMissingReceiver(error)) throw error;
    await tabs.injectContentScript(tabId);
    return tabs.sendMessage(tabId, message);
  }
}

function conversationId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://chatgpt.com') return undefined;
    const segments = parsed.pathname.split('/').filter(Boolean);
    const conversationMarker = segments.lastIndexOf('c');
    return conversationMarker >= 0 ? segments[conversationMarker + 1] : undefined;
  } catch {
    return undefined;
  }
}

function rankTabs(tabs: BrowserTab[]): BrowserTab[] {
  return [...tabs].sort(
    (left, right) =>
      Number(Boolean(right.active)) - Number(Boolean(left.active)) ||
      (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0) ||
      (left.id ?? Number.MAX_SAFE_INTEGER) - (right.id ?? Number.MAX_SAFE_INTEGER),
  );
}

function selectTab(tabs: BrowserTab[], destination?: ChatGptDestination): BrowserTab {
  const eligible = tabs.filter(
    (tab) => tab.id !== undefined && tab.url?.startsWith('https://chatgpt.com/'),
  );
  const matching =
    destination?.mode === 'existing'
      ? eligible.filter((tab) => conversationId(tab.url ?? '') === destination.conversationId)
      : destination?.mode === 'new'
        ? eligible.filter((tab) => conversationId(tab.url ?? '') === undefined)
        : eligible;
  const selected = rankTabs(matching)[0];
  if (!selected) throw new Error('CHATGPT_TAB_NOT_FOUND');
  return selected;
}

function messageFor(operation: LocalTransportOperation): unknown {
  switch (operation.type) {
    case 'conversation.capture':
      return { type: 'capture-conversation' };
    case 'composer.insert':
      return {
        type: 'insert-composer-text',
        text: operation.text,
        effectId: operation.effectId,
        payloadHash: operation.payloadHash,
      };
    case 'composer.submit':
      return {
        type: 'submit-composer',
        effectId: operation.effectId,
        expectedTextHash: operation.expectedTextHash,
        destination: operation.destination,
      };
    case 'page.inspect':
      return { type: 'inspect-page' };
    case 'page.reload':
      return { type: 'reload-page' };
    case 'composer.clear':
      return {
        type: 'clear-composer-text',
        effectId: operation.effectId,
        expectedTextHash: operation.expectedTextHash,
      };
    case 'page.status':
      return {
        type: 'page-status',
        ...(operation.expectedHandoffId ? { expectedHandoffId: operation.expectedHandoffId } : {}),
        ...(operation.expectedCorrelationId
          ? { expectedCorrelationId: operation.expectedCorrelationId }
          : {}),
        ...(operation.expectedProjectId ? { expectedProjectId: operation.expectedProjectId } : {}),
      };
    case 'bridge.health':
      throw new Error('HEALTH_DOES_NOT_REQUIRE_TAB_MESSAGE');
  }
}

function resultFor(operation: LocalTransportOperation, response: unknown): LocalTransportResult {
  switch (operation.type) {
    case 'conversation.capture':
      return localTransportResultSchema.parse({
        type: 'conversation.capture.result',
        snapshot: response,
      });
    case 'composer.insert':
      return localTransportResultSchema.parse({
        type: 'composer.insert.result',
        ...(response as object),
      });
    case 'composer.submit':
      return localTransportResultSchema.parse({
        type: 'composer.submit.result',
        ...(response as object),
      });
    case 'page.inspect':
      return localTransportResultSchema.parse({
        type: 'page.inspect.result',
        inspection: response,
      });
    case 'page.reload':
      return localTransportResultSchema.parse({
        type: 'page.reload.result',
        ...(response as object),
      });
    case 'composer.clear':
      return localTransportResultSchema.parse({
        type: 'composer.clear.result',
        ...(response as object),
      });
    case 'page.status':
      return localTransportResultSchema.parse({
        type: 'page.status.result',
        ...(response as object),
      });
    case 'bridge.health':
      return localTransportResultSchema.parse({ type: 'bridge.health.result', status: 'ready' });
  }
}

export function createExtensionOperationExecutor(tabs: BrowserTabs): {
  execute(operation: unknown): Promise<LocalTransportResult>;
} {
  return {
    async execute(input): Promise<LocalTransportResult> {
      const operation = localTransportOperationSchema.parse(input);
      const availableTabs = await tabs.query({ url: 'https://chatgpt.com/*' });
      if (operation.type === 'bridge.health') {
        return localTransportResultSchema.parse({
          type: 'bridge.health.result',
          status: availableTabs.some((tab) => tab.id !== undefined) ? 'ready' : 'degraded',
        });
      }
      const destination =
        operation.type === 'composer.insert' ||
        operation.type === 'composer.submit' ||
        operation.type === 'page.reload'
          ? operation.destination
          : undefined;
      const tab = selectTab(availableTabs, destination);
      if (tab.id === undefined) throw new Error('CHATGPT_TAB_NOT_FOUND');
      const response = await sendToTab(tabs, tab.id, messageFor(operation));
      return resultFor(operation, response);
    },
  };
}
