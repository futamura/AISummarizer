/**
 * @jest-environment jsdom
 */
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
    document.body.innerHTML = '';
  });

  const run = async () => {
    const result = injectClaude(PROMPT);
    await jest.runAllTimersAsync();
    return result;
  };

  /* Composer markup as observed on claude.ai (2026-09-13): the send button sits next to the editor in a fieldset */
  const mount = (sendButton: string) => {
    document.body.innerHTML = `<fieldset><div class="ProseMirror" contenteditable="true"></div>${sendButton}</fieldset>`;
    const onEnter = jest.fn();
    document.querySelector('div.ProseMirror')!.addEventListener('keydown', event => {
      if ((event as KeyboardEvent).key === 'Enter') onEnter();
    });
    return { onEnter };
  };

  it('types the prompt through execCommand', async () => {
    mount('<button data-testid="chat-input-send"></button>');

    await run();

    expect(execCommand).toHaveBeenCalledWith('insertText', false, PROMPT);
  });

  it('clicks the send button when it is enabled', async () => {
    const { onEnter } = mount('<button data-testid="chat-input-send" aria-label="メッセージを送信"></button>');
    const onClick = jest.fn();
    document.querySelector('button')!.addEventListener('click', onClick);

    await expect(run()).resolves.toEqual({ success: true });

    expect(onClick).toHaveBeenCalledTimes(1);
    /* claude.ai on touch devices treats Enter as a line break, so Enter must not be sent as well */
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('falls back to Enter when the send button is missing', async () => {
    const { onEnter } = mount('');

    await expect(run()).resolves.toEqual({ success: true });

    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('falls back to Enter when the send button is disabled', async () => {
    const { onEnter } = mount('<button data-testid="chat-input-send" disabled></button>');

    await expect(run()).resolves.toEqual({ success: true });

    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});
