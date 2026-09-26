import { insertEditorText } from '@/platform';
import { getRandomInt, logger, waitForElement } from '@/utils';

export async function injectClaude(prompt: string): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[Claude.tsx]', '[injectClaude]', 'Injecting article into Claude', prompt);

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
    insertEditorText(prompt);

    /** Wait for 1.5 to 2 seconds */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(1500, 2000)));

    /**
     * Click the send button, located by its locale-independent data-testid. On touch devices
     * claude.ai treats Enter as a line break, so the button is preferred. Fall back to a
     * synthetic Enter keydown handled by the ProseMirror keymap when the button is missing
     * or still disabled.
     */
    const sendButton = document.querySelector('button[data-testid="chat-input-send"]');
    if (sendButton instanceof HTMLButtonElement && !sendButton.disabled) {
      logger.debug('📕', '[Claude.tsx]', '[injectClaude]', 'Claude send button found', sendButton);
      sendButton.click();
    } else {
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
    }

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
