/* The steps an injector goes through, shown to the user as progress toasts */
export type InjectionStage = 'selectingModel' | 'pasting' | 'sending';

export type StageReporter = (stage: InjectionStage) => void;

/* Called with the model when the page offers no choice for it; the injection then goes on with the page's current model */
export type ModelUnavailableReporter = (model: string) => void;

export interface InjectOptions {
  /* The model to select first, for the services that offer a choice */
  model?: string;
  onStage?: StageReporter;
  onModelUnavailable?: ModelUnavailableReporter;
}

export const noopStageReporter: StageReporter = () => undefined;

export const noopModelUnavailableReporter: ModelUnavailableReporter = () => undefined;
