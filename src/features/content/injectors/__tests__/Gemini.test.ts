/**
 * @jest-environment jsdom
 */
import { loadFixture } from '@/features/content/__fixtures__';
import { injectGemini, matchGeminiModelLabel } from '@/features/content/injectors/Gemini';
import { AIService, getModelOptionsFor } from '@/types';

/* Menu item texts as observed on gemini.google.com (2026-08-08) */
const MENU = ['3.5 Flash-Lite すばやく回答を得るのに最適', '3.6 Flash あらゆる場面でサポート', '3.1 Pro 高度な数学とコーディングに最適'];

const MODE_OPTION = '[data-test-id^="bard-mode-option"]';

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

describe('injectGemini', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    /* The composer of gemini.google.com, captured with text typed in and the mode menu open */
    loadFixture('gemini-composer');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const run = async (options: { model?: string; onStage?: jest.Mock; onModelUnavailable?: jest.Mock } = {}) => {
    const result = injectGemini('Prompt', options);
    await jest.runAllTimersAsync();
    return result;
  };

  const stagesOf = async (options: { model?: string }) => {
    const onStage = jest.fn();
    await expect(run({ ...options, onStage })).resolves.toEqual({ success: true });
    return onStage.mock.calls.map(([stage]) => stage);
  };

  const modeOptions = () => Array.from(document.querySelectorAll<HTMLElement>(MODE_OPTION));

  const menuTextOf = (option: Element) => option.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('reports selecting the model first when a model is given', async () => {
    expect(await stagesOf({ model: 'Pro' })).toEqual(['selectingModel', 'pasting', 'sending']);
  });

  it('starts with pasting when no model is given', async () => {
    expect(await stagesOf({})).toEqual(['pasting', 'sending']);
  });

  /* Driven by the options so that a model the site dropped fails here when the fixture is recaptured */
  it.each(getModelOptionsFor(AIService.GEMINI).map(option => option.value))('selects the offered %s model from the mode menu', async model => {
    const clicked: string[] = [];
    modeOptions().forEach(option => option.addEventListener('click', () => clicked.push(menuTextOf(option))));
    const onModelUnavailable = jest.fn();

    await run({ model, onModelUnavailable });

    expect(onModelUnavailable).not.toHaveBeenCalled();
    expect(clicked).toEqual([expect.stringContaining(model)]);
  });

  /* A model the site added shows up here; offer it in the options or list it as not offered */
  it('has no mode menu entry missing from the model options', () => {
    const offered = getModelOptionsFor(AIService.GEMINI).map(option => option.value);
    const unknown = modeOptions()
      .map(menuTextOf)
      .filter(text => !offered.some(model => matchGeminiModelLabel([text], model) === 0));

    expect(unknown).toEqual([]);
  });

  it('writes the prompt into the editor paragraph and clicks Send', async () => {
    const editor = document.querySelector('rich-textarea div.ql-editor[contenteditable="true"]')!;
    const onInput = jest.fn();
    editor.addEventListener('input', onInput);
    const onClick = jest.fn();
    document.querySelector('button[aria-label="Send message"]')!.addEventListener('click', onClick);

    await expect(run()).resolves.toEqual({ success: true });

    expect(editor.querySelector('p')!.textContent).toBe('Prompt');
    expect(onInput).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('reports a model missing from the menu, closes the menu and still sends', async () => {
    /* The captured menu offers Flash-Lite / Flash / Pro */
    const onModelUnavailable = jest.fn();
    const pressedKeys: string[] = [];
    const onKeyDown = (event: KeyboardEvent) => pressedKeys.push(event.key);
    document.addEventListener('keydown', onKeyDown);

    await expect(run({ model: 'Ultra', onModelUnavailable })).resolves.toEqual({ success: true });
    document.removeEventListener('keydown', onKeyDown);

    expect(onModelUnavailable).toHaveBeenCalledWith('Ultra');
    expect(pressedKeys).toEqual(['Escape']);
  });

  it('does not report a model found in the menu', async () => {
    const onModelUnavailable = jest.fn();

    await run({ model: 'Pro', onModelUnavailable });

    expect(onModelUnavailable).not.toHaveBeenCalled();
  });
});
