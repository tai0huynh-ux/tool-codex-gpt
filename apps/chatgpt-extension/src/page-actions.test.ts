// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  RESPONSE_CLOSE_MARKER,
  RESPONSE_OPEN_MARKER,
  insertComposerText,
  parseStructuredResponse,
} from './page-actions';

const response = {
  protocolVersion: '1.0',
  handoffId: 'handoff-1',
  correlationId: 'correlation-1',
  projectId: 'project-1',
  status: 'ready_for_codex',
  analysisSummary: 'Ready.',
  codexPrompt: 'Implement safely.',
  attachmentsRequested: [],
  requiresUserDecision: false,
};

function marked(value: unknown): string {
  return `${RESPONSE_OPEN_MARKER}${JSON.stringify(value)}${RESPONSE_CLOSE_MARKER}`;
}

describe('composer insertion', () => {
  it('uses the native textarea setter and emits editing events without submitting', () => {
    document.body.innerHTML = '<form><textarea id="prompt-textarea"></textarea></form>';
    const composer = document.querySelector<HTMLTextAreaElement>('#prompt-textarea');
    if (!composer) throw new Error('TEST_COMPOSER_NOT_FOUND');
    let controlledValue = '';
    let submitted = false;
    Object.defineProperty(composer, 'value', {
      configurable: true,
      get: () => controlledValue,
      set: () => undefined,
    });
    composer.addEventListener('input', () => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      if (!descriptor?.get) throw new Error('TEST_NATIVE_VALUE_GETTER_NOT_FOUND');
      controlledValue = String(descriptor.get.call(composer));
    });
    composer.closest('form')?.addEventListener('submit', () => {
      submitted = true;
    });

    const text = 'Unicode: xin chào\n```ts\nconst safe = true;\n```';
    expect(insertComposerText(document, text)).toBe(true);
    expect(controlledValue).toBe(text);
    expect(submitted).toBe(false);
  });

  it('supports contenteditable and rejects missing or read-only composers', () => {
    document.body.innerHTML = '<div contenteditable="true" data-testid="prompt-textarea"></div>';
    expect(insertComposerText(document, 'A'.repeat(20_000))).toBe(true);
    expect(document.querySelector('[contenteditable="true"]')?.textContent).toHaveLength(20_000);

    document.body.innerHTML = '<textarea id="prompt-textarea" readonly></textarea>';
    expect(insertComposerText(document, 'blocked')).toBe(false);
    document.body.innerHTML = '';
    expect(insertComposerText(document, 'missing')).toBe(false);
  });

  it('honors a cancelled beforeinput event', () => {
    document.body.innerHTML = '<textarea id="prompt-textarea"></textarea>';
    document.querySelector('textarea')?.addEventListener('beforeinput', (event) => {
      event.preventDefault();
    });
    expect(insertComposerText(document, 'blocked by host')).toBe(false);
  });
});

describe('structured response parsing', () => {
  it('returns only the newest bounded paired response and validates identity', () => {
    const older = marked({ ...response, handoffId: 'old' });
    const result = parseStructuredResponse(
      `${older}\nnoise\n${marked(response)}\ncontent after the closing marker`,
      {
        expectedHandoffId: 'handoff-1',
        expectedCorrelationId: 'correlation-1',
        expectedProjectId: 'project-1',
      },
    );
    expect(result).toEqual({ ok: true, response });
  });

  it.each([
    ['MARKER_NOT_FOUND', 'plain text'],
    ['MARKER_UNCLOSED', `${RESPONSE_OPEN_MARKER}{}`],
    ['INVALID_JSON', marked('not-json').replace('"not-json"', '{invalid')],
    ['SCHEMA_INVALID', marked({ protocolVersion: '1.0' })],
  ] as const)('returns %s for malformed input', (code, text) => {
    expect(parseStructuredResponse(text)).toMatchObject({ ok: false, error: { code } });
  });

  it('rejects oversized, mismatched, and duplicate responses', () => {
    expect(parseStructuredResponse(marked(response), { maxPayloadCharacters: 10 })).toMatchObject({
      ok: false,
      error: { code: 'PAYLOAD_TOO_LARGE' },
    });
    for (const [options, code] of [
      [{ expectedHandoffId: 'wrong-handoff' }, 'HANDOFF_ID_MISMATCH'],
      [{ expectedCorrelationId: 'wrong-correlation' }, 'CORRELATION_ID_MISMATCH'],
      [{ expectedProjectId: 'wrong-project' }, 'PROJECT_ID_MISMATCH'],
    ] as const) {
      expect(parseStructuredResponse(marked(response), options)).toMatchObject({
        ok: false,
        error: { code },
      });
    }
    expect(
      parseStructuredResponse(marked(response), {
        acceptedHandoffIds: new Set(['handoff-1']),
      }),
    ).toMatchObject({ ok: false, error: { code: 'DUPLICATE_RESPONSE' } });
  });
});
