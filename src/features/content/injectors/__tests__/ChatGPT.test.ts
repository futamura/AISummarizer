/**
 * @jest-environment jsdom
 */
import { loadFixture } from '@/features/content/__fixtures__';
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
  });

  const run = async () => {
    const result = injectChatGPT(PROMPT);
    await jest.runAllTimersAsync();
    return result;
  };

  /* Stop the click from submitting the form, which jsdom does not implement */
  const watchClicks = (button: Element) => {
    const onClick = jest.fn((event: Event) => event.preventDefault());
    button.addEventListener('click', onClick);
    return onClick;
  };

  /*
   * The signed-in composer of chatgpt.com, captured with text typed in so that the send button
   * exists; it carries aria-disabled until the app sees the text
   */
  const mountSignedIn = (ariaDisabled: 'true' | 'false') => {
    loadFixture('chatgpt-composer');
    const submit = document.querySelector('#composer-submit-button')!;
    submit.setAttribute('aria-disabled', ariaDisabled);
    const editor = document.querySelector('#prompt-textarea')!;
    const onEnter = jest.fn();
    editor.addEventListener('keydown', event => {
      if ((event as KeyboardEvent).key === 'Enter') onEnter();
    });
    return { submit, onEnter, onClick: watchClicks(submit) };
  };

  it('reports pasting, then sending', async () => {
    mountSignedIn('false');
    const onStage = jest.fn();

    const result = injectChatGPT(PROMPT, { onStage });
    await jest.runAllTimersAsync();
    await result;

    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['pasting', 'sending']);
  });

  it('types the prompt through execCommand so the editor state follows the DOM', async () => {
    mountSignedIn('false');

    await run();

    expect(execCommand).toHaveBeenCalledWith('insertText', false, PROMPT);
  });

  it('clicks the send button once it is enabled', async () => {
    const { onClick, onEnter } = mountSignedIn('false');

    await expect(run()).resolves.toEqual({ success: true });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('waits for aria-disabled to clear before clicking', async () => {
    const { submit, onClick } = mountSignedIn('true');
    /* chatgpt.com drops a click on an aria-disabled button, so the article would stay in the composer */
    setTimeout(() => submit.setAttribute('aria-disabled', 'false'), 1500);

    await expect(run()).resolves.toEqual({ success: true });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('falls back to Enter when the send button stays disabled', async () => {
    const { onClick, onEnter } = mountSignedIn('true');

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
    mountSignedIn('false');
    const long = 'a'.repeat(MAX_PROMPT_CHARS + 1000);

    const result = injectChatGPT(long);
    await jest.runAllTimersAsync();
    await result;

    expect(execCommand).toHaveBeenCalledWith('insertText', false, truncateForChatGPT(long));
  });

  it('keeps using the native value setter for the guest textarea composer', async () => {
    /* The signed-out composer of chatgpt.com, captured in a private window */
    loadFixture('chatgpt-guest-composer');
    const textarea = document.querySelector<HTMLTextAreaElement>('form textarea[name="prompt"]')!;
    const onClick = watchClicks(document.querySelector('form button[aria-label="Send message"]')!);

    await expect(run()).resolves.toEqual({ success: true });

    expect(textarea.value).toBe(PROMPT);
    expect(execCommand).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
