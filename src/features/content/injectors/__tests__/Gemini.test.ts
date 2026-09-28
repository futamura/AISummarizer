/**
 * @jest-environment jsdom
 */
import { injectGemini, matchGeminiModelLabel } from '@/features/content/injectors/Gemini';

/* Menu item texts as observed on gemini.google.com (2026-08-08) */
const MENU = ['3.5 Flash-Lite すばやく回答を得るのに最適', '3.6 Flash あらゆる場面でサポート', '3.1 Pro 高度な数学とコーディングに最適'];

describe('matchGeminiModelLabel', () => {
  it('matches Pro', () => {
    expect(matchGeminiModelLabel(MENU, 'Pro')).toBe(2);
  });

  it('matches Flash-Lite', () => {
    expect(matchGeminiModelLabel(MENU, 'Flash-Lite')).toBe(0);
  });

  it('matches Flash without hitting Flash-Lite', () => {
    expect(matchGeminiModelLabel(MENU, 'Flash')).toBe(1);
  });

  it('returns -1 when nothing matches', () => {
    expect(matchGeminiModelLabel(MENU, 'Ultra')).toBe(-1);
  });

  it('returns -1 for empty model', () => {
    expect(matchGeminiModelLabel(MENU, '')).toBe(-1);
  });
});

describe('injectGemini stages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML =
      '<rich-textarea><div class="ql-editor" contenteditable="true"><p></p></div></rich-textarea><button aria-label="Send message"></button>';
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  const stagesOf = async (options: { model?: string }) => {
    const onStage = jest.fn();
    const result = injectGemini('Prompt', { ...options, onStage });
    await jest.runAllTimersAsync();
    await expect(result).resolves.toEqual({ success: true });
    return onStage.mock.calls.map(([stage]) => stage);
  };

  it('reports selecting the model first when a model is given', async () => {
    /* The picker is missing, so the selection fails; the injection carries on as it does live */
    expect(await stagesOf({ model: 'Pro' })).toEqual(['selectingModel', 'pasting', 'sending']);
  });

  it('starts with pasting when no model is given', async () => {
    expect(await stagesOf({})).toEqual(['pasting', 'sending']);
  });
});
