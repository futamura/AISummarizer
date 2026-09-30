import { QWEN_SELECTORS } from '@/constants';
import { InjectOptions, noopModelUnavailableReporter, noopStageReporter } from '@/types';
import { getRandomInt, logger, waitForElement } from '@/utils';

/*
 * Select the model (Qwen3.7-Plus / Qwen3.8-Max / Qwen3.8-Omni-Flash) before injecting text.
 * These are the entries the menu lists both signed in and signed out; the older models behind the
 * signed-in "Expand more models" entry are not offered (verified live 2026-09-29).
 * The header trigger carries aria-label "Select Model" and the popup lists
 * div[role="option"] entries; module class names are hashed, so the picker is
 * located by aria-label and role instead (verified live 2026-08-08).
 * Any failure is logged and swallowed so the injection itself still proceeds. A picker left
 * open does not keep the prompt from being pasted and sent, and neither Escape nor an
 * outside click dispatched from script closes it, so it is left open (verified live 2026-09-29).
 * Returns whether the model was selected.
 */
async function selectQwenModel(model: string): Promise<boolean> {
  try {
    const trigger = await waitForElement(QWEN_SELECTORS.modelPicker);
    if (!(trigger instanceof HTMLElement)) throw new Error('Qwen model picker trigger not found');
    trigger.click();

    /* Wait for the picker popup to open */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));

    const target = [...document.querySelectorAll(QWEN_SELECTORS.modelOption)].find(el => el.textContent?.includes(model));
    if (!(target instanceof HTMLElement)) throw new Error(`Qwen model option not found: ${model}`);
    target.click();

    /* Wait for the model switch to settle */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));
    return true;
  } catch (error: unknown) {
    logger.warn('📕', '[Qwen.tsx]', '[selectQwenModel]', 'Model selection failed, continuing injection:', error);
    return false;
  }
}

export async function injectQwen(
  prompt: string,
  { model, onStage = noopStageReporter, onModelUnavailable = noopModelUnavailableReporter }: InjectOptions = {}
): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[Qwen.tsx]', '[injectQwen]', 'Injecting article into Qwen\n', prompt);
    onStage(model ? 'selectingModel' : 'pasting');

    /** Wait for 2 to 3 seconds to ensure page is fully loaded */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(2000, 3000)));

    /* Select the configured model first; failures are non-fatal */
    if (model) {
      if (!(await selectQwenModel(model))) onModelUnavailable(model);
      onStage('pasting');
    }

    /** Wait for the editor to be found. The chat box is the sole textarea on the page (verified live 2026-08-08) */
    const editor = await waitForElement(QWEN_SELECTORS.editor);
    if (!editor) throw new Error('Qwen container not found');
    logger.debug('📕', '[Qwen.tsx]', '[injectQwen]', 'Qwen editor found', editor);

    /** Set the value through the native setter so the framework value tracker registers the change */
    if (editor instanceof HTMLTextAreaElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!nativeSetter) throw new Error('Qwen native value setter not found');
      nativeSetter.call(editor, prompt);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      throw new Error('Qwen editor is not a textarea element');
    }
    onStage('sending');

    /** Wait for 1 to 1.5 seconds */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(1000, 1500)));

    /** Wait for the submit button to be found. The button replaces the voice-mode button once text is entered (verified live 2026-08-08) */
    const submitButton = await waitForElement(QWEN_SELECTORS.submit);
    if (!submitButton) throw new Error('Qwen submit button not found');
    logger.debug('📕', '[Qwen.tsx]', '[injectQwen]', 'Qwen submit button found', submitButton);

    /** Click the submit button */
    if (submitButton instanceof HTMLElement) {
      submitButton.click();
    } else {
      throw new Error('Qwen submit button not found');
    }

    return {
      success: true,
    };
  } catch (error: unknown) {
    logger.error('📕', '[Qwen.tsx]', '[injectQwen]', 'Failed to inject article into Qwen:', error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Failed to inject article into Qwen'),
    };
  }
}
