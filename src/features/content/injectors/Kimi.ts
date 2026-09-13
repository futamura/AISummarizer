import { getRandomInt, logger, waitForElement } from '@/utils';

/*
 * Select the model (Instant / K3) before injecting text.
 * The picker opens from the .current-model chip next to the send button and lists
 * .model-item entries; the name is matched exactly so "K3" never hits "K3 Swarm"
 * (verified live 2026-08-08). Selecting K3 navigates to /agent, where the editor
 * and send button keep the same selectors.
 * Any failure is logged and swallowed so the injection itself still proceeds.
 */
async function selectKimiModel(model: string): Promise<void> {
  try {
    const trigger = await waitForElement('.current-model');
    if (!(trigger instanceof HTMLElement)) throw new Error('Kimi model picker trigger not found');
    trigger.click();

    /* Wait for the picker popup to open */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));

    const target = [...document.querySelectorAll('.model-item')].find(el => el.querySelector('.model-name')?.textContent?.trim() === model);
    if (!(target instanceof HTMLElement)) throw new Error(`Kimi model item not found: ${model}`);
    target.click();

    /* Wait for the model switch (and a possible SPA navigation) to settle */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));
  } catch (error: unknown) {
    logger.warn('📕', '[Kimi.tsx]', '[selectKimiModel]', 'Model selection failed, continuing injection:', error);
  }
}

/*
 * Decide whether editor text left after a send click is residue that must be cleared.
 * Both sides are compared with all whitespace stripped, matching how Lexical's
 * textContent joins paragraph nodes without the original newlines. Empty text and
 * text not contained in the prompt (user-typed text) are never residue. Text equal
 * to the whole prompt means the send never went through (e.g. Kimi's login wall
 * blocked it), so it is left alone; only a strict, shorter fragment is residue.
 */
export function isPromptResidue(editorText: string | null | undefined, prompt: string): boolean {
  const normalizedEditor = editorText?.replace(/\s+/g, '') ?? '';
  if (!normalizedEditor) return false;
  const normalizedPrompt = prompt.replace(/\s+/g, '');
  if (!normalizedPrompt.includes(normalizedEditor)) return false;
  return normalizedEditor !== normalizedPrompt;
}

export async function injectKimi(prompt: string, model?: string): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[Kimi.tsx]', '[injectKimi]', 'Injecting article into Kimi\n', prompt);

    /** Wait for 2 to 3 seconds to ensure page is fully loaded */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(2000, 3000)));

    /* Select the configured model first; failures are non-fatal */
    if (model) await selectKimiModel(model);

    /** Wait for the editor to be found. The chat box is a Lexical contenteditable div (verified live 2026-08-08) */
    const editor = await waitForElement('div[contenteditable="true"][data-lexical-editor="true"]');
    if (!editor) throw new Error('Kimi container not found');
    logger.debug('📕', '[Kimi.tsx]', '[injectKimi]', 'Kimi editor found', editor);

    /**
     * Inject the article via execCommand so the Lexical editor state stays in sync.
     * Setting innerHTML fills the DOM but leaves the app state empty, in which
     * case the message is never sent.
     */
    if (!(editor instanceof HTMLElement)) throw new Error('Kimi editor is not an HTML element');
    editor.focus();
    document.execCommand('insertText', false, prompt);

    /** Wait for 1 to 1.5 seconds */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(1000, 1500)));

    /** Wait for the submit button to be found. Disabled state is expressed via the disabled class (verified live 2026-08-08) */
    const submitButton = await waitForElement('div.send-button-container:not(.disabled)');
    if (!submitButton) throw new Error('Kimi submit button not found');
    logger.debug('📕', '[Kimi.tsx]', '[injectKimi]', 'Kimi submit button found', submitButton);

    /** Click the submit button */
    if (submitButton instanceof HTMLElement) {
      submitButton.click();
    } else {
      throw new Error('Kimi submit button not found');
    }

    /*
     * With large prompts, Kimi's Lexical editor occasionally re-applies the tail
     * chunk of the inserted text after the send has already cleared the editor
     * (observed live 2026-08-09). Poll briefly after sending and wipe any editor
     * content that is a fragment of the injected prompt; user-typed text never
     * matches and is left untouched. The residue spans multiple Lexical paragraph
     * nodes and textContent joins them without the original newlines, so both
     * sides are compared with all whitespace stripped. If the editor still holds
     * the entire prompt, the send never went through (e.g. it was blocked by
     * Kimi's login wall), so that poll is skipped rather than clearing it, and
     * later polls keep running in case a real send still re-applies a tail chunk.
     * Clearing needs an explicit DOM selection plus an empty insertText:
     * execCommand('selectAll'/'delete') is ignored by Lexical, and the
     * selectionchange must settle before insertText fires.
     */
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 800));
      const residueEditor = document.querySelector('div[contenteditable="true"][data-lexical-editor="true"]');
      if (!(residueEditor instanceof HTMLElement)) continue;
      if (!isPromptResidue(residueEditor.textContent, prompt)) continue;
      const residue = residueEditor.textContent?.replace(/\s+/g, '');
      logger.debug('📕', '[Kimi.tsx]', '[injectKimi]', 'Clearing prompt residue re-applied after send:', residue?.length);
      residueEditor.focus();
      window.getSelection()?.selectAllChildren(residueEditor);
      await new Promise(resolve => setTimeout(resolve, 200));
      document.execCommand('insertText', false, '');
    }

    return {
      success: true,
    };
  } catch (error: unknown) {
    logger.error('📕', '[Kimi.tsx]', '[injectKimi]', 'Failed to inject article into Kimi:', error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Failed to inject article into Kimi'),
    };
  }
}
