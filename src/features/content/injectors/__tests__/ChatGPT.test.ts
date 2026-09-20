/**
 * @jest-environment jsdom
 */
import { injectChatGPT, MAX_PROMPT_CHARS, truncateForChatGPT } from '@/features/content/injectors/ChatGPT';

const PROMPT = 'Summarize the following article.\n\nArticle body.';

describe('injectChatGPT', () => {
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
    const result = injectChatGPT(PROMPT);
    await jest.runAllTimersAsync();
    return result;
  };

  /* Composer markup as observed on chatgpt.com (2026-09-20): the send button carries aria-disabled until the app sees the text */
  const mountProseMirror = (submitAttributes: string) => {
    document.body.innerHTML = `<form><div id="prompt-textarea" class="ProseMirror" contenteditable="true"></div><button id="composer-submit-button" data-testid="send-button" ${submitAttributes}></button></form>`;
    const editor = document.querySelector('#prompt-textarea')!;
    const onEnter = jest.fn();
    editor.addEventListener('keydown', event => {
      if ((event as KeyboardEvent).key === 'Enter') onEnter();
    });
    const onClick = jest.fn();
    document.querySelector('button')!.addEventListener('click', onClick);
    return { editor, onEnter, onClick };
  };

  it('types the prompt through execCommand so the editor state follows the DOM', async () => {
    mountProseMirror('aria-disabled="false"');

    await run();

    expect(execCommand).toHaveBeenCalledWith('insertText', false, PROMPT);
  });

  it('clicks the send button once it is enabled', async () => {
    const { onClick, onEnter } = mountProseMirror('aria-disabled="false"');

    await expect(run()).resolves.toEqual({ success: true });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('waits for aria-disabled to clear before clicking', async () => {
    const { onClick } = mountProseMirror('aria-disabled="true"');
    /* chatgpt.com drops a click on an aria-disabled button, so the article would stay in the composer */
    setTimeout(() => document.querySelector('button')!.setAttribute('aria-disabled', 'false'), 1500);

    await expect(run()).resolves.toEqual({ success: true });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('falls back to Enter when the send button stays disabled', async () => {
    const { onClick, onEnter } = mountProseMirror('aria-disabled="true"');

    await run();

    expect(onClick).not.toHaveBeenCalled();
    expect(onEnter).toHaveBeenCalled();
  });

  it('leaves a prompt within the limit untouched', () => {
    expect(truncateForChatGPT(PROMPT)).toBe(PROMPT);
  });

  it('cuts a prompt past the limit and says so', () => {
    const long = 'a'.repeat(MAX_PROMPT_CHARS + 1000);

    const truncated = truncateForChatGPT(long);

    /* chatgpt.com keeps the send button aria-disabled on an over-long prompt, so the cap has to hold */
    expect(truncated.length).toBe(MAX_PROMPT_CHARS);
    expect(truncated).toMatch(/cut off here/);
  });

  it('types the cut prompt rather than the original', async () => {
    mountProseMirror('aria-disabled="false"');
    const long = 'a'.repeat(MAX_PROMPT_CHARS + 1000);

    const result = injectChatGPT(long);
    await jest.runAllTimersAsync();
    await result;

    expect(execCommand).toHaveBeenCalledWith('insertText', false, truncateForChatGPT(long));
  });

  it('keeps using the native value setter for the guest textarea composer', async () => {
    document.body.innerHTML = '<form><textarea name="prompt"></textarea><button aria-label="Send message"></button></form>';
    const textarea = document.querySelector('textarea')!;
    const onClick = jest.fn();
    document.querySelector('button')!.addEventListener('click', onClick);

    await expect(run()).resolves.toEqual({ success: true });

    expect(textarea.value).toBe(PROMPT);
    expect(execCommand).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
