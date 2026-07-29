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
export function formatArticleForClipboard(article: ArticleRecord | ArticleExtractionResult): string {
  return `Extract each theme from the following text without omission and summarize the main points in Japanese.

# Title
${article.title}

# URL
${article.url}

# Content
${article.content}
`;
}
