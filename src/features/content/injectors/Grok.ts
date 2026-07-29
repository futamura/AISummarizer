import { getRandomInt, logger, waitForElement } from '@/utils';

export async function injectGrok(prompt: string): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[Grok.tsx]', '[injectGrok]', 'Injecting article into Grok', prompt);

    /** Wait for 2 to 3 seconds */
    new Promise(resolve => setTimeout(resolve, getRandomInt(2000, 3000)));

    /** Wait for the editor to be found. Grok replaced its textarea with a Tiptap (ProseMirror) contenteditable */
    const editor = await waitForElement('div.tiptap.ProseMirror[contenteditable="true"]');
    if (!editor) throw new Error('Grok container not found');
    logger.debug('📕', '[Grok.tsx]', '[injectGrok]', 'Grok editor found', editor);

    /** Inject the article via execCommand so the Tiptap state stays in sync */
    if (!(editor instanceof HTMLElement)) throw new Error('Grok editor is not an HTML element');
    editor.focus();
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
    document.execCommand('insertText', false, prompt);

    /** Wait for 1 to 1.5 seconds */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(1000, 1500)));

    /** Wait for the submit button to be found */
    const submitButton = await waitForElement('button[aria-label="Submit"]');
    if (!submitButton) throw new Error('Grok submit button not found');
    logger.debug('📕', '[Grok.tsx]', '[injectGrok]', 'Grok submit button found', submitButton);

    /** Click the submit button */
    if (submitButton instanceof HTMLElement) {
      submitButton.click();
    } else {
      throw new Error('Grok submit button not found');
    }

    return {
      success: true,
    };
  } catch (error: unknown) {
    logger.error('📕', '[Grok.tsx]', '[injectGrok]', 'Failed to inject article into Grok:', error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Failed to inject article into Grok'),
    };
  }
}
