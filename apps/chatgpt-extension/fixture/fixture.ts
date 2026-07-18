import { captureLongConversation, type ConversationSnapshot } from '../src/capture';
import {
  clearComposerText,
  hashComposerText,
  inspectChatGptPage,
  insertComposerText,
  isStreaming,
} from '../src/page-actions';

declare global {
  interface Window {
    capturedFixture?: ConversationSnapshot;
    assistedFixture?: {
      inserted: boolean;
      submitted: boolean;
      streaming: boolean;
      inspection: Awaited<ReturnType<typeof inspectChatGptPage>>;
      refusedWrongClear: boolean;
      cleared: boolean;
      finalComposerText: string;
    };
  }
}

const messages = [
  ['user', 'First virtualized message.'],
  ['assistant', 'Second virtualized message.'],
  ['user', 'Duplicate text.'],
  ['user', 'Duplicate text.'],
  ['assistant', 'Streaming response complete.'],
] as const;
const viewport = document.querySelector<HTMLElement>('#message-viewport');
if (!viewport) throw new Error('FIXTURE_VIEWPORT_NOT_FOUND');
let currentTop = 0;
const render = () => {
  const start = Math.min(messages.length - 2, Math.floor(currentTop / 100));
  viewport.innerHTML = messages
    .slice(start, start + 2)
    .map(
      ([role, text], offset) =>
        `<article data-message-author-role="${role}" data-message-id="fixture-${String(start + offset)}" data-message-index="${String(start + offset)}">${text}</article>`,
    )
    .join('');
};
Object.defineProperties(viewport, {
  clientHeight: { value: 100 },
  scrollHeight: { value: 400 },
  scrollTop: { get: () => currentTop },
});
viewport.scrollTo = (options?: ScrollToOptions | number, y?: number) => {
  currentTop = typeof options === 'number' ? (y ?? 0) : (options?.top ?? 0);
  render();
};
render();
window.capturedFixture = await captureLongConversation(document, viewport, { settleMs: 0 });

let submitted = false;
document.querySelector('#composer-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  submitted = true;
});
const assistedText = 'Reviewed assisted handoff.';
const inserted = insertComposerText(document, assistedText);
const inspection = await inspectChatGptPage(
  document,
  new URL('https://chatgpt.com/') as unknown as Location,
);
const refusedWrongClear = !(await clearComposerText(document, 'f'.repeat(64)));
const cleared = await clearComposerText(document, await hashComposerText(assistedText));
window.assistedFixture = {
  inserted,
  submitted,
  streaming: isStreaming(document),
  inspection,
  refusedWrongClear,
  cleared,
  finalComposerText: document.querySelector<HTMLTextAreaElement>('#prompt-textarea')?.value ?? '',
};
