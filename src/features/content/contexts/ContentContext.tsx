import React, { createContext, useContext, useMemo } from 'react';

import { useContentMessage } from '@/features/content/hooks';
import { SettingsState, useSettingsStore } from '@/stores';

/**
 * The context value type for ContentContext.
 *
 * @property settings - The settings data.
 */
interface ContentContextValue {
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

  /* Registers the message listener of the content script */
  useContentMessage();
  /*
   * Expose the live store rather than a snapshot copy kept in React state: the content
   * script receives no settings updates, so a copy would freeze at the pre-hydration
   * defaults. Consumers must read values through the async getters, which go to
   * chrome.storage.
   */
  const settings = useSettingsStore.getState();

  /*******************************************************
   * Exported Value
   *******************************************************/

  const value = useMemo(() => ({ settings }), [settings]);

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
