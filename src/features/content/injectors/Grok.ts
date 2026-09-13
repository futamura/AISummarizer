import { getRandomInt, logger, waitForElement } from '@/utils';

export async function injectGrok(prompt: string): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[Grok.tsx]', '[injectGrok]', 'Injecting article into Grok', prompt);

    /**
     * Wait for the editor to be found. Grok went back from a Tiptap (ProseMirror) contenteditable to a
     * textarea in the composer form; the aria-hidden autosize textarea outside the form is not matched
     */
    const editor = await waitForElement('form textarea, div.tiptap.ProseMirror[contenteditable="true"]');
    if (!editor) throw new Error('Grok container not found');
    logger.debug('📕', '[Grok.tsx]', '[injectGrok]', 'Grok editor found', editor);

    if (editor instanceof HTMLTextAreaElement) {
      /** Set the value through the native setter and trigger an input event so React picks up the change */
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!nativeSetter) throw new Error('Grok native value setter not found');
      nativeSetter.call(editor, prompt);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (editor instanceof HTMLElement) {
      /** Inject the article via execCommand so the Tiptap state stays in sync */
      editor.focus();
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
      document.execCommand('insertText', false, prompt);
    } else {
      throw new Error('Grok editor is not an HTML element');
    }

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
