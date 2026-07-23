import {
  chatGptConversationIdFromPath,
  chatGptPageInspectionSchema,
  contextBridgeResponseSchema,
  type ChatGptPageIdentity,
  type ChatGptPageInspection,
  type ChatGptDestination,
  type ContextBridgeResponse,
} from '@codex-context-bridge/contracts';
import { selectors } from './selectors';

export const RESPONSE_OPEN_MARKER = '<CONTEXT_BRIDGE_RESPONSE>';
export const RESPONSE_CLOSE_MARKER = '</CONTEXT_BRIDGE_RESPONSE>';

function findComposer(document: Document): HTMLElement | undefined {
  return selectors.composer
    .map((selector) => document.querySelector<HTMLElement>(selector))
    .find((candidate) => candidate !== null);
}

const composerBlockElements = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DIV',
  'FOOTER',
  'HEADER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'UL',
]);

function serializeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof HTMLElement)) return '';
  if (node.tagName === 'BR') return '\n';
  return [...node.childNodes].map(serializeInlineNode).join('');
}

function isEmptyEditorBlock(element: HTMLElement): boolean {
  return [...element.childNodes].every((node) => {
    if (node.nodeType === Node.TEXT_NODE) return !(node.textContent ?? '').trim();
    if (!(node instanceof HTMLElement)) return true;
    return node.tagName === 'BR' || isEmptyEditorBlock(node);
  });
}

function serializeContentEditable(composer: HTMLElement): string {
  const lines: string[] = [];
  let inline = '';
  for (const node of composer.childNodes) {
    if (node instanceof HTMLElement && composerBlockElements.has(node.tagName)) {
      if (inline) {
        lines.push(inline);
        inline = '';
      }
      lines.push(isEmptyEditorBlock(node) ? '' : serializeInlineNode(node));
      continue;
    }
    inline += serializeInlineNode(node);
  }
  if (inline || lines.length === 0) lines.push(inline);
  return lines.join('\n');
}

function composerText(composer: HTMLElement): string {
  return composer instanceof HTMLTextAreaElement
    ? composer.value
    : serializeContentEditable(composer);
}

function setComposerText(composer: HTMLElement, text: string): boolean {
  if (isReadOnlyComposer(composer)) return false;

  composer.focus();
  const beforeInput = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: text,
  });
  if (!composer.dispatchEvent(beforeInput)) return false;

  if (composer instanceof HTMLTextAreaElement) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (!descriptor?.set) return false;
    descriptor.set.call(composer, text);
  } else {
    composer.textContent = text;
  }

  composer.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }),
  );
  composer.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

export function insertComposerText(document: Document, text: string): boolean {
  const composer = findComposer(document);
  return Boolean(composer && text.length > 0 && setComposerText(composer, text));
}

function isReadOnlyComposer(composer: HTMLElement): boolean {
  return (
    (composer instanceof HTMLTextAreaElement && (composer.readOnly || composer.disabled)) ||
    composer.getAttribute('aria-readonly') === 'true' ||
    composer.getAttribute('contenteditable') === 'false'
  );
}

export function isStreaming(document: Document): boolean {
  return selectors.streaming.some((selector) => document.querySelector(selector) !== null);
}

export function normalizeComposerText(text: string): string {
  return text.replaceAll('\r\n', '\n').trim();
}

export async function hashComposerText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeComposerText(text));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function identifyPage(location: Location, composerAvailable: boolean): ChatGptPageIdentity {
  if (location.origin !== 'https://chatgpt.com') return { mode: 'unsupported' };
  const conversationId = chatGptConversationIdFromPath(location.pathname);
  if (conversationId) {
    return { mode: 'existing', conversationId, conversationPath: location.pathname };
  }
  return composerAvailable ? { mode: 'new' } : { mode: 'unsupported' };
}

export async function inspectChatGptPage(
  document: Document,
  location: Location,
): Promise<ChatGptPageInspection> {
  const composer = findComposer(document);
  const available = composer !== undefined;
  const currentText = composer ? normalizeComposerText(composerText(composer)) : '';
  return chatGptPageInspectionSchema.parse({
    page: identifyPage(location, available),
    composer: {
      available,
      readOnly: composer ? isReadOnlyComposer(composer) : false,
      ...(currentText ? { textHash: await hashComposerText(currentText) } : {}),
    },
  });
}

export async function clearComposerText(
  document: Document,
  expectedTextHash: string,
): Promise<boolean> {
  const composer = findComposer(document);
  if (!composer || isReadOnlyComposer(composer)) return false;
  const currentText = normalizeComposerText(composerText(composer));
  if (!currentText || (await hashComposerText(currentText)) !== expectedTextHash) return false;
  return setComposerText(composer, '');
}

