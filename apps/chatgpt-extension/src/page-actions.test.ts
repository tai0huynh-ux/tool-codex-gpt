// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  RESPONSE_CLOSE_MARKER,
  RESPONSE_OPEN_MARKER,
  clearComposerText,
  hashComposerText,
  inspectChatGptPage,
  insertComposerText,
  parseStructuredResponse,
  submitComposer,
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

  it('inspects existing/new destinations and clears only matching inserted text', async () => {
    document.body.innerHTML = '<textarea id="prompt-textarea"></textarea>';
    const existingLocation = new URL(
      'https://chatgpt.com/g/project-1/c/conversation-1',
    ) as unknown as Location;
    expect(await inspectChatGptPage(document, existingLocation)).toEqual({
      page: { mode: 'existing', conversationId: 'conversation-1' },
      composer: { available: true, readOnly: false },
    });

    const text = 'Reviewed handoff';
    expect(insertComposerText(document, text)).toBe(true);
    const textHash = await hashComposerText(text);
    expect(
      await inspectChatGptPage(document, new URL('https://chatgpt.com/') as unknown as Location),
    ).toEqual({
      page: { mode: 'new' },
      composer: { available: true, readOnly: false, textHash },
    });
    expect(await clearComposerText(document, 'f'.repeat(64))).toBe(false);
    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(text);
    expect(await clearComposerText(document, textHash)).toBe(true);
    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('');
  });

  it('submits through an enabled semantic control only after exact safety checks', async () => {
    document.body.innerHTML = `
      <form>
        <textarea id="prompt-textarea"></textarea>
        <button type="submit" data-testid="send-button">Send</button>
      </form>`;
    let submitted = 0;
    document.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      submitted += 1;
    });
    const text = 'Approved exact payload';
    expect(insertComposerText(document, text)).toBe(true);
    const textHash = await hashComposerText(text);
    await expect(
      submitComposer(
        document,
        new URL('https://chatgpt.com/c/conversation-1') as unknown as Location,
        textHash,
        { mode: 'existing', conversationId: 'conversation-1' },
      ),
    ).resolves.toEqual({ submitted: true, textHash });
    expect(submitted).toBe(1);

    await expect(
      submitComposer(
        document,
        new URL('https://chatgpt.com/c/conversation-2') as unknown as Location,
        textHash,
        { mode: 'existing', conversationId: 'conversation-1' },
      ),
    ).resolves.toEqual({ submitted: false, code: 'DESTINATION_MISMATCH' });
    await expect(
      submitComposer(
        document,
        new URL('https://chatgpt.com/c/conversation-1') as unknown as Location,
        'f'.repeat(64),
        { mode: 'existing', conversationId: 'conversation-1' },
      ),
    ).resolves.toEqual({ submitted: false, code: 'HASH_MISMATCH' });
    expect(submitted).toBe(1);
  });

  it('blocks submit while streaming or when the semantic control is disabled', async () => {
    document.body.innerHTML = `
      <textarea id="prompt-textarea">Approved exact payload</textarea>
      <button data-testid="send-button" disabled>Send</button>`;
    const textHash = await hashComposerText('Approved exact payload');
    await expect(
      submitComposer(document, new URL('https://chatgpt.com/') as unknown as Location, textHash, {
        mode: 'new',
      }),
    ).resolves.toEqual({ submitted: false, code: 'SUBMIT_DISABLED' });
    document.body.insertAdjacentHTML(
      'beforeend',
      '<button data-testid="stop-button">Stop</button>',
    );
    await expect(
      submitComposer(document, new URL('https://chatgpt.com/') as unknown as Location, textHash, {
        mode: 'new',
      }),
    ).resolves.toEqual({ submitted: false, code: 'STREAMING' });
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
