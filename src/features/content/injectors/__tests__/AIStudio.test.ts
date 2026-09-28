/**
 * @jest-environment jsdom
 */
import { loadFixture } from '@/features/content/__fixtures__';
import { injectAIStudio } from '@/features/content/injectors/AIStudio';

const URL_CONTEXT_SWITCH = 'div[data-test-id="browseAsAToolTooltip"] button[role="switch"]';

describe('injectAIStudio', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    /* aistudio.google.com/prompts/new_chat, captured with text typed in and the thinking level menu open */
    loadFixture('aistudio-composer');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const run = async (options: { onStage?: jest.Mock } = {}) => {
    const result = injectAIStudio('Prompt', options);
    await jest.runAllTimersAsync();
    return result;
  };

  const watchClicks = (selector: string) => {
    const onClick = jest.fn();
    document.querySelector(selector)!.addEventListener('click', onClick);
    return onClick;
  };

  it('reports pasting, then sending; its settings are not model selection', async () => {
    const onStage = jest.fn();

    await expect(run({ onStage })).resolves.toEqual({ success: true });

    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['pasting', 'sending']);
  });

  it('picks the lowest thinking level, the first option of the menu', async () => {
    expect(document.querySelector('mat-option')!.textContent!.trim()).toBe('Minimal');
    const onClick = watchClicks('mat-option');

    await run();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('turns on the url context tool when it is off', async () => {
    expect(document.querySelector(URL_CONTEXT_SWITCH)!.getAttribute('aria-checked')).toBe('false');
    const onClick = watchClicks(URL_CONTEXT_SWITCH);

    await run();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('leaves the url context tool alone when it is on', async () => {
    document.querySelector(URL_CONTEXT_SWITCH)!.setAttribute('aria-checked', 'true');
    const onClick = watchClicks(URL_CONTEXT_SWITCH);

    await run();

    expect(onClick).not.toHaveBeenCalled();
  });

  it('sets the prompt through the native setter and clicks Run', async () => {
    const textarea = document.querySelector<HTMLTextAreaElement>('ms-prompt-box textarea')!;
    const onInput = jest.fn();
    textarea.addEventListener('input', onInput);
    const onClick = watchClicks('ms-run-button button');

    await expect(run()).resolves.toEqual({ success: true });

    expect(textarea.value).toBe('Prompt');
    expect(onInput).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
