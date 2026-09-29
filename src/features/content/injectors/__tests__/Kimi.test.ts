/**
 * @jest-environment jsdom
 */
import { loadFixture } from '@/features/content/__fixtures__';
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

describe('injectKimi', () => {
  let execCommand: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    execCommand = jest.fn(() => true);
    /* jsdom does not implement execCommand */
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    /* The composer of www.kimi.ai, captured with text typed in and the model menu open */
    loadFixture('kimi-composer');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const run = async (options: { model?: string; onStage?: jest.Mock } = {}) => {
    const result = injectKimi('Prompt', options);
    await jest.runAllTimersAsync();
    return result;
  };

  const stagesOf = async (options: { model?: string }) => {
    const onStage = jest.fn();
    await expect(run({ ...options, onStage })).resolves.toEqual({ success: true });
    return onStage.mock.calls.map(([stage]) => stage);
  };

  const watchModelItem = (name: string) => {
    const item = Array.from(document.querySelectorAll('.model-item')).find(element => element.querySelector('.model-name')?.textContent?.trim() === name)!;
    const onClick = jest.fn();
    item.addEventListener('click', onClick);
    return onClick;
  };

  it('reports selecting the model first when a model is given', async () => {
    expect(await stagesOf({ model: 'K3' })).toEqual(['selectingModel', 'pasting', 'sending']);
  });

  it('starts with pasting when no model is given', async () => {
    expect(await stagesOf({})).toEqual(['pasting', 'sending']);
  });

  it.each(['K3', 'Instant'])('clicks the %s item of the model menu', async model => {
    const onClick = watchModelItem(model);

    await run({ model });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('types the prompt through execCommand and clicks the send button', async () => {
    const onClick = jest.fn();
    document.querySelector('div.send-button-container')!.addEventListener('click', onClick);

    await expect(run()).resolves.toEqual({ success: true });

    expect(execCommand).toHaveBeenCalledWith('insertText', false, 'Prompt');
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
