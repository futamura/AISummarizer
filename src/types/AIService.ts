export const AI_SERVICE_QUERY_KEY = 'aismid';

export enum AIService {
  CHATGPT = 'CHATGPT',
  GEMINI = 'GEMINI',
  AI_STUDIO = 'AI_STUDIO',
  CLAUDE = 'CLAUDE',
  GROK = 'GROK',
  PERPLEXITY = 'PERPLEXITY',
  DEEPSEEK = 'DEEPSEEK',
}

export interface AIServiceModelOption {
  /* Label shown in the options UI */
  label: string;
  /* URL parameter slug, or the picker label substring for DOM-operated services */
  value: string;
}

const AI_SERVICE_MODEL_OPTIONS: { [key in AIService]: AIServiceModelOption[] } = {
  [AIService.CHATGPT]: [],
  [AIService.GEMINI]: [
    { label: 'Flash-Lite', value: 'Flash-Lite' },
    { label: 'Flash', value: 'Flash' },
    { label: 'Pro', value: 'Pro' },
  ],
  [AIService.AI_STUDIO]: [
    { label: 'Gemini 3 Flash Preview', value: 'gemini-3-flash-preview' },
    { label: 'Gemini 3.1 Pro Preview', value: 'gemini-3.1-pro-preview' },
  ],
  [AIService.CLAUDE]: [
    { label: 'Fable 5', value: 'claude-fable-5' },
    { label: 'Opus 5', value: 'claude-opus-5' },
    { label: 'Sonnet 5', value: 'claude-sonnet-5' },
    { label: 'Haiku 4.5', value: 'claude-haiku-4-5' },
  ],
  [AIService.GROK]: [],
  [AIService.PERPLEXITY]: [],
  [AIService.DEEPSEEK]: [
    { label: 'Instant', value: 'Instant' },
    { label: 'Expert', value: 'Expert' },
    { label: 'Vision', value: 'Vision' },
  ],
};

const MODEL_PARAM_SERVICES: AIService[] = [AIService.CHATGPT, AIService.CLAUDE, AIService.AI_STUDIO];
const MODEL_DOM_SERVICES: AIService[] = [AIService.GEMINI, AIService.DEEPSEEK];

export const getModelOptionsFor = (service: AIService): AIServiceModelOption[] => AI_SERVICE_MODEL_OPTIONS[service];

export const supportsModelParam = (service: AIService): boolean => MODEL_PARAM_SERVICES.includes(service);

export const supportsModelSelection = (service: AIService): boolean => MODEL_PARAM_SERVICES.includes(service) || MODEL_DOM_SERVICES.includes(service);

export const getSummarizeUrl = (service: AIService, summarizeId: string, model?: string) => {
  /* Model is applied via URL parameter only where the service supports it; DOM-operated services handle it in their injector */
  const modelParam = model && supportsModelParam(service) ? `&model=${encodeURIComponent(model)}` : '';
  switch (service) {
    case AIService.CHATGPT:
      return `https://chatgpt.com/?${AI_SERVICE_QUERY_KEY}=${summarizeId}${modelParam}`;
    case AIService.GEMINI:
      return `https://gemini.google.com/app?${AI_SERVICE_QUERY_KEY}=${summarizeId}`;
    case AIService.AI_STUDIO:
      return `https://aistudio.google.com/prompts/new_chat?${AI_SERVICE_QUERY_KEY}=${summarizeId}${modelParam}`;
    case AIService.CLAUDE:
      return `https://claude.ai/new?${AI_SERVICE_QUERY_KEY}=${summarizeId}${modelParam}`;
    case AIService.GROK:
      return `https://grok.com/?${AI_SERVICE_QUERY_KEY}=${summarizeId}`;
    case AIService.PERPLEXITY:
      return `https://www.perplexity.ai/?${AI_SERVICE_QUERY_KEY}=${summarizeId}`;
    case AIService.DEEPSEEK:
      return `https://chat.deepseek.com/?${AI_SERVICE_QUERY_KEY}=${summarizeId}`;
  }
};

export const getAIServiceForUrl = (url: string): AIService => {
  if (/^https?:\/\/(?:www\.)?(chatgpt\.com)/.test(url)) {
    return AIService.CHATGPT;
  } else if (/^https?:\/\/(?:www\.)?(gemini\.google\.com)/.test(url)) {
    return AIService.GEMINI;
  } else if (/^https?:\/\/(?:www\.)?(aistudio\.google\.com)/.test(url)) {
    return AIService.AI_STUDIO;
  } else if (/^https?:\/\/(?:www\.)?((claude\.com)|(claude\.ai))/.test(url)) {
    return AIService.CLAUDE;
  } else if (/^https?:\/\/(?:www\.)?(grok\.com)/.test(url)) {
    return AIService.GROK;
  } else if (/^https?:\/\/(?:www\.)?(perplexity\.ai)/.test(url)) {
    return AIService.PERPLEXITY;
  } else if (/^https?:\/\/(?:www|chat\.)?(deepseek\.com)/.test(url)) {
    return AIService.DEEPSEEK;
  } else {
    throw new Error(`Invalid AI service URL: ${url}`);
  }
};

export const getAIServiceFromString = (id: string): AIService => {
  switch (id.toLowerCase()) {
    case 'chatgpt':
      return AIService.CHATGPT;
    case 'gemini':
      return AIService.GEMINI;
    case 'aistudio':
      return AIService.AI_STUDIO;
    case 'claude':
      return AIService.CLAUDE;
    case 'grok':
      return AIService.GROK;
    case 'perplexity':
      return AIService.PERPLEXITY;
    case 'deepseek':
      return AIService.DEEPSEEK;
    default:
      throw new Error(`Invalid AI service ID: ${id}`);
  }
};

export const getAIServiceLabel = (service: AIService): string => {
  switch (service) {
    case AIService.CHATGPT:
      return 'ChatGPT';
    case AIService.GEMINI:
      return 'Gemini';
    case AIService.AI_STUDIO:
      return 'AI Studio';
    case AIService.CLAUDE:
      return 'Claude';
    case AIService.GROK:
      return 'Grok';
    case AIService.PERPLEXITY:
      return 'Perplexity';
    case AIService.DEEPSEEK:
      return 'DeepSeek';
  }
};
