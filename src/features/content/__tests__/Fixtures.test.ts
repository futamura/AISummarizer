import { listFixtureFiles, parseFixtureMeta, readFixtureFile } from '@/features/content/__fixtures__';

/*
 * Guards against personal data leaking into the captured fixtures, which live in a public repo.
 * scripts/fixtures/capture.js already removes these; this catches a fixture saved without it or
 * a sanitizer regression. Account names cannot be listed here, so pass them locally through
 * FIXTURE_DENYLIST (comma separated), as described in scripts/fixtures/README.md.
 */
const files = listFixtureFiles();

const denylist = (process.env.FIXTURE_DENYLIST ?? '')
  .split(',')
  .map(word => word.trim())
  .filter(Boolean);

const LEAK_PATTERNS: [string, RegExp][] = [
  ['email addresses', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['UUIDs', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  ['JWTs', /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/],
  ['scripts', /<script/i],
  ['inline styles', /\sstyle="/i],
  ['URL attributes', /\s(?:src|srcset|href|action|poster)="/i],
  ['X avatar handles', /UserAvatar-Container-(?!REDACTED)/],
  /* Markup other extensions add to every page: not the site's DOM, and it reveals the capturer's extensions */
  ['markup from browser extensions', /<(?:deepl|protonpass|plasmo)-|\sdata-(?:darkreader|dl-)|class="translatetweet"/i],
];

/* Same rule as the sanitizer: long words with several digits are tokens or ids */
const findTokens = (html: string): string[] => (html.match(/[A-Za-z0-9_-]{32,}/g) ?? []).filter(word => (word.match(/\d/g) ?? []).length >= 4);

describe('captured fixtures', () => {
  it('exist', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(files)('%s', file => {
    const html = readFixtureFile(file);

    it('starts with a header naming the fixture, its source and the capture date', () => {
      const meta = parseFixtureMeta(html);
      expect(meta).not.toBeNull();
      expect(`${meta?.name}.html`).toBe(file);
      expect(meta?.source).toMatch(/^https:\/\//);
    });

    it.each(LEAK_PATTERNS)('carries no %s', (_, pattern) => {
      expect(html).not.toMatch(pattern);
    });

    it('carries only excerpts of long texts', () => {
      const longTexts = (html.match(/>[^<]{201,}</g) ?? []).map(text => text.slice(1, 60));
      expect(longTexts).toEqual([]);
    });

    it('carries no token-like strings', () => {
      expect(findTokens(html)).toEqual([]);
    });

    it('carries none of the words in FIXTURE_DENYLIST', () => {
      const found = denylist.filter(word => html.toLowerCase().includes(word.toLowerCase()));
      expect(found).toEqual([]);
    });
  });
});
