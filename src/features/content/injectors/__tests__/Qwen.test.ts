/**
 * @jest-environment jsdom
 */
import { injectQwen } from '@/features/content/injectors/Qwen';

describe('injectQwen stages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<textarea class="message-input-textarea"></textarea><button class="send-button"></button>';
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  const stagesOf = async (options: { model?: string }) => {
    const onStage = jest.fn();
    const result = injectQwen('Prompt', { ...options, onStage });
    await jest.runAllTimersAsync();
    await expect(result).resolves.toEqual({ success: true });
    return onStage.mock.calls.map(([stage]) => stage);
  };

  it('reports selecting the model first when a model is given', async () => {
    expect(await stagesOf({ model: 'Qwen3.7-Max' })).toEqual(['selectingModel', 'pasting', 'sending']);
  });

  it('starts with pasting when no model is given', async () => {
    expect(await stagesOf({})).toEqual(['pasting', 'sending']);
  });
});
