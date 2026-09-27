import type { ArticleExtractionResult } from '@/types';

/* The toasts shown around an extraction, passed in so that this logic runs without React */
export interface ExtractionToasts {
  /* Shows the progress toast and returns its id */
  showProgress: () => string;
  dismissProgress: (id: string) => void;
  showFailure: () => void;
}

/* Readability usually finishes well within this, so the progress toast only appears for YouTube and PDFs */
export const EXTRACTION_PROGRESS_DELAY_MS = 500;

/**
 * Run an extraction, showing a progress toast when it takes longer than the delay
 * and a failure toast when it does not succeed
 * @param extract - The extraction to run
 * @param toasts - The toasts to show
 * @param delayMs - How long to wait before showing the progress toast
 * @returns The extraction result; an exception is turned into a failed result
 */
export async function extractWithProgress(
  extract: () => Promise<ArticleExtractionResult>,
  toasts: ExtractionToasts,
  delayMs: number = EXTRACTION_PROGRESS_DELAY_MS
): Promise<ArticleExtractionResult> {
  let progressId: string | null = null;
  const timer = setTimeout(() => {
    progressId = toasts.showProgress();
  }, delayMs);

  let result: ArticleExtractionResult;
  try {
    result = await extract();
  } catch (error: unknown) {
    result = {
      isSuccess: false,
      title: null,
      url: null,
      content: null,
      error: error instanceof Error ? error : new Error('Failed to extract article'),
    };
  } finally {
    clearTimeout(timer);
    if (progressId !== null) toasts.dismissProgress(progressId);
  }

  if (!result.isSuccess) toasts.showFailure();
  return result;
}
