import { MessageAction } from '@/types';
import { isAIServiceUrl, logger } from '@/utils';

/**
 * Ask the service worker for the article to inject once the AI service page has loaded.
 * The service worker also sends it when the tab reports 'complete', but Firefox can
 * report that before the content script listens, and that message is then lost.
 * When both arrive, the content script skips the second one.
 * @param pageUrl - The URL of the page the content script runs on
 */
export const requestInjectionOnLoad = (pageUrl: string): void => {
  if (!isAIServiceUrl(pageUrl)) return;

  const request = () => {
    chrome.runtime
      .sendMessage({ action: MessageAction.REQUEST_INJECTION })
      .catch(error => logger.warn('📨', '[InjectionRequest.ts]', '[requestInjectionOnLoad]', 'Failed to request the injection:', error));
  };

  /* Start from the loaded page, as the injection from the 'complete' tab update does */
  if (document.readyState === 'complete') {
    request();
  } else {
    window.addEventListener('load', request, { once: true });
  }
};
