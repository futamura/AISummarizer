/* The steps an injector goes through, shown to the user as progress toasts */
export type InjectionStage = 'selectingModel' | 'pasting' | 'sending';

export type StageReporter = (stage: InjectionStage) => void;

export interface InjectOptions {
  /* The model to select first, for the services that offer a choice */
  model?: string;
  onStage?: StageReporter;
}

export const noopStageReporter: StageReporter = () => undefined;
