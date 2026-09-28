/**
 * @jest-environment jsdom
 */
import { loadFixture } from '@/features/content/__fixtures__';
import { extractX, isXStatusUrl } from '@/features/content/extractors/X';

/* Markup trimmed down from live post pages of X, for the cases the captured fixtures do not cover */
const post = ({ handle, name, text, time, main = false }: { handle: string; name: string; text: string; time: string; main?: boolean }) => `
  <article data-testid="tweet" tabindex="${main ? '-1' : '0'}">
    <div data-testid="User-Name"><span>${name}</span><span>${handle}</span></div>
    <time datetime="${time}">1h</time>
    <div data-testid="tweetText"><span>${text}</span></div>
    <button aria-label="Like">12</button>
  </article>
`;

const quotingPost = `
  <article data-testid="tweet" tabindex="-1">
    <div data-testid="User-Name"><span>Main Author</span><span>@main_author</span></div>
    <time datetime="2026-09-20T13:18:57.000Z">1h</time>
    <div data-testid="tweetText"><span>Quoting post body.</span></div>
    <div role="link">
      <div data-testid="User-Name"><span>Quoted Author</span><span>@quoted_author</span><span>·9h</span></div>
      <time datetime="2026-09-20T11:32:51.000Z">9h</time>
      <div data-testid="tweetText"><span>Quoted post body.</span></div>
    </div>
  </article>
`;

const articleView = `
  <div data-testid="User-Name"><span>Article Author</span><span>@article_author</span></div>
  <div data-testid="twitterArticleReadView">
    <h1 data-testid="twitter-article-title">Article title</h1>
    <div data-testid="twitterArticleRichTextView">
      <div><span>First paragraph.</span></div>
      <h2><span>A heading</span></h2>
      <div><span>Second paragraph.</span></div>
      <button>Show more</button>
    </div>
  </div>
`;

describe('isXStatusUrl', () => {
  it.each([
    'https://x.com/user/status/1234567890',
    'https://www.x.com/user/status/1234567890',
    'https://mobile.x.com/user/status/1234567890',
    'https://twitter.com/user/status/1234567890',
    'https://x.com/user/status/1234567890?s=20',
    'https://x.com/user/status/1234567890/photo/1',
  ])('matches %s', url => {
    expect(isXStatusUrl(url)).toBe(true);
  });

  it.each(['https://x.com/', 'https://x.com/home', 'https://x.com/user', 'https://x.com/i/bookmarks', 'https://example.com/user/status/1'])(
    'does not match %s',
    url => {
      expect(isXStatusUrl(url)).toBe(false);
    }
  );
});

describe('extractX', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  /* extractX polls for the post before reading it, so the waiting has to be run through */
  const run = async () => {
    const result = extractX(document);
    await jest.runAllTimersAsync();
    return result;
  };

  it('extracts a captured post with its self reply and leaves out the other replies and the translation', async () => {
    loadFixture('x-post');

    const result = await run();

    expect(result.isSuccess).toBe(true);
    expect(result.title).toBe('Developers (@XDevelopers): X Livestream API has been rebuilt from the ground up. Your entire broadcast life…');
    expect(result.content).toBe(
      [
        'Developers (@XDevelopers) · 2026-09-22T23:06:31.000Z',
        'X Livestream API has been rebuilt from the ground up.',
        'Your entire broadcast lifecycle on X can now be powered by our AP…',
        'Developers (@XDevelopers) · 2026-09-22T23:06:32.000Z',
        'Check out our official docs here:',
      ].join('\n')
    );
    /* X shows a machine translation under the post for the signed-in user's language */
    expect(result.content).not.toContain('ゼロから');
  });

  it('keeps the posts of a self thread around the main post', async () => {
    document.body.innerHTML = [
      post({ handle: '@main_author', name: 'Main Author', text: 'First post.', time: '2026-09-20T13:00:00.000Z' }),
      post({ handle: '@main_author', name: 'Main Author', text: 'Second post.', time: '2026-09-20T13:18:57.000Z', main: true }),
      post({ handle: '@main_author', name: 'Main Author', text: 'Third post.', time: '2026-09-20T13:20:00.000Z' }),
      post({ handle: '@someone_else', name: 'Someone Else', text: 'A reply.', time: '2026-09-20T13:30:00.000Z' }),
      post({ handle: '@main_author', name: 'Main Author', text: 'A recommendation.', time: '2026-09-19T10:00:00.000Z' }),
    ].join('');

    const result = await run();

    expect(result.content).toContain('First post.');
    expect(result.content).toContain('Second post.');
    expect(result.content).toContain('Third post.');
    expect(result.content).not.toContain('A reply.');
    /* The recommendations below the replies are cut off with them */
    expect(result.content).not.toContain('A recommendation.');
  });

  it('keeps the quoted post as a quotation and credits its author', async () => {
    document.body.innerHTML = quotingPost;

    const result = await run();

    expect(result.title).toBe('Main Author (@main_author): Quoting post body.');
    expect(result.content).toBe(
      [
        'Main Author (@main_author) · 2026-09-20T13:18:57.000Z',
        'Quoting post body.',
        '> Quoted Author (@quoted_author) · 2026-09-20T11:32:51.000Z',
        '> Quoted post body.',
      ].join('\n')
    );
  });

  it('extracts a captured long-form post with its title, author and paragraphs', async () => {
    loadFixture('x-article');

    const result = await run();

    expect(result.isSuccess).toBe(true);
    expect(result.title).toBe('X achieves TAG Brand Safety Certification');
    expect(result.content).toMatch(/^X achieves TAG Brand Safety Certification\nSafety \(@Safety\)\nOver the past 18 months, /);
    expect(result.content).toContain('\nFor our customers, we have deployed every single brand control');
    /* Engagement counts and the upgrade prompt of the read view are interface, not content */
    expect(result.content).not.toMatch(/プレミアム|件の表示/);
  });

  it('extracts a long-form post with its block structure', async () => {
    document.body.innerHTML = articleView;

    const result = await run();

    expect(result.isSuccess).toBe(true);
    expect(result.title).toBe('Article title');
    expect(result.content).toBe(['Article title', 'Article Author (@article_author)', 'First paragraph.', 'A heading', 'Second paragraph.'].join('\n'));
    /* Buttons carry interface labels rather than content */
    expect(result.content).not.toContain('Show more');
  });

  it('fails when the page carries no post', async () => {
    document.body.innerHTML = '<div>Nothing here</div>';

    const result = await run();

    expect(result.isSuccess).toBe(false);
    expect(result.content).toBeNull();
  });
});
