import { useEffect, useRef, useState } from 'react';

import { toast } from '@/features/content/components/main';
import { ArticleExtractionService, ArticleInjectionService } from '@/features/content/services';
import { useSettingsStore } from '@/stores';
import { AI_SERVICE_QUERY_KEY, ArticleExtractionResult, ArticleInjectionResult, getAIServiceForUrl, Message, MessageAction, MessageResponse } from '@/types';
import { copyToClipboard, createPrompt, logger } from '@/utils';

/*
 * Article ids already injected in this document. The service worker can deliver
 * INJECT_ARTICLE more than once for the same article because tabs.onUpdated fires
 * 'complete' repeatedly while the aismid URL is still current during the AI
 * service's SPA boot; a second run would re-select the model and re-fill the
 * editor after the first send (observed live on Kimi 2026-08-09). Module scope
 * makes the guard survive re-renders; a real page reload starts a fresh document
 * and legitimately allows injecting again.
 */
const handledInjectionArticleIds = new Set<string>();

/**
 * Hook for handling Chrome extension messages
 */
export const useContentMessage = () => {
  /*******************************************************
   * State Management
   *******************************************************/

  const extractionService = useRef(new ArticleExtractionService());
  const injectionService = useRef(new ArticleInjectionService());
  const isListenerRegistered = useRef(false);

  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [currentTabUrl, setCurrentTabUrl] = useState<string | null>(null);
  const [currentArticle, setCurrentArticle] = useState<ArticleExtractionResult | null>(null);
  const [settings, setSettings] = useState(useSettingsStore.getState());

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
        case MessageAction.TAB_UPDATED:
          try {
            /** Update the current tab state */
            setCurrentTabId(message.payload.tabId);
            setCurrentTabUrl(message.payload.tabUrl);
            if (message.payload.article) {
              setCurrentArticle({
                isSuccess: message.payload.article.is_success,
                title: message.payload.article.title ?? null,
                url: message.payload.article.url,
                content: message.payload.article.content ?? null,
                error: message.payload.article.error ?? null,
              });
            } else {
              setCurrentArticle(null);
            }

            /** Respond to the content script */
            sendResponse({ success: true });
          } catch (error) {
            logger.error('🫳💬', '[useContentMessage.tsx]', '[handleMessage]', 'Failed to update tab:', error);

            /** Respond to the content script */
            sendResponse({ success: false, error: new Error('Failed to update tab') });
          }
          break;

        case MessageAction.EXTRACT_ARTICLE:
          try {
            extractionService.current.execute(message.payload.tabUrl).then((article: ArticleExtractionResult) => {
              /** Update the current tab state */
              setCurrentTabId(message.payload.tabId);
              setCurrentTabUrl(message.payload.tabUrl);
              setCurrentArticle(article);

              /** Respond to the content script */
              sendResponse({
                success: true,
                payload: {
                  tabId: message.payload.tabId,
                  tabUrl: message.payload.tabUrl,
                  result: article,
                },
              });
              if (article?.isSuccess && settings.isShowMessage) {
                toast.success('Article extracted successfully');
              }
            });
          } catch (error: any) {
            logger.error('🫳💬', '[useContentMessage.tsx]', '[handleMessage]', 'Failed to extract article:', error);

            /** Update the current tab state */
            setCurrentArticle(null);

            /** Respond to the content script */
            sendResponse({ success: false, error: new Error(error.message) });
          }
          break;

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

            createPrompt(service, settings, message.payload.article)
              .then(async prompt => {
                /*
                 * Read the model via the async getter rather than the settings snapshot:
                 * settings is captured at first render, before chrome.storage hydration
                 * completes, so settings.models would always be the empty-string default.
                 */
                const model = await settings.getModelFor(service);
                injectionService.current.execute(message.payload.tabUrl, prompt, model).then((result: ArticleInjectionResult) => {
                  /** Respond to the content script */
                  sendResponse({ success: result.success, error: result.error });
                });
              })
              .catch(error => {
                logger.error('🫳💬', '[useContentMessage.tsx]', '[handleMessage]', 'Failed to get prompt:', error);
                sendResponse({ success: false, error: new Error('Failed to get prompt') });
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

        case MessageAction.SETTINGS_UPDATED:
          setSettings(message.payload);

          /** Respond to the content script */
          sendResponse({ success: true });
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

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      isListenerRegistered.current = false;
      logger.debug('🫳💬', '[useContentMessage.tsx]', '[useEffect]', 'useContentMessage unmounted');
    };
  }, []);

  return { currentArticle, currentTabId, currentTabUrl, settings };
};
