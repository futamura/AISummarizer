/**
 * @jest-environment jsdom
 */
import { loadFixture } from '@/features/content/__fixtures__';
import { injectClaude } from '@/features/content/injectors/Claude';

const PROMPT = 'Summarize the following article.\n\nArticle body.';

describe('injectClaude', () => {
  let execCommand: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    execCommand = jest.fn(() => true);
    /* jsdom does not implement execCommand */
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const run = async () => {
    const result = injectClaude(PROMPT);
    await jest.runAllTimersAsync();
    return result;
  };

  /* The composer of claude.ai/new, captured with text typed in so that the send button is enabled */
  const mount = () => {
    loadFixture('claude-composer');
    const onEnter = jest.fn();
    document.querySelector('div.ProseMirror')!.addEventListener('keydown', event => {
      if ((event as KeyboardEvent).key === 'Enter') onEnter();
    });
    const onClick = jest.fn();
    document.querySelector('button[data-testid="chat-input-send"]')!.addEventListener('click', onClick);
    return { onEnter, onClick };
  };

  it('reports pasting, then sending', async () => {
    mount();
    const onStage = jest.fn();

    const result = injectClaude(PROMPT, { onStage });
    await jest.runAllTimersAsync();
    await result;

    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['pasting', 'sending']);
  });

  it('types the prompt through execCommand', async () => {
    mount();

    await run();

    expect(execCommand).toHaveBeenCalledWith('insertText', false, PROMPT);
  });

  it('clicks the send button when it is enabled', async () => {
    const { onEnter, onClick } = mount();

    await expect(run()).resolves.toEqual({ success: true });

    expect(onClick).toHaveBeenCalledTimes(1);
    /* claude.ai on touch devices treats Enter as a line break, so Enter must not be sent as well */
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('falls back to Enter when the send button is missing', async () => {
    const { onEnter } = mount();
    document.querySelector('button[data-testid="chat-input-send"]')!.remove();

    await expect(run()).resolves.toEqual({ success: true });

    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('falls back to Enter when the send button is disabled', async () => {
    const { onEnter, onClick } = mount();
    document.querySelector('button[data-testid="chat-input-send"]')!.setAttribute('disabled', '');

    await expect(run()).resolves.toEqual({ success: true });

    expect(onClick).not.toHaveBeenCalled();
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('fails when the editor is missing', async () => {
    loadFixture('claude-composer');
    document.querySelector('div.ProseMirror')!.remove();

    const result = await run();

    expect(result.success).toBe(false);
  });
});
