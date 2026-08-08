import {
  AIService,
  getModelOptionsFor,
  getSummarizeUrl,
  supportsModelParam,
  supportsModelSelection,
} from '@/types/AIService';

describe('supportsModelParam', () => {
  it('returns true only for URL-parameter services', () => {
    expect(supportsModelParam(AIService.CHATGPT)).toBe(true);
    expect(supportsModelParam(AIService.CLAUDE)).toBe(true);
    expect(supportsModelParam(AIService.AI_STUDIO)).toBe(true);
    expect(supportsModelParam(AIService.GEMINI)).toBe(false);
    expect(supportsModelParam(AIService.DEEPSEEK)).toBe(false);
    expect(supportsModelParam(AIService.GROK)).toBe(false);
    expect(supportsModelParam(AIService.PERPLEXITY)).toBe(false);
  });
});

describe('supportsModelSelection', () => {
  it('returns true for param and DOM services, false for excluded services', () => {
    expect(supportsModelSelection(AIService.CHATGPT)).toBe(true);
    expect(supportsModelSelection(AIService.CLAUDE)).toBe(true);
    expect(supportsModelSelection(AIService.AI_STUDIO)).toBe(true);
    expect(supportsModelSelection(AIService.GEMINI)).toBe(true);
    expect(supportsModelSelection(AIService.DEEPSEEK)).toBe(true);
    expect(supportsModelSelection(AIService.GROK)).toBe(false);
    expect(supportsModelSelection(AIService.PERPLEXITY)).toBe(false);
  });
});

describe('getModelOptionsFor', () => {
  it('returns presets for Claude', () => {
    const labels = getModelOptionsFor(AIService.CLAUDE).map(o => o.label);
    expect(labels).toEqual(['Fable 5', 'Opus 5', 'Sonnet 5', 'Haiku 4.5']);
  });

  it('returns empty presets for ChatGPT (custom only)', () => {
    expect(getModelOptionsFor(AIService.CHATGPT)).toEqual([]);
  });

  it('returns DOM labels for Gemini and DeepSeek', () => {
    expect(getModelOptionsFor(AIService.GEMINI).map(o => o.value)).toEqual(['Flash-Lite', 'Flash', 'Pro']);
    expect(getModelOptionsFor(AIService.DEEPSEEK).map(o => o.value)).toEqual(['Instant', 'Expert', 'Vision']);
  });
});

describe('getSummarizeUrl', () => {
  it('keeps existing URL shape when model is omitted', () => {
    expect(getSummarizeUrl(AIService.CLAUDE, '42')).toBe('https://claude.ai/new?aismid=42');
  });

  it('appends model parameter for param-supported services', () => {
    expect(getSummarizeUrl(AIService.CLAUDE, '42', 'claude-opus-5')).toBe('https://claude.ai/new?aismid=42&model=claude-opus-5');
    expect(getSummarizeUrl(AIService.AI_STUDIO, '42', 'gemini-3.1-pro-preview')).toBe(
      'https://aistudio.google.com/prompts/new_chat?aismid=42&model=gemini-3.1-pro-preview'
    );
    expect(getSummarizeUrl(AIService.CHATGPT, '42', 'gpt-5.2')).toBe('https://chatgpt.com/?aismid=42&model=gpt-5.2');
  });

  it('ignores model for DOM-operated and excluded services', () => {
    expect(getSummarizeUrl(AIService.GEMINI, '42', 'Pro')).toBe('https://gemini.google.com/app?aismid=42');
    expect(getSummarizeUrl(AIService.GROK, '42', 'anything')).toBe('https://grok.com/?aismid=42');
  });

  it('ignores empty-string model', () => {
    expect(getSummarizeUrl(AIService.CLAUDE, '42', '')).toBe('https://claude.ai/new?aismid=42');
  });

  it('URL-encodes the model value', () => {
    expect(getSummarizeUrl(AIService.CHATGPT, '42', 'a b&c')).toBe('https://chatgpt.com/?aismid=42&model=a%20b%26c');
  });
});
