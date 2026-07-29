import { getRandomInt, logger, waitForElement } from '@/utils';

export async function injectDeepSeek(prompt: string): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[DeepSeek.tsx]', '[injectDeepSeek]', 'Injecting article into DeepSeek\n', prompt);

    /** Wait for 2 seconds to ensure page is fully loaded */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(2000, 3000)));

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
