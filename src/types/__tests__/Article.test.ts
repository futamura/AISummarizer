import { formatArticleForClipboard } from '@/types';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

afterEach(() => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
  } else {
    delete (globalThis as { navigator?: unknown }).navigator;
  }
});

describe('formatArticleForClipboard', () => {
  it('asks for the summary in the browser language', () => {
    Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true, writable: true });

    const text = formatArticleForClipboard({
      title: 'Example title',
      url: 'https://example.com/article',
      content: 'Example content',
      isSuccess: true,
    });

    expect(text).toContain('summarize the main points in French.');
    expect(text).not.toContain('Japanese');
    expect(text).toContain('# Title\nExample title');
    expect(text).toContain('# URL\nhttps://example.com/article');
    expect(text).toContain('# Content\nExample content');
  });
});
