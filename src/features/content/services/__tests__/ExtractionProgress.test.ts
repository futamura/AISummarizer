/* Import the module directly: the services barrel pulls in the extractors (pdfjs-dist, Readability) */
import { extractWithProgress } from '@/features/content/services/ExtractionProgress';
import type { ArticleExtractionResult } from '@/types';

const SUCCESS: ArticleExtractionResult = { isSuccess: true, title: 'title', url: 'https://example.com/', content: 'content', error: null };
const FAILURE: ArticleExtractionResult = { isSuccess: false, title: null, url: 'https://example.com/', content: null, error: new Error('failed') };

const createToasts = () => ({
  showProgress: jest.fn(() => 'progress-id'),
  dismissProgress: jest.fn(),
  showFailure: jest.fn(),
});

/* An extraction the test settles by hand, so that the test decides how long it takes */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('extractWithProgress', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows no progress toast for an extraction that ends within the delay', async () => {
    const toasts = createToasts();
    const extraction = deferred<ArticleExtractionResult>();
    const result = extractWithProgress(() => extraction.promise, toasts, 500);

    jest.advanceTimersByTime(499);
    extraction.resolve(SUCCESS);
    await expect(result).resolves.toBe(SUCCESS);
    jest.advanceTimersByTime(1000);

    expect(toasts.showProgress).not.toHaveBeenCalled();
    expect(toasts.dismissProgress).not.toHaveBeenCalled();
    expect(toasts.showFailure).not.toHaveBeenCalled();
  });

  it('shows the progress toast after the delay and dismisses it when the extraction ends', async () => {
    const toasts = createToasts();
    const extraction = deferred<ArticleExtractionResult>();
    const result = extractWithProgress(() => extraction.promise, toasts, 500);

    jest.advanceTimersByTime(500);
    expect(toasts.showProgress).toHaveBeenCalledTimes(1);
    expect(toasts.dismissProgress).not.toHaveBeenCalled();

    extraction.resolve(SUCCESS);
    await expect(result).resolves.toBe(SUCCESS);

    expect(toasts.dismissProgress).toHaveBeenCalledWith('progress-id');
    expect(toasts.showFailure).not.toHaveBeenCalled();
  });

  it('shows the failure toast when the extraction fails', async () => {
    const toasts = createToasts();

    await expect(extractWithProgress(() => Promise.resolve(FAILURE), toasts, 500)).resolves.toBe(FAILURE);

    expect(toasts.showFailure).toHaveBeenCalledTimes(1);
  });

  it('dismisses the progress toast and reports a failure when the extraction throws', async () => {
    const toasts = createToasts();
    const extraction = deferred<ArticleExtractionResult>();
    const result = extractWithProgress(() => extraction.promise, toasts, 500);

    jest.advanceTimersByTime(500);
    extraction.reject(new Error('boom'));
    const article = await result;

    expect(article.isSuccess).toBe(false);
    expect(article.error?.message).toBe('boom');
    expect(toasts.dismissProgress).toHaveBeenCalledWith('progress-id');
    expect(toasts.showFailure).toHaveBeenCalledTimes(1);
  });
});
