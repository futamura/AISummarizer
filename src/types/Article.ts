import { ArticleRecord } from '@/db';

export interface ArticleExtractionResult {
  title: string | null;
  url: string | null;
  content: string | null;
  isSuccess: boolean;
  error?: Error | null;
}

export interface ArticleInjectionResult {
  success: boolean;
  error?: Error | undefined;
}

// Function implementation
export function formatArticleForClipboard(article: ArticleRecord | ArticleExtractionResult, prompt: string): string {
  /* Fill the placeholders the same way createPrompt does for the AI services */
  return prompt
    .replace('{title}', article.title ?? '')
    .replace('{url}', article.url ?? '')
    .replace('{content}', article.content ?? '');
}
