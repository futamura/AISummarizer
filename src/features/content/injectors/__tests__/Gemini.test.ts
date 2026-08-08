import { matchGeminiModelLabel } from '@/features/content/injectors/Gemini';

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
