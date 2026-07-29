import { getRandomInt, logger, waitForElement } from '@/utils';

export async function injectAIStudio(prompt: string): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[AIStudio.tsx]', '[injectAIStudio]', 'Injecting article into AIStudio\n', prompt);

    /** Wait for 2 seconds to ensure page is fully loaded */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(2000, 3000)));

    /**
     * Set the thinking level to the lowest option if the control is present. The thinking toggle
     * was replaced by a "Thinking level" mat-select whose options are ordered lowest first.
     * Missing control is not fatal because availability depends on the selected model.
     */
    const thinkingSelect = await waitForElement('ms-thinking-level-setting mat-select', 3);
    if (thinkingSelect instanceof HTMLElement) {
      logger.debug('📕', '[AIStudio.tsx]', '[injectAIStudio]', 'AIStudio thinking level select found', thinkingSelect);
      thinkingSelect.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));
      const lowestOption = document.querySelector('mat-option');
      if (lowestOption instanceof HTMLElement) {
        lowestOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      } else {
        /** Close the dropdown overlay so it cannot block later clicks */
        const backdrop = document.querySelector('.cdk-overlay-backdrop');
        if (backdrop instanceof HTMLElement) {
          backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      }
      await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));
    }

    /**
     * Enable the url context tool if present. The auto-numbered mat-mdc-slide-toggle ids shifted,
     * so locate the toggle via its stable data-test-id wrapper. Missing toggle is not fatal.
     */
    const urlContextButton = await waitForElement('div[data-test-id="browseAsAToolTooltip"] button[role="switch"]', 3);
    if (urlContextButton instanceof HTMLElement) {
      logger.debug('📕', '[AIStudio.tsx]', '[injectAIStudio]', 'AIStudio url context button found', urlContextButton);
      const isUrlContextButtonChecked = urlContextButton.getAttribute('aria-checked') === 'true';
      if (!isUrlContextButtonChecked) {
        urlContextButton.click();
        /** Wait for 0.5 to 1 second after toggling */
        await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));
      }
    }

    /** Wait for the editor to be found. The ms-autosize-textarea wrapper was replaced by ms-prompt-box */
    const editor = await waitForElement('ms-prompt-box textarea');
    if (!editor) throw new Error('AIStudio container not found');
    logger.debug('📕', '[AIStudio.tsx]', '[injectAIStudio]', 'AIStudio editor found', editor);

    /** Set the value through the native setter and trigger an input event so Angular picks up the change */
    if (editor instanceof HTMLTextAreaElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!nativeSetter) throw new Error('AIStudio native value setter not found');
      nativeSetter.call(editor, prompt);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      throw new Error('AIStudio editor is not a textarea element');
    }

    /** Wait for 0.5 to 1 second */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));

    /** Wait for the submit button to be found. button.run-button was replaced by ms-run-button */
    const submitButton = await waitForElement('ms-run-button button');
    if (!submitButton) throw new Error('AIStudio submit button not found');
    logger.debug('📕', '[AIStudio.tsx]', '[injectAIStudio]', 'AIStudio submit button found', submitButton);

    /** Click the submit button */
    if (submitButton instanceof HTMLElement) {
      submitButton.click();
    } else {
      throw new Error('AIStudio submit button not found');
    }

    return {
      success: true,
    };
  } catch (error: unknown) {
    logger.error('📕', '[AIStudio.tsx]', '[injectAIStudio]', 'Failed to inject article into AIStudio:', error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Failed to inject article into AIStudio'),
    };
  }
}
