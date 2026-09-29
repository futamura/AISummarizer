/**
 * @jest-environment jsdom
 */
import { loadFixture } from '@/features/content/__fixtures__';
import { injectQwen } from '@/features/content/injectors/Qwen';

describe('injectQwen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    /* The composer of chat.qwen.ai (signed out), captured with text typed in and the model menu open */
    loadFixture('qwen-composer');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const run = async (options: { model?: string; onStage?: jest.Mock } = {}) => {
    const result = injectQwen('Prompt', options);
    await jest.runAllTimersAsync();
    return result;
  };

  const stagesOf = async (options: { model?: string }) => {
    const onStage = jest.fn();
    await expect(run({ ...options, onStage })).resolves.toEqual({ success: true });
    return onStage.mock.calls.map(([stage]) => stage);
  };

  it('reports selecting the model first when a model is given', async () => {
    expect(await stagesOf({ model: 'Qwen3.8-Max' })).toEqual(['selectingModel', 'pasting', 'sending']);
  });

  it('starts with pasting when no model is given', async () => {
    expect(await stagesOf({})).toEqual(['pasting', 'sending']);
  });

  it.each(['Qwen3.8-Max', 'Qwen3.7-Plus'])('clicks the %s option of the model menu', async model => {
    const option = Array.from(document.querySelectorAll('[role="option"]')).find(element => element.textContent?.includes(model))!;
    const onClick = jest.fn();
    option.addEventListener('click', onClick);

    await run({ model });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('sets the textarea through the native setter and clicks Send', async () => {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea.message-input-textarea')!;
    const onInput = jest.fn();
    textarea.addEventListener('input', onInput);
    const onClick = jest.fn();
    document.querySelector('button.send-button')!.addEventListener('click', onClick);

    await expect(run()).resolves.toEqual({ success: true });

    expect(textarea.value).toBe('Prompt');
    expect(onInput).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
