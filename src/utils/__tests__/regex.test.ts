import { escapeRegExp, escapeRegExpArray, getDesktopYoutubeUrl, isAIServiceUrl, isInvalidUrl } from '@/utils';

describe('regex utils', () => {
  describe('escapeRegExp', () => {
    it('should escape special characters', () => {
      expect(escapeRegExp('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
    });

    it('should not escape normal characters', () => {
      expect(escapeRegExp('abc123')).toBe('abc123');
    });
  });

  describe('escapeRegExpArray', () => {
    it('should escape all strings in array', () => {
      const input = ['abc', '.*+', '123'];
      const expected = ['abc', '\\.\\*\\+', '123'];
      expect(escapeRegExpArray(input)).toEqual(expected);
    });

    it('should handle empty array', () => {
      expect(escapeRegExpArray([])).toEqual([]);
    });
  });

  describe('isAIServiceUrl', () => {
    it('returns true for kimi.ai with query parameter', () => {
      expect(isAIServiceUrl('https://www.kimi.ai/?aismid=42')).toBe(true);
    });

    it('returns true for kimi.ai without path', () => {
      expect(isAIServiceUrl('https://kimi.ai/')).toBe(true);
    });

    it('returns true for kimi.com with query parameter', () => {
      expect(isAIServiceUrl('https://www.kimi.com/?aismid=42')).toBe(true);
    });

    it('returns true for kimi.com with path', () => {
      expect(isAIServiceUrl('https://kimi.com/chat/abc')).toBe(true);
    });

    it('returns true for the other service hosts', () => {
      expect(isAIServiceUrl('https://chatgpt.com/?aismid=42')).toBe(true);
      expect(isAIServiceUrl('https://gemini.google.com/app')).toBe(true);
      expect(isAIServiceUrl('https://aistudio.google.com/prompts/new_chat')).toBe(true);
      expect(isAIServiceUrl('https://claude.ai/new')).toBe(true);
      expect(isAIServiceUrl('https://grok.com/')).toBe(true);
      expect(isAIServiceUrl('https://www.perplexity.ai/')).toBe(true);
      expect(isAIServiceUrl('https://chat.deepseek.com/')).toBe(true);
      expect(isAIServiceUrl('https://chat.qwen.ai/')).toBe(true);
    });

    it('returns false for non-AI service URLs', () => {
      expect(isAIServiceUrl('https://example.com/article')).toBe(false);
    });

    it('returns false when a service name only appears in the path or the query', () => {
      expect(isAIServiceUrl('https://example.com/claude.ai')).toBe(false);
      expect(isAIServiceUrl('https://example.com/?ref=perplexity.ai')).toBe(false);
    });

    it('returns false for hosts that merely start or end with a service host', () => {
      expect(isAIServiceUrl('https://chatgpt.com.example.com/')).toBe(false);
      expect(isAIServiceUrl('https://notchatgpt.com/')).toBe(false);
    });

    it('returns false for subdomains that are not service hosts', () => {
      expect(isAIServiceUrl('https://docs.claude.ai/')).toBe(false);
      expect(isAIServiceUrl('https://mail.google.com/')).toBe(false);
    });

    it('returns false for non-http schemes and malformed URLs', () => {
      expect(isAIServiceUrl('file:///Users/me/chatgpt.com')).toBe(false);
      expect(isAIServiceUrl('not a url')).toBe(false);
    });
  });

  describe('getDesktopYoutubeUrl', () => {
    it.each([
      ['https://m.youtube.com/watch?v=arj7oStGLkU', 'https://www.youtube.com/watch?v=arj7oStGLkU&app=desktop'],
      ['https://m.youtube.com/watch?feature=share&v=arj7oStGLkU&t=42s', 'https://www.youtube.com/watch?v=arj7oStGLkU&app=desktop'],
      ['https://m.youtube.com/shorts/arj7oStGLkU', 'https://www.youtube.com/watch?v=arj7oStGLkU&app=desktop'],
      ['http://m.youtube.com/watch?v=arj7oStGLkU', 'https://www.youtube.com/watch?v=arj7oStGLkU&app=desktop'],
    ])('converts the mobile video page %s', (url, expected) => {
      expect(getDesktopYoutubeUrl(url)).toBe(expected);
    });

    it.each([
      'https://www.youtube.com/watch?v=arj7oStGLkU',
      'https://www.youtube.com/watch?v=arj7oStGLkU&app=desktop',
      'https://youtu.be/arj7oStGLkU',
      'https://m.youtube.com/',
      'https://m.youtube.com/results?search_query=ted',
      'https://m.youtube.com/watch?v=short',
      'https://m.youtube.com.example.com/watch?v=arj7oStGLkU',
      'https://example.com/watch?v=arj7oStGLkU',
      'not a url',
      undefined,
    ])('returns null for %s', url => {
      expect(getDesktopYoutubeUrl(url)).toBeNull();
    });
  });

  describe('isInvalidUrl', () => {
    /* The user asked for the summary, so no site is refused any more */
    it('accepts pages the extraction denylist used to block', async () => {
      expect(await isInvalidUrl('https://www.amazon.co.jp/dp/B0DEXAMPLE')).toBe(false);
      expect(await isInvalidUrl('https://www.google.com/search?q=summary')).toBe(false);
    });

    it('rejects AI service, browser, extension and non-http pages', async () => {
      expect(await isInvalidUrl('https://chatgpt.com/')).toBe(true);
      expect(await isInvalidUrl('chrome://newtab/')).toBe(true);
      expect(await isInvalidUrl('moz-extension://abcdefghijklmnop/options.html')).toBe(true);
      expect(await isInvalidUrl(undefined)).toBe(true);
    });
  });
});
