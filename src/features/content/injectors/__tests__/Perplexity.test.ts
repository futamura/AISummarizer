/**
 * @jest-environment jsdom
 */
import { loadFixture } from '@/features/content/__fixtures__';
import { injectPerplexity } from '@/features/content/injectors/Perplexity';

const PROMPT = 'Summarize the following article.\n\nFirst paragraph.\nSecond paragraph.';

/* jsdom implements neither DataTransfer nor ClipboardEvent */
class FakeDataTransfer {
  private readonly data = new Map<string, string>();

  setData(type: string, value: string) {
    this.data.set(type, value);
  }

  getData(type: string) {
    return this.data.get(type) ?? '';
  }
}

class FakeClipboardEvent extends Event {
  readonly clipboardData: FakeDataTransfer | null;

  constructor(type: string, init?: EventInit & { clipboardData?: FakeDataTransfer }) {
    super(type, init);
    this.clipboardData = init?.clipboardData ?? null;
  }
}

describe('injectPerplexity', () => {
  let execCommand: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    (globalThis as any).DataTransfer = FakeDataTransfer;
    (globalThis as any).ClipboardEvent = FakeClipboardEvent;
    execCommand = jest.fn(() => true);
    /* jsdom does not implement execCommand */
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    /* The Lexical composer of perplexity.ai, captured with text typed in so that Submit is rendered */
    loadFixture('perplexity-composer');
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).DataTransfer;
    delete (globalThis as any).ClipboardEvent;
  });

  const run = async () => {
    const result = injectPerplexity(PROMPT);
    await jest.runAllTimersAsync();
    return result;
  };

  const editor = () => document.querySelector<HTMLElement>('#ask-input')!;

  const watchSubmitClicks = () => {
    const onClick = jest.fn();
    document.querySelector('button[aria-label="Submit"]')!.addEventListener('click', onClick);
    return onClick;
  };

  it('reports pasting, then sending', async () => {
    watchSubmitClicks();
    const onStage = jest.fn();

    const result = injectPerplexity(PROMPT, { onStage });
    await jest.runAllTimersAsync();
    await result;

    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['pasting', 'sending']);
  });

  it('keeps the pasted text when the editor accepts the paste', async () => {
    /* Lexical renders each pasted line as its own paragraph, so textContent loses the line breaks */
    editor().addEventListener('paste', event => {
      event.preventDefault();
      const text = (event as unknown as FakeClipboardEvent).clipboardData?.getData('text/plain') ?? '';
      editor().innerHTML = text
        .split('\n')
        .map(line => `<p>${line}</p>`)
        .join('');
    });
    const onSubmitClick = watchSubmitClicks();

    await expect(run()).resolves.toEqual({ success: true });

    expect(execCommand).not.toHaveBeenCalledWith('insertText', false, PROMPT);
    expect(onSubmitClick).toHaveBeenCalledTimes(1);
  });

  it('types the prompt through execCommand when the paste inserts nothing', async () => {
    /* Firefox for Android delivers the synthetic paste with an empty clipboard, so Lexical inserts nothing */
    editor().addEventListener('paste', event => event.preventDefault());
    const onSubmitClick = watchSubmitClicks();

    await expect(run()).resolves.toEqual({ success: true });

    expect(execCommand).toHaveBeenCalledWith('insertText', false, PROMPT);
    expect(onSubmitClick).toHaveBeenCalledTimes(1);
  });
});
