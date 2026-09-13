/**
 * @jest-environment jsdom
 */
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
    /* Lexical editor markup as observed on perplexity.ai (2026-09-13); an empty editor holds one empty paragraph */
    document.body.innerHTML = '<div id="ask-input" contenteditable="true"><p><br></p></div><button aria-label="Submit"></button>';
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).DataTransfer;
    delete (globalThis as any).ClipboardEvent;
    document.body.innerHTML = '';
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
