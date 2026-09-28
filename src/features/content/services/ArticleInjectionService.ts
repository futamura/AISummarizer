import {
  injectAIStudio,
  injectChatGPT,
  injectClaude,
  injectDeepSeek,
  injectGemini,
  injectGrok,
  injectKimi,
  injectPerplexity,
  injectQwen,
} from '@/features/content/injectors';
import { AIService, ArticleInjectionResult, getAIServiceForUrl, InjectOptions } from '@/types';
import { isAIServiceUrl, logger } from '@/utils';

const injectors: Record<AIService, (prompt: string, options?: InjectOptions) => Promise<{ success: boolean; error?: Error }>> = {
  [AIService.CHATGPT]: injectChatGPT,
  [AIService.GEMINI]: injectGemini,
  [AIService.AI_STUDIO]: injectAIStudio,
  [AIService.CLAUDE]: injectClaude,
  [AIService.GROK]: injectGrok,
  [AIService.PERPLEXITY]: injectPerplexity,
  [AIService.DEEPSEEK]: injectDeepSeek,
  [AIService.KIMI]: injectKimi,
  [AIService.QWEN]: injectQwen,
};

export class ArticleInjectionService {
  async execute(serviceUrl: string, prompt: string, options: InjectOptions = {}): Promise<ArticleInjectionResult> {
    logger.debug('🧑‍🍳📖', '[ArticleInjectionService.tsx]', '[execute]', 'Injecting...', '\nserviceUrl:', serviceUrl);

    /**
     * Skip processing for browser-specific URLs
     */
    if (!isAIServiceUrl(serviceUrl)) {
      logger.warn('🧑‍🍳📖', '[ArticleInjectionService.tsx]', '[execute]', 'Skipping injection for invalid URLs', serviceUrl);
      return {
        success: false,
        error: new Error('Skipping injection for invalid URLs'),
      };
    }

    /**
     * Inject the article into the AI service
     */
    const service = getAIServiceForUrl(serviceUrl);
    const injector = injectors[service];
    if (injector) {
      logger.debug('🧑‍🍳📖', '[ArticleInjectionService.tsx]', '[execute]', 'Injecting article into', service);
      try {
        return await injector(prompt, options);
      } catch (error: any) {
        logger.error('🧑‍🍳📖', '[ArticleInjectionService.tsx]', '[execute]', 'Failed to inject article into', service, ':', error);
        return {
          success: false,
          error: error instanceof Error ? error : new Error(`Failed to inject article into ${service}`),
        };
      }
    }

    return {
      success: false,
      error: new Error('Invalid service URL'),
    };
  }
}