export type ComposerSubmitResult =
  | { submitted: true; textHash: string }
  | {
      submitted: false;
      code:
        | 'COMPOSER_UNAVAILABLE'
        | 'COMPOSER_READ_ONLY'
        | 'DESTINATION_MISMATCH'
        | 'STREAMING'
        | 'HASH_MISMATCH'
        | 'SUBMIT_DISABLED';
    };

function pageMatchesDestination(
  page: ChatGptPageIdentity,
  destination: ChatGptDestination,
): boolean {
  return destination.mode === 'existing'
    ? page.mode === 'existing' && page.conversationId === destination.conversationId
    : page.mode === 'new';
}

export async function submitComposer(
  document: Document,
  location: Location,
  expectedTextHash: string,
  destination: ChatGptDestination,
): Promise<ComposerSubmitResult> {
  const inspection = await inspectChatGptPage(document, location);
  if (!pageMatchesDestination(inspection.page, destination)) {
    return { submitted: false, code: 'DESTINATION_MISMATCH' };
  }
  const composer = findComposer(document);
  if (!composer) return { submitted: false, code: 'COMPOSER_UNAVAILABLE' };
  if (isReadOnlyComposer(composer)) return { submitted: false, code: 'COMPOSER_READ_ONLY' };
  if (isStreaming(document)) return { submitted: false, code: 'STREAMING' };
  const textHash = await hashComposerText(composerText(composer));
  if (textHash !== expectedTextHash) return { submitted: false, code: 'HASH_MISMATCH' };
  const submit = selectors.submit
    .map((selector) => document.querySelector<HTMLButtonElement>(selector))
    .find((candidate) => candidate !== null);
  if (!submit || submit.disabled || submit.getAttribute('aria-disabled') === 'true') {
    return { submitted: false, code: 'SUBMIT_DISABLED' };
  }
  submit.click();
  return { submitted: true, textHash };
}

export type StructuredResponseErrorCode =
  | 'MARKER_NOT_FOUND'
  | 'MARKER_UNCLOSED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_JSON'
  | 'SCHEMA_INVALID'
  | 'HANDOFF_ID_MISMATCH'
  | 'CORRELATION_ID_MISMATCH'
  | 'PROJECT_ID_MISMATCH'
  | 'DUPLICATE_RESPONSE';

export type StructuredResponseResult =
  | { ok: true; response: ContextBridgeResponse }
  | { ok: false; error: { code: StructuredResponseErrorCode; message: string } };

export interface StructuredResponseOptions {
  expectedHandoffId?: string;
  expectedCorrelationId?: string;
  expectedProjectId?: string;
  acceptedHandoffIds?: ReadonlySet<string>;
  maxPayloadCharacters?: number;
}

function responseError(
  code: StructuredResponseErrorCode,
  message: string,
): StructuredResponseResult {
  return { ok: false, error: { code, message } };
}

export function parseStructuredResponse(
  text: string,
  options: StructuredResponseOptions = {},
): StructuredResponseResult {
  const start = text.lastIndexOf(RESPONSE_OPEN_MARKER);
  if (start < 0) return responseError('MARKER_NOT_FOUND', 'Response marker was not found.');
  const payloadStart = start + RESPONSE_OPEN_MARKER.length;
  const end = text.indexOf(RESPONSE_CLOSE_MARKER, payloadStart);
  if (end < 0) return responseError('MARKER_UNCLOSED', 'Latest response marker is not closed.');
  const payload = text.slice(payloadStart, end).trim();
  if (payload.length > (options.maxPayloadCharacters ?? 100_000)) {
    return responseError('PAYLOAD_TOO_LARGE', 'Structured response exceeds the configured limit.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return responseError('INVALID_JSON', 'Structured response is not valid JSON.');
  }
  const validation = contextBridgeResponseSchema.safeParse(parsed);
  if (!validation.success) {
    return responseError(
      'SCHEMA_INVALID',
      'Structured response does not match schema version 1.0.',
    );
  }
  const response = validation.data;
  if (options.expectedHandoffId && response.handoffId !== options.expectedHandoffId) {
    return responseError('HANDOFF_ID_MISMATCH', 'Structured response handoff ID does not match.');
  }
  if (options.expectedCorrelationId && response.correlationId !== options.expectedCorrelationId) {
    return responseError(
      'CORRELATION_ID_MISMATCH',
      'Structured response correlation ID does not match.',
    );
  }
  if (options.expectedProjectId && response.projectId !== options.expectedProjectId) {
    return responseError('PROJECT_ID_MISMATCH', 'Structured response project ID does not match.');
  }
  if (options.acceptedHandoffIds?.has(response.handoffId)) {
    return responseError('DUPLICATE_RESPONSE', 'Structured response was already accepted.');
  }
  return { ok: true, response };
}

export function findStructuredResponse(
  document: Document,
  options: StructuredResponseOptions = {},
): StructuredResponseResult {
  return parseStructuredResponse(document.body.textContent, options);
}
