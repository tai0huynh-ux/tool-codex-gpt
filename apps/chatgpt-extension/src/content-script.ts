import { captureConversationPage } from './capture';
import {
  clearComposerText,
  findStructuredResponse,
  hashComposerText,
  inspectChatGptPage,
  insertComposerText,
  isStreaming,
  submitComposer,
} from './page-actions';
import type { ChatGptDestination } from '@codex-context-bridge/contracts';

interface CaptureRequest {
  type: 'capture-conversation';
}
interface InsertRequest {
  type: 'insert-composer-text';
  text: string;
  effectId: string;
  payloadHash: string;
}
interface InspectRequest {
  type: 'inspect-page';
}
interface ReloadRequest {
  type: 'reload-page';
}
interface SubmitRequest {
  type: 'submit-composer';
  effectId: string;
  expectedTextHash: string;
  destination: ChatGptDestination;
}
interface ClearRequest {
  type: 'clear-composer-text';
  effectId: string;
  expectedTextHash: string;
}
interface StatusRequest {
  type: 'page-status';
  expectedHandoffId?: string;
  expectedCorrelationId?: string;
  expectedProjectId?: string;
}
type ExtensionRequest =
  | CaptureRequest
  | InsertRequest
  | SubmitRequest
  | InspectRequest
  | ReloadRequest
  | ClearRequest
  | StatusRequest;

type SubmitResult =
  | Awaited<ReturnType<typeof submitComposer>>
  | {
      submitted: false;
      code: 'DUPLICATE_EFFECT';
    };

export function createSubmitEffectGuard(): (
  effectId: string,
  submit: () => Promise<Awaited<ReturnType<typeof submitComposer>>>,
) => Promise<SubmitResult> {
  const reservedEffects = new Set<string>();
  return async (effectId, submit) => {
    if (reservedEffects.has(effectId)) {
      return { submitted: false, code: 'DUPLICATE_EFFECT' };
    }
    reservedEffects.add(effectId);
    // A thrown submit remains reserved because the click outcome is ambiguous.
    const result = await submit();
    if (!result.submitted) reservedEffects.delete(effectId);
    return result;
  };
}

export function schedulePageReload(
  schedule: (callback: () => void, delay: number) => unknown,
  reload: () => void,
): { reloaded: true } {
  schedule(reload, 0);
  return { reloaded: true };
}

const submitEffect = createSubmitEffectGuard();

if (location.origin === 'https://chatgpt.com' && typeof chrome !== 'undefined') {
  void chrome.runtime.sendMessage({ type: 'bridge-content-ready' }).catch(() => undefined);

  chrome.runtime.onMessage.addListener((request: ExtensionRequest, _sender, sendResponse) => {
    if (request.type === 'capture-conversation') {
      void captureConversationPage(document, location).then(sendResponse);
      return true;
    }

    if (request.type === 'insert-composer-text') {
      void (async () => {
        const textHash = await hashComposerText(request.text);
        if (textHash !== request.payloadHash) {
          sendResponse({ inserted: false, sent: false });
          return;
        }
        const inserted = insertComposerText(document, request.text);
        sendResponse({ inserted, sent: false, ...(inserted ? { textHash } : {}) });
      })();
      return true;
    }

    if (request.type === 'inspect-page') {
      void inspectChatGptPage(document, location).then(sendResponse);
      return true;
    }

    if (request.type === 'reload-page') {
      sendResponse(
        schedulePageReload(window.setTimeout.bind(window), () => window.location.reload()),
      );
      return false;
    }

    if (request.type === 'submit-composer') {
      void (async () => {
        const result = await submitEffect(request.effectId, () =>
          submitComposer(document, location, request.expectedTextHash, request.destination),
        );
        sendResponse(result);
      })();
      return true;
    }

    if (request.type === 'clear-composer-text') {
      void clearComposerText(document, request.expectedTextHash).then((cleared) =>
        sendResponse({ cleared }),
      );
      return true;
    }

    sendResponse({
      streaming: isStreaming(document),
      structuredResponse: findStructuredResponse(document, {
        ...(request.expectedHandoffId ? { expectedHandoffId: request.expectedHandoffId } : {}),
        ...(request.expectedCorrelationId
          ? { expectedCorrelationId: request.expectedCorrelationId }
          : {}),
        ...(request.expectedProjectId ? { expectedProjectId: request.expectedProjectId } : {}),
      }),
    });
    return false;
  });
}
