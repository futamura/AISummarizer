import { ArticleExtractionResult } from '@/types';
import { logger, normalizeContent, waitForElement } from '@/utils';

/* Single post pages of X, on the current host and on the legacy twitter.com one */
const X_STATUS_URL_PATTERN = /^https?:\/\/(?:(?:www|m|mobile)\.)?(?:x|twitter)\.com\/[^/]+\/status\/\d+/;

/* Long-form posts ("articles") are rendered by a dedicated view instead of the post timeline */
const ARTICLE_VIEW_SELECTOR = '[data-testid="twitterArticleReadView"]';
const ARTICLE_TITLE_SELECTOR = '[data-testid="twitter-article-title"]';
const ARTICLE_BODY_SELECTOR = '[data-testid="twitterArticleRichTextView"]';

const POST_SELECTOR = 'article[data-testid="tweet"]';
/* The post the URL points at is the only one taken out of the tab order */
const MAIN_POST_SELECTOR = 'article[data-testid="tweet"][tabindex="-1"]';
const POST_TEXT_SELECTOR = '[data-testid="tweetText"]';
const USER_NAME_SELECTOR = '[data-testid="User-Name"]';
/* A quoted post is nested inside its quoting post as a link-role container */
const QUOTE_SELECTOR = 'div[role="link"]';

/* Tags that start a new line in the extracted text */
const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TR',
  'UL',
]);

/* Tags whose text is chrome rather than content (engagement counts, icon labels, …) */
const SKIP_TAGS = new Set(['BUTTON', 'NOSCRIPT', 'SCRIPT', 'STYLE', 'SVG', 'TEMPLATE']);

/* Maximum length of the post snippet used as the title */
const TITLE_SNIPPET_LENGTH = 80;

interface XUser {
  name: string;
  handle: string;
}

/**
 * Collect the text of an element, keeping the line breaks its block elements imply.
 * textContent alone would glue paragraphs and headings together.
 * @param node - The node to collect text from
 * @param parts - The accumulator the collected text is pushed to
 */
