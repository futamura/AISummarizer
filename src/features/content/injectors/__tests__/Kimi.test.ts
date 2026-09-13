import { isPromptResidue } from '@/features/content/injectors/Kimi';

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
});
