import {
  chatGptConversationIdFromPath,
  chatGptRenderedCatalogSchema,
  localTransportOperationSchema,
  localTransportResultSchema,
  type ChatGptDestination,
  type ChatGptRenderedCatalog,
  type LocalTransportOperation,
  type LocalTransportResult,
} from '@codex-context-bridge/contracts';

const MAX_DISCOVERY_TABS = 16;
const DISCOVERY_TAB_TIMEOUT_MS = 2_000;

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
    return chatGptConversationIdFromPath(parsed.pathname);
  } catch {
    return undefined;
  }
}

function isNewChatUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === 'https://chatgpt.com' && parsed.pathname === '/';
  } catch {
    return false;
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
        ? eligible.filter((tab) => isNewChatUrl(tab.url ?? ''))
        : eligible;
  const selected = rankTabs(matching)[0];
  if (!selected) throw new Error('CHATGPT_TAB_NOT_FOUND');
  return selected;
}

function messageFor(operation: LocalTransportOperation): unknown {
  switch (operation.type) {
    case 'conversation.discover':
      return { type: 'discover-conversations' };
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
    case 'conversation.discover':
      return localTransportResultSchema.parse({
        type: 'conversation.discover.result',
        catalog: response,
      });
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

async function discoverAcrossTabs(
  tabs: BrowserTabs,
  availableTabs: BrowserTab[],
): Promise<LocalTransportResult> {
  type TabWithId = Omit<BrowserTab, 'id'> & { id: number };
  const eligible = availableTabs.filter(
    (tab): tab is TabWithId =>
      typeof tab.id === 'number' && tab.url?.startsWith('https://chatgpt.com/') === true,
  );
  if (eligible.length === 0) throw new Error('CHATGPT_TAB_NOT_FOUND');

  const discoverTab = async (tab: TabWithId): Promise<ChatGptRenderedCatalog> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        sendToTab(tabs, tab.id, { type: 'discover-conversations' }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('CHATGPT_DISCOVERY_TAB_TIMEOUT')),
            DISCOVERY_TAB_TIMEOUT_MS,
          );
        }),
      ]);
      return chatGptRenderedCatalogSchema.parse(response);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const results = await Promise.allSettled(
    rankTabs(eligible)
      .slice(0, MAX_DISCOVERY_TABS)
      .map((tab) => discoverTab(tab as TabWithId)),
  );
  const catalogs = results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  if (catalogs.length === 0) throw new Error('CHATGPT_DISCOVERY_FAILED');

  const merged = new Map<string, (typeof catalogs)[number]['conversations'][number]>();
  for (const catalog of catalogs) {
    for (const conversation of catalog.conversations) {
      const current = merged.get(conversation.conversationPath);
      merged.set(
        conversation.conversationPath,
        current
          ? {
              ...current,
              ...(conversation.projectName ? { projectName: conversation.projectName } : {}),
              current: current.current || conversation.current,
            }
          : conversation,
      );
    }
  }
  return localTransportResultSchema.parse({
    type: 'conversation.discover.result',
    catalog: {
      conversations: [...merged.values()].slice(0, 200),
      capturedAt: new Date().toISOString(),
      truncated: catalogs.some((catalog) => catalog.truncated) || merged.size > 200,
    },
  });
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
      if (operation.type === 'conversation.discover') {
        return discoverAcrossTabs(tabs, availableTabs);
      }
      const destination =
        operation.type === 'conversation.capture' ||
        operation.type === 'composer.insert' ||
        operation.type === 'composer.submit' ||
        operation.type === 'page.inspect' ||
        operation.type === 'page.reload' ||
        operation.type === 'page.status'
          ? operation.destination
          : undefined;
      const tab = selectTab(availableTabs, destination);
      if (tab.id === undefined) throw new Error('CHATGPT_TAB_NOT_FOUND');
      const response = await sendToTab(tabs, tab.id, messageFor(operation));
      return resultFor(operation, response);
    },
  };
}
