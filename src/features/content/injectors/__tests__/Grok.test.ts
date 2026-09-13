/**
 * @jest-environment jsdom
 */
import { injectGrok } from '@/features/content/injectors/Grok';

const PROMPT = 'Summarize the following article.\n\nArticle body.';

describe('injectGrok', () => {
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
    const result = injectGrok(PROMPT);
    await jest.runAllTimersAsync();
    return result;
  };

  /* Stop the click from submitting the form, which jsdom does not implement */
  const watchSubmitClicks = () => {
    const onClick = jest.fn((event: Event) => event.preventDefault());
    document.querySelector('button[aria-label="Submit"]')!.addEventListener('click', onClick);
    return onClick;
  };

  it('fills the composer textarea and clicks Submit', async () => {
    /* grok.com as of 2026-09-13 (desktop and Android): a React textarea in the form, plus an aria-hidden autosize shadow outside it */
    document.body.innerHTML =
      '<form><textarea aria-label="Ask Grok anything"></textarea><button type="submit" aria-label="Submit"></button></form>' +
      '<textarea aria-hidden="true" tabindex="-1"></textarea>';
    const [composer, shadow] = Array.from(document.querySelectorAll('textarea'));
    const onInput = jest.fn();
    composer.addEventListener('input', onInput);
    const onSubmitClick = watchSubmitClicks();

    await expect(run()).resolves.toEqual({ success: true });

    expect(composer.value).toBe(PROMPT);
    expect(onInput).toHaveBeenCalled();
    expect(shadow.value).toBe('');
    expect(onSubmitClick).toHaveBeenCalledTimes(1);
  });

  it('fills the Tiptap editor and clicks Submit', async () => {
    document.body.innerHTML = '<form><div class="tiptap ProseMirror" contenteditable="true"></div><button type="submit" aria-label="Submit"></button></form>';
    const onSubmitClick = watchSubmitClicks();

    await expect(run()).resolves.toEqual({ success: true });

    expect(execCommand).toHaveBeenCalledWith('insertText', false, PROMPT);
    expect(onSubmitClick).toHaveBeenCalledTimes(1);
  });
});
