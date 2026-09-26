import { Platform } from '@/platform/types';
import { logger } from '@/utils';

const getActiveWindowId = async (): Promise<number | undefined> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.windowId;
};

export const chromePlatform: Platform = {
  openSettingsPanel: async (windowId?: number) => {
    /* Resolve the window only when none is given, so gesture-bound callers reach sidePanel.open() synchronously */
    const targetWindowId = windowId ?? (await getActiveWindowId());
    if (!targetWindowId) return;
    chrome.sidePanel.setOptions({ path: 'options.html', enabled: true });
    await chrome.sidePanel.open({ windowId: targetWindowId });
  },

  closeSettingsPanel: async () => {
    await chrome.sidePanel.setOptions({ enabled: false });
  },

  /* The offscreen document reports the scheme via COLOR_SCHEME_CHANGED messages, so the callback is not used here */
  initThemeDetection: async () => {
    /** Close existing document if it exists */
    if (await chrome.offscreen.hasDocument()) {
      await chrome.offscreen.closeDocument();
    }

    /** Create new document with error handling */
    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['MATCH_MEDIA' as chrome.offscreen.Reason],
        justification: 'Detect system color scheme changes',
      });
      logger.debug('🧑‍🍳🎨', '[platform/chrome.ts]', '[initThemeDetection]', 'Offscreen document created successfully');
    } catch (createError) {
      logger.error('🧑‍🍳🎨', '[platform/chrome.ts]', '[initThemeDetection]', 'Failed to create offscreen document', createError);
    }
  },

  /*
   * Blink turns each line feed into a paragraph break itself. insertHTML is no option here:
   * on chatgpt.com it took over 45 seconds for a 118,025-character article and lost characters
   */
  insertEditorText: text => {
    document.execCommand('insertText', false, text);
  },
};
