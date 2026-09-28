/**
 * @jest-environment jsdom
 */
import { injectDeepSeek } from '@/features/content/injectors/Deepseek';

describe('injectDeepSeek stages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<textarea></textarea><div role="button" class="ds-button--primary ds-button--filled ds-button--circle"></div>';
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  const stagesOf = async (options: { model?: string }) => {
    const onStage = jest.fn();
    const result = injectDeepSeek('Prompt', { ...options, onStage });
    await jest.runAllTimersAsync();
    await expect(result).resolves.toEqual({ success: true });
    return onStage.mock.calls.map(([stage]) => stage);
  };

  it('reports selecting the model first when a model is given', async () => {
    expect(await stagesOf({ model: 'Expert' })).toEqual(['selectingModel', 'pasting', 'sending']);
  });

  it('starts with pasting when no model is given', async () => {
    expect(await stagesOf({})).toEqual(['pasting', 'sending']);
  });
});
