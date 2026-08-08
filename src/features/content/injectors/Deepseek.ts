import { getRandomInt, logger, waitForElement } from '@/utils';

/*
 * Select the model tab (Instant / Expert / Vision) before injecting text.
 * The tab labels are English regardless of locale (verified 2026-08-08); class names
 * are hashed, so the tab is located by role instead.
 * Any failure is logged and swallowed so the injection itself still proceeds.
 */
async function selectDeepSeekModel(model: string): Promise<void> {
  try {
    /*
     * The model switch is a radiogroup above the chat input (verified live 2026-08-08):
     * div[role="radio"] elements whose text contains the label (Instant / Expert / Vision),
     * with aria-checked reflecting the current selection. Scoping to role="radio" avoids
     * clicking unrelated elements that merely contain the same text.
     */
    const target = [...document.querySelectorAll('[role="radio"]')].find(el => el.textContent?.includes(model));
    if (!(target instanceof HTMLElement)) throw new Error(`DeepSeek model tab not found: ${model}`);
    target.click();

    /* Wait for the tab switch to settle */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));
  } catch (error: unknown) {
    logger.warn('📕', '[DeepSeek.tsx]', '[selectDeepSeekModel]', 'Model selection failed, continuing injection:', error);
  }
}

export async function injectDeepSeek(prompt: string, model?: string): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[DeepSeek.tsx]', '[injectDeepSeek]', 'Injecting article into DeepSeek\n', prompt);

    /** Wait for 2 seconds to ensure page is fully loaded */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(2000, 3000)));

    /* Select the configured model first; failures are non-fatal */
    if (model) await selectDeepSeekModel(model);

    /** Wait for the editor to be found. DeepSeek removed the #chat-input id; the chat box is now the sole textarea on the page */
    const editor = await waitForElement('#chat-input, textarea');
    if (!editor) throw new Error('DeepSeek container not found');
    logger.debug('📕', '[DeepSeek.tsx]', '[injectDeepSeek]', 'DeepSeek editor found', editor);

    /** Set the value through the native setter so the React value tracker registers the change */
    if (editor instanceof HTMLTextAreaElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!nativeSetter) throw new Error('DeepSeek native value setter not found');
      nativeSetter.call(editor, prompt);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      throw new Error('DeepSeek editor is not a textarea element');
    }

    /** Wait for 1 to 1.5 seconds */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(1000, 1500)));

    /** Wait for the submit button to be found. Disabled state is now expressed via the ds-button--disabled class */
    const submitButton = await waitForElement('div[role="button"].ds-button--primary.ds-button--filled.ds-button--circle:not(.ds-button--disabled)');
    if (!submitButton) throw new Error('DeepSeek submit button not found');
    logger.debug('📕', '[DeepSeek.tsx]', '[injectDeepSeek]', 'DeepSeek submit button found', submitButton);

    /** Click the submit button */
    if (submitButton instanceof HTMLElement) {
      submitButton.click();
    } else {
      throw new Error('DeepSeek submit button not found');
    }

    return {
      success: true,
    };
  } catch (error: unknown) {
    logger.error('📕', '[DeepSeek.tsx]', '[injectDeepSeek]', 'Failed to inject article into DeepSeek:', error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Failed to inject article into DeepSeek'),
    };
  }
}
