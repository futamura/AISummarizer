/* Import the module directly: the services barrel pulls in the extractors (pdfjs-dist, Readability) */
import { getInjectionFailureMessage, INJECTION_STAGE_MESSAGES, injectWithProgress } from '@/features/content/services/InjectionProgress';
import type { StageReporter } from '@/types';

const createToasts = () => ({ loading: jest.fn(), success: jest.fn(), error: jest.fn() });

describe('injectWithProgress', () => {
  it('shows each stage, then Sent', async () => {
    const toasts = createToasts();

    const result = await injectWithProgress(async (onStage: StageReporter) => {
      onStage('selectingModel');
      onStage('pasting');
      onStage('sending');
      return { success: true };
    }, toasts);

    expect(result).toEqual({ success: true });
    expect(toasts.loading.mock.calls).toEqual([['Selecting model…'], ['Pasting article…'], ['Sending article…']]);
    expect(toasts.success).toHaveBeenCalledWith('Article has been sent!');
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it('shows a stage reported twice in a row once', async () => {
    const toasts = createToasts();

    await injectWithProgress(async onStage => {
      onStage('pasting');
      onStage('pasting');
      onStage('sending');
      return { success: true };
    }, toasts);

    expect(toasts.loading.mock.calls).toEqual([['Pasting article…'], ['Sending article…']]);
  });

  it('says the article could not be pasted when it fails before sending', async () => {
    const toasts = createToasts();
    const error = new Error('ChatGPT container not found');

    const result = await injectWithProgress(async onStage => {
      onStage('pasting');
      return { success: false, error };
    }, toasts);

    expect(result).toEqual({ success: false, error });
    expect(toasts.error).toHaveBeenCalledWith("Couldn't paste the article");
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it('says the message could not be sent when it fails while sending', async () => {
    const toasts = createToasts();

    await injectWithProgress(async onStage => {
      onStage('pasting');
      onStage('sending');
      return { success: false, error: new Error('submit button not found') };
    }, toasts);

    expect(toasts.error).toHaveBeenCalledWith("Couldn't send the message");
  });

  it('turns an exception into a failure, named after the last stage', async () => {
    const toasts = createToasts();

    const result = await injectWithProgress(async onStage => {
      onStage('sending');
      throw new Error('boom');
    }, toasts);

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('boom');
    expect(toasts.error).toHaveBeenCalledWith("Couldn't send the message");
  });

  it('says the article could not be pasted when it fails before any stage, e.g. while building the prompt', async () => {
    const toasts = createToasts();

    const result = await injectWithProgress(async () => {
      throw new Error('Article is not valid');
    }, toasts);

    expect(result.success).toBe(false);
    expect(toasts.loading).not.toHaveBeenCalled();
    expect(toasts.error).toHaveBeenCalledWith("Couldn't paste the article");
  });
});

describe('injection messages', () => {
  it('has the agreed wording', () => {
    expect(INJECTION_STAGE_MESSAGES).toEqual({ selectingModel: 'Selecting model…', pasting: 'Pasting article…', sending: 'Sending article…' });
    expect(getInjectionFailureMessage(null)).toBe("Couldn't paste the article");
    expect(getInjectionFailureMessage('selectingModel')).toBe("Couldn't paste the article");
    expect(getInjectionFailureMessage('pasting')).toBe("Couldn't paste the article");
    expect(getInjectionFailureMessage('sending')).toBe("Couldn't send the message");
  });
});
