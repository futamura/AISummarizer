import { getRandomInt, logger, waitForElement } from '@/utils';

export async function injectPerplexity(prompt: string): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[Perplexity.tsx]', '[injectPerplexity]', 'Injecting article into Perplexity\n', prompt);

    /** Wait for 1 to 1.5 seconds to ensure the Lexical editor is interactive */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(1000, 1500)));

    /** Wait for the editor to be found */
    const editor = await waitForElement('#ask-input');
    if (!editor) throw new Error('Perplexity container not found');
    logger.debug('📕', '[Perplexity.tsx]', '[injectPerplexity]', 'Perplexity editor found', editor);

    /**
     * Perplexity replaced its textarea with a Lexical contenteditable.
     * Inject via a synthetic paste event: Lexical inserts the whole text in a
     * single transaction (line-by-line execCommand insertText is far slower),
     * replacing the selected current content and preserving line breaks.
     */
    if (!(editor instanceof HTMLElement)) throw new Error('Perplexity editor is not an HTML element');
    editor.focus();
    window.getSelection()?.selectAllChildren(editor);
    await new Promise(resolve => setTimeout(resolve, 300));
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', prompt);
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true }));

    /** Wait for 1 to 1.5 seconds */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(1000, 1500)));

    /** Wait for the submit button to be found */
    const submitButton = await waitForElement('button[aria-label="Submit"]');
    if (!submitButton) throw new Error('Perplexity submit button not found');
    logger.debug('📕', '[Perplexity.tsx]', '[injectPerplexity]', 'Perplexity submit button found', submitButton);

    /** Click the submit button */
    if (submitButton instanceof HTMLElement) {
      submitButton.click();
    } else {
      throw new Error('Perplexity submit button not found');
    }

    return {
      success: true,
    };
  } catch (error: unknown) {
    logger.error('📕', '[Perplexity.tsx]', '[injectPerplexity]', 'Failed to inject article into Perplexity:', error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Failed to inject article into Perplexity'),
    };
  }
}
