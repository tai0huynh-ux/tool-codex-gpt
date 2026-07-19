import {
  chatGptConversationIdFromPath,
  chatGptRenderedCatalogSchema,
  type ChatGptRenderedCatalog,
} from '@codex-context-bridge/contracts';

const MAX_CONVERSATIONS = 200;

function cleanLabel(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 300) : undefined;
}

function anchorPath(anchor: HTMLAnchorElement): string | undefined {
  try {
    const href = anchor.getAttribute('href');
    if (!href) return undefined;
    const url = new URL(href, 'https://chatgpt.com');
    if (url.origin !== 'https://chatgpt.com' || url.search || url.hash) return undefined;
    return url.pathname;
  } catch {
    return undefined;
  }
}

function projectIdFromConversationPath(path: string): string | undefined {
  const segments = path.split('/').filter(Boolean);
  return segments[0] === 'g' && segments[1] && segments[2] === 'c' ? segments[1] : undefined;
}

function renderedProjectNames(document: Document): Map<string, string> {
  const names = new Map<string, string>();
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const path = anchorPath(anchor);
    if (!path) continue;
    const segments = path.split('/').filter(Boolean);
    if (segments.length !== 2 || segments[0] !== 'g' || !segments[1]) continue;
    const label = cleanLabel(anchor.getAttribute('aria-label')) ?? cleanLabel(anchor.textContent);
    if (label) names.set(segments[1], label);
  }
  return names;
}

export function discoverRenderedConversations(
  document: Document,
  location: Location,
  now: () => string = () => new Date().toISOString(),
): ChatGptRenderedCatalog {
  const projectNames = renderedProjectNames(document);
  const seen = new Set<string>();
  const conversations: ChatGptRenderedCatalog['conversations'] = [];
  let matched = 0;

  for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const conversationPath = anchorPath(anchor);
    if (!conversationPath) continue;
    const conversationId = chatGptConversationIdFromPath(conversationPath);
    if (!conversationId || seen.has(conversationPath)) continue;
    seen.add(conversationPath);
    matched += 1;
    if (conversations.length >= MAX_CONVERSATIONS) continue;

    const projectId = projectIdFromConversationPath(conversationPath);
    const title =
      cleanLabel(anchor.getAttribute('aria-label')) ??
      cleanLabel(anchor.textContent) ??
      `Chat ${conversationId.slice(0, 12)}`;
    conversations.push({
      conversationId,
      conversationPath,
      title,
      ...(projectId ? { projectId } : {}),
      ...(projectId && projectNames.get(projectId)
        ? { projectName: projectNames.get(projectId) }
        : {}),
      current: location.pathname === conversationPath,
    });
  }

  return chatGptRenderedCatalogSchema.parse({
    conversations,
    capturedAt: now(),
    truncated: matched > MAX_CONVERSATIONS,
  });
}
