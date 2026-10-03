import { STORAGE_KEYS } from '@/constants';
import { ArticleRecord, db } from '@/db';
import type { ToastType } from '@/features/content/services/ToastQueue';
import { CleanupDBService, ContextMenuService, ServiceWorkerThemeService } from '@/features/serviceworker/services';
import { MENU_ITEMS } from '@/models';
import { openSettingsPanel } from '@/platform';
import { useSettingsStore } from '@/stores';
import { DEFAULT_SETTINGS } from '@/stores/SettingsStore';
import {
  AI_SERVICE_QUERY_KEY,
  AIService,
  ArticleExtractionResult,
  formatArticleForClipboard,
  getAIServiceFromString,
  getSummarizeUrl,
  isPrivateTabSupported,
  Message,
  MessageAction,
  MessageResponse,
  TabBehavior,
} from '@/types';
import { getDesktopYoutubeUrl, isAIServiceUrl, isInvalidUrl, logger } from '@/utils';

/** The AI service to open once the transcript of a mobile YouTube video is extracted in the desktop layout */
interface PendingAIService {
  service: AIService;
  url: string;
}

const getPendingAIServiceKey = (tabId: number): string => `pending-ai-service-${tabId}`;

declare global {
  /* Test hook of development builds and of dist/prod-e2e, defined in ServiceWorker.initialize() */
  var __aiSummarizerE2E:
    | {
        clickContextMenu: (menuItemId: string, tabId: number) => Promise<void>;
        showToast: (tabId: number, type: ToastType, text: string) => Promise<void>;
      }
    | undefined;
}

class ServiceWorker {
  themeService = new ServiceWorkerThemeService();
  contextMenuService = new ContextMenuService(this.handleContextMenuClicked.bind(this));
  cleanupService = new CleanupDBService();

  isInitialized = false;

  constructor() {
    this.initialize();
  }

