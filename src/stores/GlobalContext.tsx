import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { db } from '@/db';
import { ArticleModel } from '@/models';
import { SettingsState, useSettingsStore } from '@/stores';
import { AIService, ContentExtractionTiming, TabBehavior } from '@/types';
import { logger } from '@/utils';

/**
 * The context value type for GlobalContext.
 *
 * @see SettingsStore
 */
interface GlobalContextValue {
  isArticleExtracted: boolean;
  setIsArticleExtracted: (isArticleExtracted: boolean) => void;
  article: ArticleModel | null;
  setArticle: (article: ArticleModel | null) => void;
  /** Settings */
  updateSettings: (settings: Partial<SettingsState>) => Promise<void>;
  prompts: {
    [key in AIService]: string;
  };
  setPromptFor: (service: AIService, prompt: string) => Promise<void>;
  getPromptFor: (service: AIService) => Promise<string>;
  models: {
    [key in AIService]: string;
  };
  setModelFor: (service: AIService, model: string) => Promise<void>;
  getModelFor: (service: AIService) => Promise<string>;
  serviceOnMenu: {
    [key in AIService]: boolean;
  };
  setServiceOnMenu: (service: AIService, status: boolean) => Promise<void>;
  getServiceOnMenu: (service: AIService) => Promise<boolean>;
  tabBehavior: TabBehavior;
  setTabBehavior: (tabBehavior: TabBehavior) => Promise<void>;
  getTabBehavior: () => Promise<TabBehavior>;
  contentExtractionTiming: ContentExtractionTiming;
  setContentExtractionTiming: (contentExtractionTiming: ContentExtractionTiming) => Promise<void>;
  getContentExtractionTiming: () => Promise<ContentExtractionTiming>;
  extractionDenylist: string;
  setExtractionDenylist: (extractionDenylist: string) => Promise<void>;
  getExtractionDenylist: () => Promise<string>;
  saveArticleOnClipboard: boolean;
  setSaveArticleOnClipboard: (saveArticleOnClipboard: boolean) => Promise<void>;
  getSaveArticleOnClipboard: () => Promise<boolean>;
  isShowMessage: boolean;
  setIsShowMessage: (isShowMessage: boolean) => Promise<void>;
  getIsShowMessage: () => Promise<boolean>;
  isShowBadge: boolean;
  setIsShowBadge: (isShowBadge: boolean) => Promise<void>;
  getIsShowBadge: () => Promise<boolean>;
  exportSettings: () => Promise<{ success: boolean; error?: Error }>;
  importSettings: (file: File) => Promise<{ success: boolean; error?: Error }>;
  restoreSettings: () => Promise<{ success: boolean; error?: Error }>;
  resetDatabase: () => Promise<{ success: boolean; error?: Error }>;
}

/**
 * The GlobalContext.
 */
const GlobalContext = createContext<GlobalContextValue | null>(null);

/**
 * The props for the GlobalContextProvider component.
 */
interface GlobalContextProviderProps {
  /**
   * The children to render.
   */
  children: React.ReactNode;
}

/**
 * The GlobalContextProvider component.
 *
 * @param children - The children to render.
 * @returns The GlobalContextProvider component.
 */
export const GlobalContextProvider: React.FC<GlobalContextProviderProps> = ({ children }) => {
  /*******************************************************
   * State Management
   *******************************************************/

  const [isArticleExtracted, setIsArticleExtracted] = useState(false);
  const [article, setArticle] = useState<ArticleModel | null>(null);
  const settings = useSettingsStore();

  /**
   * Refs for managing component lifecycle and preventing stale closures
   */
  const isInitialized = useRef(false);
  const isSubscribed = useRef(false);

  /*******************************************************
   * Core Function
   *******************************************************/

  const resetDatabase = async (): Promise<{ success: boolean; error?: Error }> => {
    return await db.clearArticles();
  };

  /*******************************************************
   * Lifecycle
   *******************************************************/

  /**
   * Main effect for initializing extension management and setting up event listeners.
   * Implements a more robust cleanup mechanism.
   */
  useEffect(() => {
    /** Initialize extensions */
    const initialize = async () => {
      logger.debug('🗣️🌏', '[GlobalContextProvider.tsx]', '[useEffect]', 'Initializing GlobalContextProvider');
      try {
        /* Initialize stores in sequence */
        isInitialized.current = true;
      } catch (error) {
        logger.error('🗣️🌏', '[GlobalContextProvider.tsx]', '[useEffect]', 'Failed to initialize extensions', error);
      }
    };
    if (!isInitialized.current) initialize();

    /** Subscribe listeners */
    if (!isSubscribed.current) {
      logger.debug('🗣️🌏', '[GlobalContextProvider.tsx]', '[useEffect]', 'Subscribing listeners');
      isSubscribed.current = true;
    }

    /** Unsubscribe listeners */
    return () => {
      logger.debug('🗣️🌏', '[GlobalContextProvider.tsx]', '[useEffect]', 'Deinitializing GlobalContextProvider');
      isSubscribed.current = false;
    };
  }, []);

  /*******************************************************
   * Exported Value
   *******************************************************/

  const value = useMemo(
    () => ({
      isArticleExtracted,
      setIsArticleExtracted,
      article,
      setArticle,
      resetDatabase,
      ...settings,
    }),
    [isArticleExtracted, setIsArticleExtracted, article, setArticle, settings]
  );

  return <GlobalContext.Provider value={value}>{children}</GlobalContext.Provider>;
};

/**
 * The useGlobalContext hook.
 *
 * @returns The GlobalContext value.
 * @throws Error if used outside of GlobalContextProvider.
 */
export const useGlobalContext = () => {
  const context = useContext(GlobalContext);
  if (!context) {
    throw new Error('useGlobalContext must be used within an GlobalContextProvider');
  }
  return context;
};
