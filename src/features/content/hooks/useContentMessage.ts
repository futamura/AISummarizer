import { useEffect, useRef } from 'react';

import { toast } from '@/features/content/components/main';
import {
  ArticleExtractionService,
  ArticleInjectionService,
  EXTRACTION_MESSAGES,
  EXTRACTION_TOAST_GROUP,
  extractWithProgress,
  getExtractionKind,
  INJECTION_TOAST_GROUP,
  injectWithProgress,
  requestInjectionOnLoad,
} from '@/features/content/services';
import { useSettingsStore } from '@/stores';
import { AI_SERVICE_QUERY_KEY, ArticleExtractionResult, ArticleInjectionResult, getAIServiceForUrl, Message, MessageAction, MessageResponse } from '@/types';
import { copyToClipboard, createPrompt, logger } from '@/utils';

/*
 * Article ids already injected in this document. The service worker can deliver
 * INJECT_ARTICLE more than once for the same article because tabs.onUpdated fires
 * 'complete' repeatedly while the aismid URL is still current during the AI
 * service's SPA boot; a second run would re-select the model and re-fill the
 * editor after the first send (observed live on Kimi 2026-08-09). It also sends
 * the article again when this content script asks for it (REQUEST_INJECTION),
 * which Firefox needs because its 'complete' can come before this listener. Module scope
 * makes the guard survive re-renders; a real page reload starts a fresh document
 * and legitimately allows injecting again.
 */
const handledInjectionArticleIds = new Set<string>();

/**
 * Hook for handling Chrome extension messages; registers the listener for the lifetime of the component
 */