const collectText = (node: Node, parts: string[]): void => {
  if (node.nodeType === Node.TEXT_NODE) {
    parts.push(node.textContent ?? '');
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  const tagName = element.tagName.toUpperCase();
  if (SKIP_TAGS.has(tagName)) return;
  if (tagName === 'BR') {
    parts.push('\n');
    return;
  }

  const isBlock = BLOCK_TAGS.has(tagName);
  if (isBlock) parts.push('\n');
  element.childNodes.forEach(child => collectText(child, parts));
  if (isBlock) parts.push('\n');
};

/**
 * Extract the text of an element with its block structure preserved
 * @param element - The element to extract text from
 * @returns The extracted text
 */
const extractText = (element: Element | null): string => {
  if (!element) return '';
  const parts: string[] = [];
  collectText(element, parts);
  return parts.join('');
};

/**
 * Tell whether a descendant belongs to a post quoted by the given post
 * @param post - The post element
 * @param element - The descendant to test
 * @returns True when the descendant belongs to a quoted post
 */
const isInQuote = (post: Element, element: Element): boolean => {
  const quote = element.closest(QUOTE_SELECTOR);
  return quote !== null && post.contains(quote);
};

/**
 * Read the display name and the handle out of a user name element.
 * The two are rendered without a separator, so the handle is located by its own pattern.
 * @param userName - The user name element
 * @returns The display name and the handle
 */
const parseUser = (userName: Element | null): XUser => {
  const text = (userName?.textContent ?? '').replace(/\s+/g, ' ');
  const match = text.match(/@[A-Za-z0-9_]{1,15}/);
  if (!match) return { name: text.trim(), handle: '' };
  return { name: text.slice(0, match.index).trim(), handle: match[0] };
};

/**
 * Read the author of a post, ignoring the author of the post it quotes
 * @param post - The post element
 * @returns The display name and the handle of the author
 */
const parsePostUser = (post: Element): XUser => {
  const userName = [...post.querySelectorAll(USER_NAME_SELECTOR)].find(element => !isInQuote(post, element)) ?? null;
  return parseUser(userName);
};

/**
 * Build the byline of a post, e.g. "Name (@handle) · 2026-09-20T13:18:57.000Z"
 * @param user - The author of the post
 * @param timestamp - The ISO timestamp of the post, when available
 * @returns The byline
 */
const formatByline = ({ name, handle }: XUser, timestamp: string | null): string => {
  const author = [name, handle && `(${handle})`].filter(Boolean).join(' ');
  return [author, timestamp].filter(Boolean).join(' · ');
};

/**
 * Extract the text, the byline and the quoted post of a single post
 * @param post - The post element
 * @returns The extracted text block
 */
const extractPost = (post: Element): string => {
  const user = parsePostUser(post);
  const time = [...post.querySelectorAll('time[datetime]')].find(element => !isInQuote(post, element)) ?? null;
  const textElement = [...post.querySelectorAll(POST_TEXT_SELECTOR)].find(element => !isInQuote(post, element)) ?? null;

  const lines = [formatByline(user, time?.getAttribute('datetime') ?? null), extractText(textElement)];

  /* Keep the quoted post, indented as a quotation, because the quoting post often relies on it */
  const quote = post.querySelector(QUOTE_SELECTOR);
  if (quote) {
    const quotedUser = parseUser(quote.querySelector(USER_NAME_SELECTOR));
    const quotedTime = quote.querySelector('time[datetime]')?.getAttribute('datetime') ?? null;
    const quotedText = extractText(quote.querySelector(POST_TEXT_SELECTOR));
    const quoted = [formatByline(quotedUser, quotedTime), quotedText]
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n');
    if (quoted) lines.push(quoted.replace(/^/gm, '> '));
  }

  return lines
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
};

/**
 * Collect the posts that make up the thread the main post belongs to.
 * Posts around the main one are taken while they share its author, which keeps a self
 * thread whole and leaves out replies from other users and the recommendations below them.
 * @param document - The document of the post page
 * @returns The posts of the thread, in document order
 */
const collectThread = (document: Document): Element[] => {
  const posts = [...document.querySelectorAll(POST_SELECTOR)];
  if (posts.length === 0) return [];

  const mainIndex = Math.max(
    posts.findIndex(post => post.matches(MAIN_POST_SELECTOR)),
    0
  );
  const mainHandle = parsePostUser(posts[mainIndex]).handle;
  if (!mainHandle) return [posts[mainIndex]];

  let start = mainIndex;
  while (start > 0 && parsePostUser(posts[start - 1]).handle === mainHandle) start--;
  let end = mainIndex;
  while (end < posts.length - 1 && parsePostUser(posts[end + 1]).handle === mainHandle) end++;

  return posts.slice(start, end + 1);
};

/**
 * Build the title of a post page out of its author and the beginning of its text
 * @param post - The main post element
 * @returns The title, or null when the post carries no text
 */
const buildPostTitle = (post: Element): string | null => {
  const { name, handle } = parsePostUser(post);
  const textElement = [...post.querySelectorAll(POST_TEXT_SELECTOR)].find(element => !isInQuote(post, element)) ?? null;
  const text = extractText(textElement).replace(/\s+/g, ' ').trim();

  const author = [name, handle && `(${handle})`].filter(Boolean).join(' ');
  const snippet = text.length > TITLE_SNIPPET_LENGTH ? `${text.slice(0, TITLE_SNIPPET_LENGTH)}…` : text;
  const title = [author, snippet].filter(Boolean).join(': ');
  return title || null;
};

/**
 * Extract a long-form post ("article")
 * @param document - The document of the post page
 * @returns The extraction result, or null when the page is not a long-form post
 */
const extractArticle = (document: Document): ArticleExtractionResult | null => {
  const view = document.querySelector(ARTICLE_VIEW_SELECTOR);
  if (!view) return null;

  const title = view.querySelector(ARTICLE_TITLE_SELECTOR)?.textContent?.trim() || null;
  const body = extractText(view.querySelector(ARTICLE_BODY_SELECTOR));

  /* The author is rendered above the read view, so it is looked up on the whole document */
  const user = parseUser(document.querySelector(USER_NAME_SELECTOR));
  const byline = formatByline(user, null);

  const content = normalizeContent([title, byline, body].filter(Boolean).join('\n'));
  return {
    title: title,
    url: document.URL,
    content: content,
    isSuccess: title !== null && content !== null && content.length > 0,
  };
};

/**
 * Tell whether a URL points at a single post page of X
 * @param url - The URL to test
 * @returns True when the URL points at a single post page
 */
export const isXStatusUrl = (url: string): boolean => X_STATUS_URL_PATTERN.test(url);

/**
 * Extract a post of X.
 * Readability treats a post page as a page of short blocks and pulls in replies, trends and
 * promoted posts along with the post itself, so the post is read out of the DOM instead.
 * @param document - The document of the post page
 * @returns The extraction result
 */
export async function extractX(document: Document): Promise<ArticleExtractionResult> {
  try {
    /* The page is rendered client side, so the post may not be in the DOM yet */
    await waitForElement(`${MAIN_POST_SELECTOR}, ${ARTICLE_VIEW_SELECTOR}`);

    const article = extractArticle(document);
    if (article) {
      logger.debug('🐦', '[X.ts]', '[extractX]', 'Extracted a long-form post:', document.URL);
      return article;
    }

    const thread = collectThread(document);
    if (thread.length === 0) {
      logger.warn('🐦', '[X.ts]', '[extractX]', 'No post found on:', document.URL);
      return {
        title: null,
        url: document.URL,
        content: null,
        isSuccess: false,
        error: new Error('Failed to find a post on the page'),
      };
    }

    const title = buildPostTitle(thread.find(post => post.matches(MAIN_POST_SELECTOR)) ?? thread[0]);
    const content = normalizeContent(thread.map(extractPost).filter(Boolean).join('\n'));
    logger.debug('🐦', '[X.ts]', '[extractX]', 'Extracted', thread.length, 'post(s) from:', document.URL);

    return {
      title: title,
      url: document.URL,
      content: content,
      isSuccess: title !== null && content !== null && content.length > 0,
    };
  } catch (error: unknown) {
    logger.error('🐦', '[X.ts]', '[extractX]', 'Failed to extract post:', error);
    return {
      title: null,
      url: document.URL,
      content: null,
      isSuccess: false,
      error: error instanceof Error ? error : new Error('Failed to extract post with X extractor'),
    };
  }
}
