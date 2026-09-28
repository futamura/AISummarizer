/**
 * @jest-environment jsdom
 */
import { loadFixture } from '@/features/content/__fixtures__';
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

  /*
   * grok.com serves either composer, varying between page loads (desktop and Android); both were
   * captured with text typed in so that Submit replaces the voice mode button
   */
  it('reports pasting, then sending', async () => {
    loadFixture('grok-textarea-composer');
    watchSubmitClicks();
    const onStage = jest.fn();

    const result = injectGrok(PROMPT, { onStage });
    await jest.runAllTimersAsync();
    await result;

    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['pasting', 'sending']);
  });

  it('reports no sending when the editor is missing', async () => {
    loadFixture('grok-textarea-composer');
    document.querySelector('form textarea')!.remove();
    const onStage = jest.fn();

    const result = injectGrok(PROMPT, { onStage });
    await jest.runAllTimersAsync();

    await expect(result).resolves.toMatchObject({ success: false });
    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['pasting']);
  });

  it('fills the composer textarea and clicks Submit', async () => {
    /* The composer textarea sits in the form; an aria-hidden autosize shadow textarea sits outside it */
    loadFixture('grok-textarea-composer');
    const composer = document.querySelector<HTMLTextAreaElement>('form textarea')!;
    const shadow = document.querySelector<HTMLTextAreaElement>('body > textarea[aria-hidden="true"]')!;
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
    loadFixture('grok-tiptap-composer');
    const onSubmitClick = watchSubmitClicks();

    await expect(run()).resolves.toEqual({ success: true });

    expect(execCommand).toHaveBeenCalledWith('insertText', false, PROMPT);
    expect(onSubmitClick).toHaveBeenCalledTimes(1);
  });
});
