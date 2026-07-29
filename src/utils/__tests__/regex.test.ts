import { STORAGE_KEYS } from '@/constants';
import { DEFAULT_SETTINGS } from '@/stores';
import { escapeRegExp, escapeRegExpArray, isExtractionDenylistUrl } from '@/utils';

const storageGetMock = jest.fn();

beforeAll(() => {
  /* Mock the chrome extension APIs used by isExtractionDenylistUrl at call time */
  Object.assign(globalThis, {
    chrome: {
      storage: {
        local: {
          get: storageGetMock,
          set: jest.fn(),
          remove: jest.fn(),
        },
      },
      runtime: {
        sendMessage: jest.fn(),
      },
    },
  });
});

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

  describe('isExtractionDenylistUrl', () => {
    describe('with the default denylist', () => {
      beforeEach(() => {
        /* Empty storage makes isExtractionDenylistUrl fall back to DEFAULT_SETTINGS */
        storageGetMock.mockResolvedValue({});
      });

      it('should contain only valid regular expression patterns', () => {
        const patterns = DEFAULT_SETTINGS.extractionDenylist
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('#'));
        for (const pattern of patterns) {
          expect(() => new RegExp(pattern)).not.toThrow();
        }
      });

      it.each([
        'https://www.google.com/search?q=foo',
        'https://www.google.co.jp/search?q=foo',
        'https://www.google.com',
        'https://search.yahoo.co.jp/search?p=foo',
        'https://mail.google.com/mail/u/0/',
        'https://docs.google.com/document/d/abc/edit',
        'https://www.costco.com/',
        'https://x.com/user/status/1',
        'https://m.facebook.com/story.php',
        'https://www.amazon.co.jp/dp/B000000000',
        'https://duckduckgo.com/?q=foo',
        'https://mail.yahoo.co.jp/',
        'https://shopping.yahoo.co.jp/category/1',
        'https://auctions.yahoo.co.jp/item/abc',
        'https://notebooklm.google.com/notebook/abc',
        'https://outlook.live.com/mail/0/',
        'https://outlook.office.com/mail/',
        'https://teams.microsoft.com/v2/',
        'https://login.microsoftonline.com/common/oauth2',
        'https://copilot.microsoft.com/',
        'https://poe.com/ChatGPT',
        'https://www.netflix.com/title/123',
        'https://open.spotify.com/track/abc',
        'https://www.twitch.tv/somechannel',
        'https://abema.tv/now-on-air/abema-news',
        'http://localhost/',
        'http://localhost:3000/app',
        'https://localhost:8443',
        'http://127.0.0.1:8080/admin',
        'https://192.168.1.10/status',
        'http://[::1]:3000/',
      ])('should block %s', async url => {
        expect(await isExtractionDenylistUrl(url)).toBe(true);
      });

      it.each([
        'https://news.yahoo.co.jp/articles/abc',
        'https://developers.google.com/web/updates',
        'https://blog.google/technology/ai/',
        'https://example.com/article',
        'https://google.example-blog.com/article',
        'https://qiita.com/user/items/abc',
        'https://localhost-tools.example.com/article',
        'https://news.microsoft.com/ja-jp/some-article',
        'https://support.microsoft.com/ja-jp/windows',
        'https://newsroom.spotify.com/2026-01-01/some-article',
      ])('should not block %s', async url => {
        expect(await isExtractionDenylistUrl(url)).toBe(false);
      });

      it('should treat an empty URL as invalid', async () => {
        expect(await isExtractionDenylistUrl(undefined)).toBe(true);
        expect(await isExtractionDenylistUrl('')).toBe(true);
      });
    });

    describe('with a user-defined denylist', () => {
      const setDenylist = (extractionDenylist: string) => {
        storageGetMock.mockResolvedValue({
          [STORAGE_KEYS.SETTINGS]: { state: { extractionDenylist }, version: 1 },
        });
      };

      it('should skip invalid patterns without throwing', async () => {
        setDenylist('(unclosed\nexample\\.com');
        expect(await isExtractionDenylistUrl('https://example.com/')).toBe(true);
        expect(await isExtractionDenylistUrl('https://other.org/')).toBe(false);
      });

      it('should ignore comment lines and empty lines', async () => {
        setDenylist('/** comment */\n// comment\n# comment\n\nexample\\.com');
        expect(await isExtractionDenylistUrl('https://example.com/')).toBe(true);
        expect(await isExtractionDenylistUrl('https://comment.org/')).toBe(false);
      });
    });
  });
});
