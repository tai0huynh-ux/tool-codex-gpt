import { selectors } from './selectors';

export interface CapturedMessage {
  role: string;
  text: string;
}

export interface ConversationSnapshot {
  title: string;
  projectName?: string;
  messages: CapturedMessage[];
  contentHash: string;
  capturedAt: string;
}

function firstText(document: Document, candidates: readonly string[]): string | undefined {
  for (const selector of candidates) {
    const text = document.querySelector(selector)?.textContent.trim();
    if (text) return text;
  }
  return undefined;
}

function renderedMessages(document: Document): CapturedMessage[] {
  const nodes = new Set<Element>();
  for (const selector of selectors.messages) {
    document.querySelectorAll(selector).forEach((node) => nodes.add(node));
  }

  return [...nodes]
    .map((node) => ({
      role: node.getAttribute('data-message-author-role') ?? 'unknown',
      text: node.textContent.trim(),
    }))
    .filter((message) => message.text.length > 0);
}

interface AccumulatedMessage extends CapturedMessage {
  key: string;
  ordinal: number;
}

export interface LongCaptureOptions {
  signal?: AbortSignal;
  maxPasses?: number;
  settleMs?: number;
}

function messageOrdinal(node: Element, fallback: number): number {
  const explicit = Number(node.getAttribute('data-message-index'));
  if (Number.isInteger(explicit) && explicit >= 0) return explicit;
  const testId = node.getAttribute('data-testid');
  const match = testId?.match(/(\d+)$/);
  return match ? Number(match[1]) : fallback;
}

function accumulateRenderedMessages(
  document: Document,
  messages: Map<string, AccumulatedMessage>,
): boolean {
  const nodes = new Set<Element>();
  for (const selector of selectors.messages) {
    document.querySelectorAll(selector).forEach((node) => nodes.add(node));
  }

  let changed = false;
  for (const [index, node] of [...nodes].entries()) {
    const role = node.getAttribute('data-message-author-role') ?? 'unknown';
    const text = node.textContent.trim();
    if (!text) continue;
    const stableId = node.getAttribute('data-message-id') ?? node.getAttribute('data-testid');
    const key = stableId ? `id:${stableId}` : `content:${role}:${text}`;
    const ordinal = messageOrdinal(node, messages.get(key)?.ordinal ?? messages.size + index);
    const previous = messages.get(key);
    if (previous?.role !== role || previous.text !== text || previous.ordinal !== ordinal) {
      messages.set(key, { key, role, text, ordinal });
      changed = true;
    }
  }
  return changed;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Conversation capture aborted', 'AbortError');
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Conversation capture aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

async function buildSnapshot(
  document: Document,
  messages: CapturedMessage[],
): Promise<ConversationSnapshot> {
  const title = firstText(document, selectors.conversationTitle) ?? 'Untitled conversation';
  const projectName = firstText(document, selectors.projectName);
  const contentHash = await sha256(JSON.stringify({ title, projectName, messages }));
  return {
    title,
    ...(projectName ? { projectName } : {}),
    messages,
    contentHash,
    capturedAt: new Date().toISOString(),
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function captureRenderedConversation(
  document: Document,
): Promise<ConversationSnapshot> {
  const messages = renderedMessages(document);
  return buildSnapshot(document, messages);
}

export async function captureConversationPage(
  document: Document,
  location: Location,
): Promise<ConversationSnapshot> {
  const segments = location.pathname.split('/').filter(Boolean);
  const conversationMarker = segments.lastIndexOf('c');
  const hasConversationIdentity = conversationMarker >= 0 && segments[conversationMarker + 1];
  return hasConversationIdentity
    ? captureLongConversation(document)
    : captureRenderedConversation(document);
}

export async function captureLongConversation(
  document: Document,
  scrollContainer: Element = document.scrollingElement ?? document.documentElement,
  options: LongCaptureOptions = {},
): Promise<ConversationSnapshot> {
  const messages = new Map<string, AccumulatedMessage>();
  const maxPasses = options.maxPasses ?? 100;
  const settleMs = options.settleMs ?? 100;
  let unchangedPasses = 0;
  const originalScrollTop = scrollContainer.scrollTop;
  try {
    scrollContainer.scrollTo({ top: 0, behavior: 'auto' });

    for (let pass = 0; pass < maxPasses; pass += 1) {
      throwIfAborted(options.signal);
      if (settleMs > 0) await delay(settleMs, options.signal);
      unchangedPasses = accumulateRenderedMessages(document, messages) ? 0 : unchangedPasses + 1;

      const maximumTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      const currentTop = scrollContainer.scrollTop;
      if (currentTop >= maximumTop && unchangedPasses >= 2) break;
      const step = Math.max(1, Math.floor(scrollContainer.clientHeight * 0.8));
      scrollContainer.scrollTo({ top: Math.min(maximumTop, currentTop + step), behavior: 'auto' });
    }

    if (messages.size === 0) throw new Error('CHAT_CAPTURE_MESSAGES_NOT_FOUND');
    const ordered = [...messages.values()]
      .sort((left, right) => left.ordinal - right.ordinal)
      .map(({ role, text }) => ({ role, text }));
    return await buildSnapshot(document, ordered);
  } finally {
    scrollContainer.scrollTo({ top: originalScrollTop, behavior: 'auto' });
  }
}
