/**
 * @jest-environment jsdom
 */
import { injectAIStudio } from '@/features/content/injectors/AIStudio';

describe('injectAIStudio stages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<ms-prompt-box><textarea></textarea></ms-prompt-box><ms-run-button><button></button></ms-run-button>';
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('reports pasting, then sending; its settings are not model selection', async () => {
    const onStage = jest.fn();
    const result = injectAIStudio('Prompt', { onStage });
    await jest.runAllTimersAsync();

    await expect(result).resolves.toEqual({ success: true });
    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['pasting', 'sending']);
  });
});
