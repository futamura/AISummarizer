/**
 * @jest-environment jsdom
 */
import { injectKimi, isPromptResidue } from '@/features/content/injectors/Kimi';

/* Multi-paragraph prompt mirroring the article + prompt text injectKimi sends */
const PROMPT = 'First paragraph text.\n\nSecond paragraph text.\n\nThird paragraph tail chunk text.';

describe('isPromptResidue', () => {
  it('returns false for an empty string', () => {
    expect(isPromptResidue('', PROMPT)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isPromptResidue(null, PROMPT)).toBe(false);
  });

  it('returns false for whitespace-only text', () => {
    expect(isPromptResidue('   \n ', PROMPT)).toBe(false);
  });

  it('returns true for a tail fragment of the prompt', () => {
    expect(isPromptResidue('Third paragraph tail chunk text.', PROMPT)).toBe(true);
  });

  it('returns true for a fragment whose whitespace differs from the prompt', () => {
    /* Lexical's textContent joins paragraph nodes without the original blank-line separators */
    expect(isPromptResidue('Second paragraph text.Third paragraph tail chunk text.', PROMPT)).toBe(true);
  });

  it('returns false for the whole prompt', () => {
    expect(isPromptResidue(PROMPT, PROMPT)).toBe(false);
  });

  it('returns false for the whole prompt with whitespace differences', () => {
    expect(isPromptResidue('First paragraph text.Second paragraph text.Third paragraph tail chunk text.', PROMPT)).toBe(false);
  });

  it('returns false for unrelated text not contained in the prompt', () => {
    expect(isPromptResidue('Please log in to continue.', PROMPT)).toBe(false);
  });

  it('returns false for a leading fragment of the prompt', () => {
    expect(isPromptResidue('First paragraph text.', PROMPT)).toBe(false);
  });

  it('returns false for a fragment taken from the middle of the prompt', () => {
    /* Text the user typed can repeat a phrase of the article, so only a suffix counts as residue */
    expect(isPromptResidue('Second paragraph text.', PROMPT)).toBe(false);
  });
});

describe('injectKimi stages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    /* jsdom does not implement execCommand */
    Object.defineProperty(document, 'execCommand', { value: jest.fn(() => true), configurable: true });
    document.body.innerHTML = '<div contenteditable="true" data-lexical-editor="true"></div><div class="send-button-container"></div>';
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  const stagesOf = async (options: { model?: string }) => {
    const onStage = jest.fn();
    const result = injectKimi('Prompt', { ...options, onStage });
    await jest.runAllTimersAsync();
    await expect(result).resolves.toEqual({ success: true });
    return onStage.mock.calls.map(([stage]) => stage);
  };

  it('reports selecting the model first when a model is given', async () => {
    expect(await stagesOf({ model: 'K3' })).toEqual(['selectingModel', 'pasting', 'sending']);
  });

  it('starts with pasting when no model is given', async () => {
    expect(await stagesOf({})).toEqual(['pasting', 'sending']);
  });
});
