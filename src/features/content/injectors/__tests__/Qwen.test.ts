/**
 * @jest-environment jsdom
 */
import { loadFixture } from '@/features/content/__fixtures__';
import { injectQwen } from '@/features/content/injectors/Qwen';
import { AIService, getModelOptionsFor } from '@/types';

describe('injectQwen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    /* The composer of chat.qwen.ai (signed out), captured with text typed in and the model menu open */
    loadFixture('qwen-composer');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const run = async (options: { model?: string; onStage?: jest.Mock; onModelUnavailable?: jest.Mock } = {}) => {
    const result = injectQwen('Prompt', options);
    await jest.runAllTimersAsync();
    return result;
  };

  const stagesOf = async (options: { model?: string }) => {
    const onStage = jest.fn();
    await expect(run({ ...options, onStage })).resolves.toEqual({ success: true });
    return onStage.mock.calls.map(([stage]) => stage);
  };

  const modelOptions = () => Array.from(document.querySelectorAll('[role="option"]'));

  it('reports selecting the model first when a model is given', async () => {
    expect(await stagesOf({ model: 'Qwen3.8-Max' })).toEqual(['selectingModel', 'pasting', 'sending']);
  });

  it('starts with pasting when no model is given', async () => {
    expect(await stagesOf({})).toEqual(['pasting', 'sending']);
  });

  /* Driven by the options so that a model the site dropped fails here when the fixture is recaptured */
  it.each(getModelOptionsFor(AIService.QWEN).map(option => option.value))('selects the offered %s model from the model menu', async model => {
    const clicked: string[] = [];
    modelOptions().forEach(option => option.addEventListener('click', () => clicked.push(option.textContent ?? '')));
    const onModelUnavailable = jest.fn();

    await run({ model, onModelUnavailable });

    expect(onModelUnavailable).not.toHaveBeenCalled();
    expect(clicked).toEqual([expect.stringContaining(model)]);
  });

  /* A model the site added shows up here; offer it in the options or list it as not offered */
  it('has no model menu entry missing from the model options', () => {
    const offered = getModelOptionsFor(AIService.QWEN).map(option => option.value);
    const unknown = modelOptions()
      .map(option => option.textContent ?? '')
      .filter(text => !offered.some(model => text.includes(model)));

    expect(unknown).toEqual([]);
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
  it('reports a model missing from the menu and still sends, leaving the menu open', async () => {
    /* The signed-out menu no longer lists Qwen3.7-Max */
    const onModelUnavailable = jest.fn();
    const pressedKeys: string[] = [];
    const onKeyDown = (event: KeyboardEvent) => pressedKeys.push(event.key);
    document.addEventListener('keydown', onKeyDown);

    await expect(run({ model: 'Qwen3.7-Max', onModelUnavailable })).resolves.toEqual({ success: true });
    document.removeEventListener('keydown', onKeyDown);

    expect(onModelUnavailable).toHaveBeenCalledWith('Qwen3.7-Max');
    expect(pressedKeys).toEqual([]);
  });

  it('does not report a model found in the menu', async () => {
    const onModelUnavailable = jest.fn();

    await run({ model: 'Qwen3.8-Max', onModelUnavailable });

    expect(onModelUnavailable).not.toHaveBeenCalled();
  });
});
