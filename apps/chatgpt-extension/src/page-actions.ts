import {
  contextBridgeResponseSchema,
  type ContextBridgeResponse,
} from '@codex-context-bridge/contracts';
import { selectors } from './selectors';

export const RESPONSE_OPEN_MARKER = '<CONTEXT_BRIDGE_RESPONSE>';
export const RESPONSE_CLOSE_MARKER = '</CONTEXT_BRIDGE_RESPONSE>';

export function insertComposerText(document: Document, text: string): boolean {
  const composer = selectors.composer
    .map((selector) => document.querySelector<HTMLElement>(selector))
    .find((candidate) => candidate !== null);
  if (!composer || isReadOnlyComposer(composer)) return false;

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