export const useContentMessage = () => {
  /*******************************************************
   * State Management
   *******************************************************/

  const extractionService = useRef(new ArticleExtractionService());
  const injectionService = useRef(new ArticleInjectionService());
  const isListenerRegistered = useRef(false);

  /*******************************************************
   * Lifecycle
   *******************************************************/

  useEffect(() => {
    logger.debug('🫳💬', '[useContentMessage.tsx]', '[useEffect]', 'useContentMessage mounted');

    if (isListenerRegistered.current) {
      logger.warn('🫳💬', '[useContentMessage.tsx]', '[useEffect]', 'useContentMessage: Listener already registered');
      return;
    }

    const handleMessage = (message: Message, sender: chrome.runtime.MessageSender, sendResponse: (response: MessageResponse) => void) => {
      logger.debug('🫳💬', '[useContentMessage.tsx]', '[handleMessage]:', message.action);
      if (!message.payload.tabId) {
        logger.warn('🫳💬', '[useContentMessage.tsx]', '[handleMessage]', 'Ignoring message: tabId is', message.payload.tabId);
        /** Respond to the content script */
        sendResponse({ success: false, error: new Error('tabId is required') });
        return true;
      }
      if (!message.payload.tabUrl) {
        logger.warn('🫳💬', '[useContentMessage.tsx]', '[handleMessage]', 'Ignoring message: tabUrl is', message.payload.tabUrl);
        /** Respond to the content script */
        sendResponse({ success: false, error: new Error('url is required') });
        return true;
      }

      switch (message.action) {
        case MessageAction.EXTRACT_ARTICLE: {
          const messages = EXTRACTION_MESSAGES[getExtractionKind(message.payload.tabUrl)];
          /* extractWithProgress never rejects: a failure comes back as isSuccess: false after its toast */
          extractWithProgress(() => extractionService.current.execute(message.payload.tabUrl), {
            showProgress: () => toast.loading(messages.progress, { group: EXTRACTION_TOAST_GROUP }),
            dismissProgress: (id: string) => toast.dismiss(id),
            showFailure: () => {
              toast.error(messages.failure, { group: EXTRACTION_TOAST_GROUP });
            },
          }).then((article: ArticleExtractionResult) => {
            /** Respond to the service worker */
            sendResponse({
              success: true,
              payload: {
                tabId: message.payload.tabId,
                tabUrl: message.payload.tabUrl,
                result: article,
              },
            });
          });
          break;
        }

        case MessageAction.INJECT_ARTICLE:
          try {
            const service = getAIServiceForUrl(message.payload.tabUrl);
            /*
             * Compare only the aismid parameter instead of the full URL: the tab URL may
             * carry a model parameter, and AI Studio rewrites model aliases in the URL,
             * so strict URL equality can no longer be used.
             */
            const tabAismid = new URL(message.payload.tabUrl).searchParams.get(AI_SERVICE_QUERY_KEY);
            if (tabAismid !== String(message.payload.article.id)) {
              logger.warn(
                '🫳💬',
                '[useContentMessage.tsx]',
                '[handleMessage]',
                'Skipping injection: aismid mismatch:',
                tabAismid,
                '!=',
                message.payload.article.id
              );
              sendResponse({ success: false, error: new Error('Invalid service URL') });
              return true;
            }

            /** Skip duplicate deliveries for an article already injected in this document */
            if (handledInjectionArticleIds.has(String(message.payload.article.id))) {
              logger.warn('🫳💬', '[useContentMessage.tsx]', '[handleMessage]', 'Skipping duplicate injection for article:', message.payload.article.id);
              sendResponse({ success: true });
              return true;
            }
            handledInjectionArticleIds.add(String(message.payload.article.id));

            /* Building the prompt and reading the model run inside, so that their failures get a toast too */
            injectWithProgress(
              async (onStage, onModelUnavailable) => {
                const prompt = await createPrompt(service, useSettingsStore.getState(), message.payload.article);
                /* Read the model via the async getter, which goes to chrome.storage: the store snapshot of the content script is taken before hydration */
                const model = await useSettingsStore.getState().getModelFor(service);
                return injectionService.current.execute(message.payload.tabUrl, prompt, { model, onStage, onModelUnavailable });
              },
              {
                loading: text => {
                  toast.loading(text, { group: INJECTION_TOAST_GROUP });
                },
                success: text => {
                  toast.success(text, { group: INJECTION_TOAST_GROUP });
                },
                error: text => {
                  toast.error(text, { group: INJECTION_TOAST_GROUP });
                },
                /* Outside the group, so that the next stage does not replace it */
                warning: text => {
                  toast.warning(text);
                },
              }
            ).then((result: ArticleInjectionResult) => {
              if (!result.success) logger.error('🫳💬', '[useContentMessage.tsx]', '[handleMessage]', 'Failed to inject article:', result.error);
              /** Respond to the service worker */
              sendResponse({ success: result.success, error: result.error });
            });
          } catch (error: any) {
            logger.error('🫳💬', '[useContentMessage.tsx]', '[handleMessage]', 'Failed to inject article:', error);
            sendResponse({ success: false, error: error instanceof Error ? error : new Error('Failed to inject article') });
          }
          break;

        case MessageAction.WRITE_ARTICLE_TO_CLIPBOARD:
          try {
            const text = message.payload.text;
            logger.debug('🫳💬', '[useContentMessage.tsx]', '[handleMessage]', 'text', text);

            /** Check if the text is valid */
            if (!text) throw new Error('text is required');

            /** Copy the text to the clipboard */
            copyToClipboard(text);

            toast.success('Article copied to clipboard');

            /** Respond to the content script */
            sendResponse({ success: true });
          } catch (error: any) {
            logger.error('🫳💬', '[useContentMessage.tsx]', '[handleMessage]', 'Failed to write article to clipboard:', error);

            /** Respond to the content script */
            sendResponse({ success: false, error: new Error('Failed to write article to clipboard') });
          }
          break;

        default:
          logger.debug('🫳💬', '[useContentMessage.tsx]', '[handleMessage]', 'Unknown message action:', message.action);

          /** Respond to the content script */
          sendResponse({ success: false, error: new Error('Unknown message action') });
          break;
      }
      return true;
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    isListenerRegistered.current = true;

    /* Ask for the article only now that INJECT_ARTICLE can be received */
    requestInjectionOnLoad(location.href);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      isListenerRegistered.current = false;
      logger.debug('🫳💬', '[useContentMessage.tsx]', '[useEffect]', 'useContentMessage unmounted');
    };
  }, []);
};
