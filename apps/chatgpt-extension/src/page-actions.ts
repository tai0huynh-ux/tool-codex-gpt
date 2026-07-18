import { selectors } from './selectors';

export function insertComposerText(document: Document, text: string): boolean {
  const composer = selectors.composer
    .map((selector) => document.querySelector<HTMLElement>(selector))
    .find((candidate) => candidate !== null);
  if (!composer) return false;

  composer.focus();
  if (composer instanceof HTMLTextAreaElement) {
    composer.value = text;
  } else {
    composer.textContent = text;
  }
  composer.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }),
  );
  return true;
}

export function isStreaming(document: Document): boolean {
  return selectors.streaming.some((selector) => document.querySelector(selector) !== null);
}

export function findStructuredResponse(document: Document, marker: string): string | undefined {
  const text = document.body.textContent;
  const markerIndex = text.lastIndexOf(marker);
  return markerIndex >= 0 ? text.slice(markerIndex).trim() : undefined;
}
