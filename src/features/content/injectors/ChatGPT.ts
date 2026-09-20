import { logger, waitForElement } from '@/utils';

/*
 * The logged-in composer exposes #composer-submit-button / data-testid="send-button";
 * the guest composer has neither and is only reachable via its aria-label, which stays
 * English regardless of browser locale (verified live 2026-08-13).
 */
const SUBMIT_SELECTOR = '#composer-submit-button, button[data-testid="send-button"], form button[aria-label="Send message"]';

/*
 * chatgpt.com refuses a prompt past a length of its own: the send button keeps its
 * aria-disabled and the article sits in the composer forever. Measured on chatgpt.com,
 * 2026-09-20: 124,889 characters still sent, 169,196 did not (Firefox for Android, and
 * the same text froze the desktop composer outright). The cap keeps a margin under the
 * length that was seen working
 */
export const MAX_PROMPT_CHARS = 120000;

/** The article is cut at the end, so the summary is told what it is missing */
const TRUNCATION_NOTICE = '\n\n[The article was too long for ChatGPT and is cut off here.]';

/**
 * Cut the prompt down to what chatgpt.com accepts
 * @param promptText - The prompt with the article in it
 * @returns The prompt, with a notice appended when it had to be cut
 */
export const truncateForChatGPT = (promptText: string): string => {
  if (promptText.length <= MAX_PROMPT_CHARS) return promptText;
  return promptText.slice(0, MAX_PROMPT_CHARS - TRUNCATION_NOTICE.length) + TRUNCATION_NOTICE;
};

/*
 * chatgpt.com marks the send button unusable with aria-disabled while it has not taken
 * the article in; the disabled property stays false, so a click lands on a dead button
 * and the message is never sent (verified on Firefox for Android, 2026-09-20)
 */
export const isSubmitEnabled = (button: Element | null): boolean => {
  if (!button) return false;
  if (button instanceof HTMLButtonElement && button.disabled) return false;
  return button.getAttribute('aria-disabled') !== 'true';
};

/**
 * Wait for the send button to be ready for a click
 * @param maxAttempts - The maximum number of attempts
 * @param intervalMs - The delay between attempts
 * @returns The button once it accepts a click, otherwise the last one found
 */
const waitForEnabledSubmit = async (maxAttempts = 20, intervalMs = 500): Promise<Element | null> => {
  let button: Element | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    button = document.querySelector(SUBMIT_SELECTOR);
    if (isSubmitEnabled(button)) return button;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return button;
};

export async function injectChatGPT(promptText: string): Promise<{ success: boolean; error?: Error }> {
  try {
    const prompt = truncateForChatGPT(promptText);
    logger.debug('📕', '[ChatGPT.tsx]', '[injectChatGPT]', 'Injecting article into ChatGPT', prompt.length, 'of', promptText.length, 'characters');

    /*
     * Wait for the editor to be found. The logged-in composer is a ProseMirror
     * contenteditable div (#prompt-textarea); the logged-out guest composer is a
     * plain React-controlled textarea (name="prompt", seen in incognito windows;
     * verified live 2026-08-13).
     */
    const editor = await waitForElement('#prompt-textarea, form textarea[name="prompt"]');
    if (!editor) throw new Error('ChatGPT container not found');
    logger.debug('📕', '[ChatGPT.tsx]', '[injectChatGPT]', 'ChatGPT editor found', editor);

    if (editor instanceof HTMLTextAreaElement) {
      /** Set the value through the native setter so the framework value tracker registers the change */
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!nativeSetter) throw new Error('ChatGPT native value setter not found');
      nativeSetter.call(editor, prompt);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      /*
       * Type the article in through execCommand so the ProseMirror state stays in sync.
       * Setting innerHTML fills the DOM but leaves the app state behind, and it dropped
       * characters on long articles (168,239 of 169,196 on Firefox for Android)
       */
      if (!(editor instanceof HTMLElement)) throw new Error('ChatGPT editor is not an HTML element');
      editor.focus();
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
      document.execCommand('insertText', false, prompt);
    }

    /** Wait for the submit button to accept a click */
    const submitButton = await waitForEnabledSubmit();
    if (!submitButton && !(editor instanceof HTMLElement)) throw new Error('ChatGPT submit button not found');
    logger.debug('📕', '[ChatGPT.tsx]', '[injectChatGPT]', 'ChatGPT submit button state', submitButton, isSubmitEnabled(submitButton));

    if (isSubmitEnabled(submitButton) && submitButton instanceof HTMLElement) {
      submitButton.click();
    } else if (editor instanceof HTMLElement) {
      /** Fall back to a synthetic Enter, handled by the composer keymap, the way the Claude injector does */
      logger.warn('📕', '[ChatGPT.tsx]', '[injectChatGPT]', 'Submit button unusable; sending Enter instead');
      editor.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        } as KeyboardEventInit)
      );
    } else {
      throw new Error('ChatGPT submit button not found');
    }

    return {
      success: true,
    };
  } catch (error: unknown) {
    logger.error('📕', '[ChatGPT.tsx]', '[injectChatGPT]', 'Failed to inject article into ChatGPT:', error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Failed to inject article into ChatGPT'),
    };
  }
}
