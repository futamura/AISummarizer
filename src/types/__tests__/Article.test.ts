import { formatArticleForClipboard } from '@/types';

const article = {
  title: 'Example title',
  url: 'https://example.com/article',
  content: 'Example content',
  isSuccess: true,
};

describe('formatArticleForClipboard', () => {
  it('fills the configured prompt instead of a fixed one', () => {
    const prompt = 'Summarize in Japanese.\n\n# Title\n{title}\n\n# URL\n{url}\n\n# Content\n{content}';

    const text = formatArticleForClipboard(article, prompt);

    expect(text).toBe('Summarize in Japanese.\n\n# Title\nExample title\n\n# URL\nhttps://example.com/article\n\n# Content\nExample content');
  });

  it('keeps a prompt without placeholders as is', () => {
    expect(formatArticleForClipboard(article, 'No placeholders')).toBe('No placeholders');
  });
});
