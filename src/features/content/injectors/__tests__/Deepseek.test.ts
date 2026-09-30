/**
 * @jest-environment jsdom
 */
import { loadFixture } from '@/features/content/__fixtures__';
import { injectDeepSeek } from '@/features/content/injectors/Deepseek';

const SEND_BUTTON = 'div[role="button"].ds-button--primary.ds-button--filled.ds-button--circle';

describe('injectDeepSeek', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    /* The composer of chat.deepseek.com, captured with text typed in so that the send button is enabled */
    loadFixture('deepseek-composer');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const run = async (options: { model?: string; onStage?: jest.Mock; onModelUnavailable?: jest.Mock } = {}) => {
    const result = injectDeepSeek('Prompt', options);
    await jest.runAllTimersAsync();
    return result;
  };

  const stagesOf = async (options: { model?: string }) => {
    const onStage = jest.fn();
    await expect(run({ ...options, onStage })).resolves.toEqual({ success: true });
    return onStage.mock.calls.map(([stage]) => stage);
  };

  it('starts with pasting', async () => {
    expect(await stagesOf({})).toEqual(['pasting', 'sending']);
  });

  it('sets the textarea value and notifies React through an input event', async () => {
    const textarea = document.querySelector('textarea')!;
    const onInput = jest.fn();
    textarea.addEventListener('input', onInput);

    await run();

    expect(textarea.value).toBe('Prompt');
    expect(onInput).toHaveBeenCalled();
  });

  it('clicks the send button', async () => {
    const onClick = jest.fn();
    document.querySelector(SEND_BUTTON)!.addEventListener('click', onClick);

    await expect(run()).resolves.toEqual({ success: true });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ignores a model, since DeepSeek has no model to choose', async () => {
    /* DeepSeek merged Instant / Expert / Vision into one model; the captured page has no model tabs */
    expect(document.querySelectorAll('[role="radio"]')).toHaveLength(0);
    const onStage = jest.fn();
    const onModelUnavailable = jest.fn();

    await expect(run({ model: 'Expert', onStage, onModelUnavailable })).resolves.toEqual({ success: true });

    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['pasting', 'sending']);
    expect(onModelUnavailable).not.toHaveBeenCalled();
  });

  it('fails when the send button stays disabled', async () => {
    document.querySelector(SEND_BUTTON)!.classList.add('ds-button--disabled');

    const result = await run();

    expect(result.success).toBe(false);
  });
});
