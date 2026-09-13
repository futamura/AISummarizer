import { Platform } from '@/platform/types';
import { logger } from '@/utils';

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

/* Firefox for Android has no sidebar (sidebarAction is undefined); settings open in a tab there */
const hasSidebar = (): boolean => browser.sidebarAction !== undefined;

export const firefoxPlatform: Platform = {
  /* Not async: sidebarAction.open() is rejected unless it runs synchronously inside the user gesture */
  openSettingsPanel: () => (hasSidebar() ? browser.sidebarAction.open() : chrome.runtime.openOptionsPage()),

  closeSettingsPanel: async () => {
    if (hasSidebar()) return browser.sidebarAction.close();
    /* The options page runs in its own tab when there is no sidebar */
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
  },

  /**
   * Firefox background pages have a DOM, so matchMedia works here directly.
   * The offscreen flow (runtime.sendMessage to itself) has no receiver in Firefox and would retry forever.
   */
  initThemeDetection: async onColorSchemeChange => {
    const mediaQuery = globalThis.matchMedia(COLOR_SCHEME_QUERY);
    logger.debug('🧑‍🍳🎨', '[platform/firefox.ts]', '[initThemeDetection]', 'Initial media query state:', mediaQuery.matches);
    onColorSchemeChange(mediaQuery.matches);
    mediaQuery.addEventListener('change', event => onColorSchemeChange(event.matches));
  },
};
