import type { ArticleInjectionResult, InjectionStage, StageReporter } from '@/types';

/* The toasts shown around an injection, passed in so that this logic runs without React */
export interface InjectionToasts {
  loading: (message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

export const INJECTION_STAGE_MESSAGES: Record<InjectionStage, string> = {
  selectingModel: 'Selecting model…',
  pasting: 'Pasting article…',
  sending: 'Sending article…',
};

export const INJECTION_SUCCESS_MESSAGE = 'Article has been sent!';

/* Each stage replaces the previous one */
export const INJECTION_TOAST_GROUP = 'inject';

/**
 * The failure message for the stage the injection stopped at
 * @param lastStage - The last stage reported, or null when none was
 * @returns The message; model selection never fails the injection, so only sending has its own
 */
export const getInjectionFailureMessage = (lastStage: InjectionStage | null): string =>
  lastStage === 'sending' ? "Couldn't send the message" : "Couldn't paste the article";

/**
 * Run an injection, showing a toast for each stage it reports and one for the result
 * @param inject - The injection, given the callback to report its stages to
 * @param toasts - The toasts to show
 * @returns The injection result; an exception is turned into a failed result
 */
export async function injectWithProgress(
  inject: (onStage: StageReporter) => Promise<ArticleInjectionResult>,
  toasts: InjectionToasts
): Promise<ArticleInjectionResult> {
  let lastStage: InjectionStage | null = null;
  const onStage: StageReporter = stage => {
    if (stage === lastStage) return;
    lastStage = stage;
    toasts.loading(INJECTION_STAGE_MESSAGES[stage]);
  };

  let result: ArticleInjectionResult;
  try {
    result = await inject(onStage);
  } catch (error: unknown) {
    result = { success: false, error: error instanceof Error ? error : new Error('Failed to inject article') };
  }

  if (result.success) toasts.success(INJECTION_SUCCESS_MESSAGE);
  else toasts.error(getInjectionFailureMessage(lastStage));
  return result;
}
