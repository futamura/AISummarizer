import { getRandomInt, logger, waitForElement } from '@/utils';

export async function injectClaude(prompt: string): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[Claude.tsx]', '[injectClaude]', 'Injecting article into Claude', prompt);

    /** Wait for 2 to 3 seconds */
    new Promise(resolve => setTimeout(resolve, getRandomInt(2000, 3000)));

    /** Wait for the editor to be found */
    const editor = await waitForElement('div.ProseMirror[contenteditable="true"]');
    if (!editor) throw new Error('Claude container not found');
    logger.debug('📕', '[Claude.tsx]', '[injectClaude]', 'Claude editor found', editor);

    /**
     * Inject the article via execCommand so the ProseMirror state stays in sync.
     * Setting innerHTML fills the DOM but leaves the app state empty, in which
     * case the message is never sent.
     */
    if (!(editor instanceof HTMLElement)) throw new Error('Claude editor is not an HTML element');
    editor.focus();
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
    document.execCommand('insertText', false, prompt);

    /** Wait for 1.5 to 2 seconds */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(1500, 2000)));

    /**
     * Submit with a synthetic Enter keydown handled by the ProseMirror keymap.
     * The send button cannot be used: its aria-label is locale-dependent and
     * it only appears after trusted user input.
     */
    editor.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      } as KeyboardEventInit)
    );

    return {
      success: true,
    };
  } catch (error: unknown) {
    logger.error('📕', '[Claude.tsx]', '[injectClaude]', 'Failed to inject article into Claude:', error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Failed to inject article into Claude'),
    };
  }
}