  async initialize() {
    if (this.isInitialized) return;
    logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[initialize]', '▶️', 'ServiceWorker: Initializing');

    /** Remove the event listeners */
    chrome.tabs.onActivated.removeListener(this.handleTabActivated.bind(this));
    chrome.tabs.onActivated.addListener(this.handleTabActivated.bind(this));

    chrome.tabs.onUpdated.removeListener(this.handleTabUpdated.bind(this));
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));

    /** Add the event listeners */
    chrome.runtime.onMessage.removeListener(this.handleServiceWorkerMessage.bind(this));
    chrome.runtime.onMessage.addListener(this.handleServiceWorkerMessage.bind(this));

    this.themeService.initialize();
    this.cleanupService.startCleanup();

    /*
     * Test hooks: no test tool can click a native context menu (e2e/context-menu.spec.ts), and the visual
     * tests need toasts that hold still (e2e/visual/). Kept inline: other production builds drop this
     * whole block, while a method would stay in the bundle
     */
    if (process.env.NODE_ENV === 'development' || __E2E_HOOKS__) {
      globalThis.__aiSummarizerE2E = {
        clickContextMenu: async (menuItemId: string, tabId: number) =>
          this.handleContextMenuClicked({ menuItemId, editable: false }, await chrome.tabs.get(tabId)),
        showToast: async (tabId: number, type: ToastType, text: string) => {
          const tab = await chrome.tabs.get(tabId);
          await chrome.tabs.sendMessage(tabId, { action: MessageAction.E2E_SHOW_TOAST, payload: { tabId, tabUrl: tab.url, type, text } });
        },
      };
    }

    this.isInitialized = true;
    logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[initialize]', '✅️', 'ServiceWorker: Initialized');
  }

  /**************************************************
   * Event listeners
   **************************************************/

  /**
   * Event listener for when the tab is activated
   * @description This event is triggered when the tab is focused
   * @param activeInfo - The information about the activated tab
   */
  async handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo) {
    logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[handleTabActivated]', activeInfo);

    /** Check if the tab exists before proceeding */
    if (!(await chrome.tabs.get(activeInfo.tabId).catch(() => null))) {
      logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[handleTabActivated]', 'Tab not found:', activeInfo.tabId);
      return;
    }

    /** Get the active tab */
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id || !tab.url) {
      logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[handleTabActivated]', 'No active tab found');
      return;
    }

    /** Update the UI state */
    this.toggleUIState(activeInfo.tabId, tab.url);
  }

  /**
   * Event listener for when the tab is updated
   * @description This event is triggered when the tab is newly created, url updated or reloaded
   * @param tabId - The ID of the updated tab
   * @param changeInfo - The information about the updated tab
   * @param tab - The updated tab
   */
  async handleTabUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) {
    if (changeInfo.status !== 'complete' || !tab.url) return;
    logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[handleTabUpdated]', tab.url, tab.status);

    /** Check if the tab exists before proceeding */
    if (!(await chrome.tabs.get(tabId).catch(() => null))) {
      logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[handleTabUpdated]', 'Tab not found:', tabId);
      return;
    }

    /** Update the UI state */
    this.toggleUIState(tabId, tab.url);

    /** Inject the article into an AI service tab, or resume a mobile YouTube summary held for this page */
    if (isAIServiceUrl(tab.url)) {
      this.executeInjection(tabId, tab.url);
    } else {
      this.openPendingAIService(tabId, tab.url);
    }
  }

  /**
   * Event listener for when the message is sent from the content script
   * @param message - The message sent from the content script
   * @param sender - The sender of the message
   * @param sendResponse - The response to the message
   */
  async handleServiceWorkerMessage(message: Message, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[handleServiceWorkerMessage]', message.action);
    switch (message.action) {
      case MessageAction.OPEN_AI_SERVICE:
        this.openAIService(message.payload.service, message.payload.tabId, message.payload.tabUrl);
        break;

      case MessageAction.READ_ARTICLE_FOR_CLIPBOARD:
        /* Not awaited: Firefox answers the popup only when this listener settles, and the popup waits for that answer before closing */
        this.readArticleForClipboard(message.payload.tabId, message.payload.tabUrl);
        break;

      case MessageAction.REQUEST_INJECTION:
        /* Firefox can fire the 'complete' tab update before the content script listens, so the content script asks again once it does */
        if (sender.tab?.id && sender.tab.url) this.executeInjection(sender.tab.id, sender.tab.url);
        break;

      case MessageAction.OPEN_SETTINGS:
        chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
          /** Check if the tab exists before proceeding */
          if (!(await chrome.tabs.get(tab.id ?? 0).catch(() => null))) {
            logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[handleServiceWorkerMessage]', 'Tab not found:', sender.tab?.id);
            return;
          }
          if (tab.id && tab.windowId) {
            openSettingsPanel(tab.windowId).catch(error =>
              logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[handleServiceWorkerMessage]', 'Failed to open settings panel:', error)
            );
          }
        });
        break;

      default:
        break;
    }
  }

  /**
   * Event listener for when the context menu is clicked
   *
   * @param info - The information about the clicked context menu
   * @param tab - The tab that the context menu was clicked on
   */
  private async handleContextMenuClicked(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
    /**
     * openSettingsPanel() must be called before any await in this handler,
     * otherwise the user gesture context is lost and the call is rejected
     */
    if (info.menuItemId === MENU_ITEMS.SETTINGS.id) {
      if (tab?.windowId)
        openSettingsPanel(tab.windowId).catch(error =>
          logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[handleContextMenuClicked]', 'Failed to open settings panel:', error)
        );
      return;
    }

    if (!tab?.id || !tab?.url) {
      logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[handleContextMenuClicked]', 'No active tab found');
      return;
    }

    /** Check if the tab exists before proceeding */
    if (!(await chrome.tabs.get(tab.id).catch(() => null))) {
      logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[handleContextMenuClicked]', 'Tab not found:', tab.id);
      return;
    }

    logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[handleContextMenuClicked]', info);

    /* Every AI service on the menu opens here, so a service added to MENU_ITEMS needs no change in this handler */
    if (MENU_ITEMS.AI_SERVICES.some(service => service.id === info.menuItemId)) {
      this.openAIService(getAIServiceFromString(String(info.menuItemId)), tab.id, tab.url);
    } else if (info.menuItemId === MENU_ITEMS.COPY.id) {
      this.readArticleForClipboard(tab.id, tab.url);
    }
  }

  /**************************************************
   * Functions
   **************************************************/

  /**
   * Ask the content script to extract the page, and store the result
   * @param tabId - The ID of the tab
   * @param tabUrl - The URL of the tab
   * @returns The ID of the stored article, or null when the extraction failed
   */
  async extractAndStore(tabId: number, tabUrl: string): Promise<string | null> {
    logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[extractAndStore]', 'tabId:', tabId, 'tabUrl:', tabUrl);
    try {
      const response: MessageResponse | undefined = await chrome.tabs.sendMessage(tabId, {
        action: MessageAction.EXTRACT_ARTICLE,
        payload: { tabId: tabId, tabUrl: tabUrl },
      });
      const result: ArticleExtractionResult | undefined = response?.payload?.result;
      if (!response?.success || !result?.isSuccess) {
        /* The content script has already shown the failure toast */
        logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[extractAndStore]', 'Extraction failed:', tabUrl, result?.error);
        return null;
      }
      return await db.addArticle({
        url: result.url ?? tabUrl,
        title: result.title,
        content: result.content,
        date: new Date(),
        is_success: true,
      });
    } catch (error: unknown) {
      /* No content script in the tab, e.g. a page open before the extension was installed or updated: nothing can show a toast there */
      logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[extractAndStore]', 'Failed to extract the page:', tabUrl, error);
      return null;
    }
  }

  /**
   * Open the AI service that openAIService put on hold while the tab reloads a mobile YouTube video
   * in the desktop layout. The hold is kept in storage.session because the background page of
   * Firefox is an event page, which may be unloaded during the reload
   * @param tabId - The ID of the tab
   * @param tabUrl - The URL of the loaded page
   */
  async openPendingAIService(tabId: number, tabUrl: string) {
    try {
      const key = getPendingAIServiceKey(tabId);
      const pending: PendingAIService | undefined = (await chrome.storage.session.get(key))[key];
      if (!pending || pending.url !== tabUrl) return;

      /** Release the hold before extracting, so that a failed extraction is not retried on the next load */
      await chrome.storage.session.remove(key);
      await this.openAIService(pending.service, tabId, tabUrl);
    } catch (error: any) {
      logger.error('🧑‍🍳📃', '[ServiceWorker.ts]', '[openPendingAIService]', 'Failed to open the pending AI service:', error);
    }
  }

  /**
   * Open the AI service
   * @param service - The AI service to open
   * @param tabId - The ID of the tab
   * @param tabUrl - The URL of the tab
   * @returns Whether the AI service was opened successfully
   */
  async openAIService(service: AIService, tabId: number, tabUrl: string): Promise<boolean> {
    try {
      logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[openAIService]', service, tabId, tabUrl);

      /** Check if the tab exists before proceeding */
      if (!(await chrome.tabs.get(tabId).catch(() => null))) {
        logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[openAIService]', 'Tab not found:', tabId);
        return false;
      }

      /**
       * The mobile YouTube layout has no transcript panel: reload the video in the desktop layout
       * and open the AI service once the transcript is extracted there (see openPendingAIService)
       */
      const desktopYoutubeUrl = getDesktopYoutubeUrl(tabUrl);
      if (desktopYoutubeUrl) {
        const pending: PendingAIService = { service, url: desktopYoutubeUrl };
        await chrome.storage.session.set({ [getPendingAIServiceKey(tabId)]: pending });
        await chrome.tabs.update(tabId, { url: desktopYoutubeUrl });
        return true;
      }

      /** Extract the page now, so that content rendered after the load event is included */
      const articleId = await this.extractAndStore(tabId, tabUrl);
      if (!articleId) return false;
      const settings = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      const tabBehavior = settings[STORAGE_KEYS.SETTINGS]?.state?.tabBehavior ?? DEFAULT_SETTINGS.tabBehavior;
      const model = await useSettingsStore.getState().getModelFor(service);
      const summarizeUrl = getSummarizeUrl(service, articleId, model);
      switch (tabBehavior) {
        case TabBehavior.CURRENT_TAB:
          await chrome.tabs.update(tabId, { url: summarizeUrl });
          break;

        case TabBehavior.NEW_TAB:
          await chrome.tabs.create({ url: summarizeUrl });
          break;

        case TabBehavior.NEW_PRIVATE_TAB:
          /* Firefox for Android has no windows API, so the summary opens in an ordinary tab there */
          if (!isPrivateTabSupported()) {
            logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[openAIService]', 'Private tabs are unavailable; opening an ordinary tab instead');
            await chrome.tabs.create({ url: summarizeUrl });
            break;
          }

          const windows = await chrome.windows.getAll({ populate: true });
          const incognitoWindow = windows.find(w => w.incognito);
          if (incognitoWindow) {
            await chrome.tabs.create({ windowId: incognitoWindow.id, url: summarizeUrl });
          } else {
            await chrome.windows.create({ url: summarizeUrl, incognito: true });
          }
          break;

        default:
          break;
      }

      return true;
    } catch (error) {
      logger.error('🧑‍🍳📃', '[ServiceWorker.ts]', '[openAIService]', 'Failed to execute summarization:', error);
      return false;
    }
  }

  /**
   * Execute the extraction
   * @param tabId - The ID of the tab
   * @param tabUrl - The URL of the tab
   * @returns The article record
   */
  async executeInjection(tabId: number, tabUrl: string) {
    logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[executeInjection]', 'tabId:', tabId, 'tabUrl:', tabUrl);
    try {
      /** Check if the tab exists before proceeding */
      if (!(await chrome.tabs.get(tabId).catch(() => null))) {
        logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[executeInjection]', 'Tab not found:', tabId);
        return;
      }

      /** If the URL is an AI service URL, manipulate the web page to inject article */
      if (!isAIServiceUrl(tabUrl)) return;

      const params = new URL(tabUrl).searchParams;
      const articleId = params.get(AI_SERVICE_QUERY_KEY);

      /** If the article ID is not found, return */
      if (!articleId) return;

      /** Get the article from the database */
      const article = await db.getArticleById(articleId);
      if (!article) return;
      logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[executeInjection]', 'article:', article);
      await chrome.tabs
        .sendMessage(tabId, {
          action: MessageAction.INJECT_ARTICLE,
          payload: { tabId: tabId, tabUrl: tabUrl, article: article },
        })
        .then(response => {
          logger.debug('🧑‍🍳📃🔵', '[ServiceWorker.ts]', '[executeInjection]', 'response:', response);
        })
        .catch(error => {
          logger.warn('🧑‍🍳📃🔴', '[ServiceWorker.ts]', '[executeInjection]', 'Failed to send message to content script:', error);
        });
      /** Insert the article into the web page */
    } catch (error: any) {
      logger.error('🧑‍🍳📃', '[ServiceWorker.ts]', '[executeInjection]', 'Failed to execute summarization:', error);
    }
  }

  /**
   * Update the context menu for the tab
   * @param tabId - The ID of the tab
   * @param tabUrl - The URL of the tab
   */
  async toggleUIState(tabId: number, tabUrl?: string) {
    try {
      logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[toggleUIState]');

      /** Check if the tab exists before proceeding */
      if (!(await chrome.tabs.get(tabId).catch(() => null))) {
        logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[toggleUIState]', 'Tab not found:', tabId);
        return;
      }

      /** Rebuild the context menu, whose items depend on the URL */
      await this.contextMenuService.createMenu(tabUrl);
    } catch (error: any) {
      logger.error('🧑‍🍳📃', '[ServiceWorker.ts]', '[toggleUIState]', 'Failed to create context menu:', error);
    }
  }

  /**
   * Extract the page and write it to the clipboard with the clipboard prompt
   * @param tabId - The ID of the tab
   * @param tabUrl - The URL of the tab
   * @returns Whether the article was sent to the content script for writing
   */
  async readArticleForClipboard(tabId: number, tabUrl: string): Promise<boolean> {
    logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[readArticleForClipboard]', 'tabId:', tabId, 'tabUrl:', tabUrl);
    try {
      /** Check if the tab exists before proceeding */
      if (!(await chrome.tabs.get(tabId).catch(() => null))) {
        logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[readArticleForClipboard]', 'Tab not found:', tabId);
        return false;
      }

      const articleId = await this.extractAndStore(tabId, tabUrl);
      if (!articleId) return false;
      const article: ArticleRecord | undefined = await db.getArticleById(articleId);
      if (!article) {
        logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[readArticleForClipboard]', 'Stored article not found:', articleId);
        return false;
      }

      /** Copy the article to the clipboard */
      const prompt = await useSettingsStore.getState().getClipboardPrompt();
      const text = formatArticleForClipboard(article, prompt);
      await chrome.tabs
        .sendMessage(tabId, {
          action: MessageAction.WRITE_ARTICLE_TO_CLIPBOARD,
          payload: { tabId: tabId, tabUrl: tabUrl, text: text },
        })
        .then(response => {
          logger.debug('🧑‍🍳📃🔵', '[ServiceWorker.ts]', '[readArticleForClipboard]', 'response:', response);
        })
        .catch(error => {
          logger.warn('🧑‍🍳📃🔴', '[ServiceWorker.ts]', '[readArticleForClipboard]', 'Failed to send message to content script:', error);
        });
      return true;
    } catch (error: any) {
      logger.error('🧑‍🍳📃', '[ServiceWorker.ts]', '[readArticleForClipboard]', 'Failed to read article for clipboard:', error);
      return false;
    }
  }
}

new ServiceWorker();
