import { getRandomInt, logger, waitForElement } from '@/utils';

/*
 * Find the index of the mode menu item matching the configured model.
 * "Flash" must not match "Flash-Lite", so Flash requires the absence of "Flash-Lite".
 */
export const matchGeminiModelLabel = (itemTexts: string[], model: string): number => {
  if (!model) return -1;
  return itemTexts.findIndex(text => {
    if (model === 'Flash') return text.includes('Flash') && !text.includes('Flash-Lite');
    return text.includes(model);
  });
};

/*
 * Select the model via the mode picker before injecting text.
 * Selectors verified live on 2026-08-08: picker button under bard-mode-switcher,
 * menu items carry data-test-id="bard-mode-option-<hash>" (prefix is stable, hash is not).
 * Any failure is logged and swallowed so the injection itself still proceeds.
 */
async function selectGeminiModel(model: string): Promise<void> {
  try {
    const picker = await waitForElement('bard-mode-switcher button');
    if (!(picker instanceof HTMLElement)) throw new Error('Gemini mode picker not found');
    picker.click();

    /* Wait for the menu to render */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));

    const items = [...document.querySelectorAll('[data-test-id^="bard-mode-option"]')];
    const index = matchGeminiModelLabel(
      items.map(el => el.textContent ?? ''),
      model
    );
    if (index < 0) throw new Error(`Gemini mode option not found for model: ${model}`);

    const item = items[index];
    if (!(item instanceof HTMLElement)) throw new Error('Gemini mode option is not an HTML element');
    item.click();

    /* Wait for the menu to close */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));
  } catch (error: unknown) {
    logger.warn('📕', '[Gemini.tsx]', '[selectGeminiModel]', 'Model selection failed, continuing injection:', error);
  }
}

export async function injectGemini(prompt: string, model?: string): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[Gemini.tsx]', '[injectGemini]', 'Injecting article into Gemini', prompt);

    /** Wait for 2 to 3 seconds */
    new Promise(resolve => setTimeout(resolve, getRandomInt(2000, 3000)));

    /* Select the configured model first; failures are non-fatal */
    if (model) await selectGeminiModel(model);

    /** Wait for the editor to be found. Use a structural selector because the aria-label text changes with UI updates and locale */
    const editor = await waitForElement('rich-textarea div.ql-editor[contenteditable="true"]');
    if (!editor) throw new Error('Gemini container not found');
    logger.debug('📕', '[Gemini.tsx]', '[injectGemini]', 'Gemini editor found', editor);

    /** Wait for 0.5 to 1 second */
    new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));

    /** Inject the article into the editor */
    const p = editor.querySelector('p') || editor.appendChild(document.createElement('p'));
    p.textContent = prompt;
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    /** Wait for 0.5 to 1 second */
    new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));

    /** Wait for the submit button to be found */
    const submitButton = await waitForElement('button[aria-label="Send message"]');
    if (!submitButton) throw new Error('Gemini submit button not found');
    logger.debug('📕', '[Gemini.tsx]', '[injectGemini]', 'Gemini submit button found', submitButton);

    /** Click the submit button */
    if (submitButton instanceof HTMLElement) {
      submitButton.click();
    } else {
      throw new Error('Gemini submit button not found');
    }

    return {
      success: true,
    };
  } catch (error: unknown) {
    logger.error('📕', '[Gemini.tsx]', '[injectGemini]', 'Failed to inject article into Gemini:', error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Failed to inject article into Gemini'),
    };
  }
}
