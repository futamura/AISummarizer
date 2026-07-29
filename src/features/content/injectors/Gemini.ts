import { getRandomInt, logger, waitForElement } from '@/utils';

export async function injectGemini(prompt: string): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[Gemini.tsx]', '[injectGemini]', 'Injecting article into Gemini', prompt);

    /** Wait for 2 to 3 seconds */
    new Promise(resolve => setTimeout(resolve, getRandomInt(2000, 3000)));

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
