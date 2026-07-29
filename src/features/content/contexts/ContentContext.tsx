import React, { createContext, useContext, useMemo } from 'react';

import { useContentMessage } from '@/features/content/hooks';
import { SettingsState } from '@/stores';
import { ArticleExtractionResult } from '@/types';

/**
 * The context value type for ContentContext.
 *
 * @property tabId - The tab id.
 * @property tabUrl - The tab url.
 * @property article - The article data.
 * @property settings - The settings data.
 */
interface ContentContextValue {
  currentTabId: number | null;
  currentTabUrl: string | null;
  currentArticle: ArticleExtractionResult | null;
  settings: SettingsState;
}

/**
 * The ContentContext.
 */
const ContentContext = createContext<ContentContextValue | null>(null);

/**
 * The props for the ContentContextProvider component.
 */
interface ContentContextProviderProps {
  /**
   * The children to render.
   */
  children: React.ReactNode;
}

/**
 * The ContentContextProvider component.
 *
 * @param children - The children to render.
 * @returns The ContentContextProvider component.
 */
export const ContentContextProvider: React.FC<ContentContextProviderProps> = ({ children }) => {
  /*******************************************************
   * State Management
   *******************************************************/

  const { currentTabId, currentTabUrl, currentArticle, settings } = useContentMessage();

  /*******************************************************
   * Exported Value
   *******************************************************/

  const value = useMemo(
    () => ({
      currentTabId,
      currentTabUrl,
      currentArticle,
      settings,
    }),
    [currentTabId, currentTabUrl, currentArticle, settings]
  );

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
};

/**
 * The useContentContext hook.
 *
 * @returns The ContentContext value.
 * @throws Error if used outside of ContentContextProvider.
 */
export const useContentContext = () => {
  const context = useContext(ContentContext);
  if (!context) {
    throw new Error('useContentContext must be used within an ContentContextProvider');
  }
  return context;
};
