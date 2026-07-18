import { captureLongConversation } from './capture';
import { findStructuredResponse, insertComposerText, isStreaming } from './page-actions';

interface CaptureRequest {
  type: 'capture-conversation';
}
interface InsertRequest {
  type: 'insert-composer-text';
  text: string;
  approvalToken?: string;
}
interface StatusRequest {
  type: 'page-status';
  expectedHandoffId?: string;
  expectedCorrelationId?: string;
  expectedProjectId?: string;
}
type ExtensionRequest = CaptureRequest | InsertRequest | StatusRequest;

if (location.origin === 'https://chatgpt.com' && typeof chrome !== 'undefined') {
  chrome.runtime.onMessage.addListener((request: ExtensionRequest, _sender, sendResponse) => {
    if (request.type === 'capture-conversation') {
      void captureLongConversation(document).then(sendResponse);
      return true;
    }

    if (request.type === 'insert-composer-text') {
      sendResponse({ inserted: insertComposerText(document, request.text), sent: false });
      return false;
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
