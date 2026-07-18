import { captureLongConversation } from './capture';
import {
  clearComposerText,
  findStructuredResponse,
  hashComposerText,
  inspectChatGptPage,
  insertComposerText,
  isStreaming,
} from './page-actions';

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
  CaptureRequest | InsertRequest | InspectRequest | ClearRequest | StatusRequest;

if (location.origin === 'https://chatgpt.com' && typeof chrome !== 'undefined') {
  chrome.runtime.onMessage.addListener((request: ExtensionRequest, _sender, sendResponse) => {
    if (request.type === 'capture-conversation') {
      void captureLongConversation(document).then(sendResponse);
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
