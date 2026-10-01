import { GEMINI_SELECTORS } from '@/constants';
import { InjectOptions, noopModelUnavailableReporter, noopStageReporter } from '@/types';
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
 * Any failure is logged and swallowed so the injection itself still proceeds; a menu left
 * open is closed with Escape (verified live 2026-09-29), although it would not keep the prompt
 * from being pasted and sent.
 * Returns whether the model was selected.
 */
async function selectGeminiModel(model: string): Promise<boolean> {
  let isMenuOpen = false;
  try {
    const picker = await waitForElement(GEMINI_SELECTORS.modelPicker);
    if (!(picker instanceof HTMLElement)) throw new Error('Gemini mode picker not found');
    picker.click();
    isMenuOpen = true;

    /* Wait for the menu to render */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));

    const items = [...document.querySelectorAll(GEMINI_SELECTORS.modelOption)];
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
    return true;
  } catch (error: unknown) {
    logger.warn('📕', '[Gemini.tsx]', '[selectGeminiModel]', 'Model selection failed, continuing injection:', error);
    if (isMenuOpen) {
      const focused = document.activeElement ?? document.body;
      focused.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    }
    return false;
  }
}

export async function injectGemini(
  prompt: string,
  { model, onStage = noopStageReporter, onModelUnavailable = noopModelUnavailableReporter }: InjectOptions = {}
): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[Gemini.tsx]', '[injectGemini]', 'Injecting article into Gemini', prompt);

    /* Select the configured model first; failures are non-fatal */
    if (model) {
      onStage('selectingModel');
      if (!(await selectGeminiModel(model))) onModelUnavailable(model);
    }
    onStage('pasting');

    /** Wait for the editor to be found. Use a structural selector because the aria-label text changes with UI updates and locale */
    const editor = await waitForElement(GEMINI_SELECTORS.editor);
    if (!editor) throw new Error('Gemini container not found');
    logger.debug('📕', '[Gemini.tsx]', '[injectGemini]', 'Gemini editor found', editor);

    /** Inject the article into the editor */
    const p = editor.querySelector('p') || editor.appendChild(document.createElement('p'));
    p.textContent = prompt;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    onStage('sending');

    /** Wait for the submit button to be found */
    const submitButton = await waitForElement(GEMINI_SELECTORS.submit);
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
