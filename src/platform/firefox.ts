import { Platform } from '@/platform/types';
import { logger } from '@/utils';

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

/* Escape the characters that would otherwise be read as markup */
const escapeHTML = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Turn text into one paragraph per line; an empty line keeps a <br> so it stays a paragraph of its own
 * @param text - The text to convert
 * @returns The paragraphs as HTML
 */
export const toParagraphsHTML = (text: string): string =>
  text
    .split(/\r?\n/)
    .map(line => (line ? `<p>${escapeHTML(line)}</p>` : '<p><br></p>'))
    .join('');

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

  /*
   * Gecko types a line feed into the editor as text, and ProseMirror reads it back as a space, so the
   * whole article became one paragraph. Paragraphs inserted as HTML keep the lines: measured on
   * Firefox for Android (2026-09-26), 118,025 characters went into chatgpt.com and claude.ai in
   * 33-53 ms without a character lost
   */
  insertEditorText: text => {
    document.execCommand('insertHTML', false, toParagraphsHTML(text));
  },
};
