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

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function captureRenderedConversation(
  document: Document,
): Promise<ConversationSnapshot> {
  const messages = renderedMessages(document);
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

export async function captureLongConversation(
  document: Document,
  scrollContainer: Element = document.scrollingElement ?? document.documentElement,
): Promise<ConversationSnapshot> {
  let previousHeight = -1;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const currentHeight = scrollContainer.scrollHeight;
    if (currentHeight === previousHeight) break;
    previousHeight = currentHeight;
    scrollContainer.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return captureRenderedConversation(document);
}
