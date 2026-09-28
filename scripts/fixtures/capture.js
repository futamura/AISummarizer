/*
 * Capture a sanitized DOM snapshot of a live page as a test fixture.
 *
 * Run this file in the page (DevTools console or the Claude in Chrome javascript tool), then
 * call `await captureFixture('<name>')`, then `armFixtureCopy()` and click the page once to copy the
 * sanitized HTML. Save it with `pbpaste > src/features/content/__fixtures__/<name>.html`.
 * See README.md next to this file.
 *
 * Sanitizing happens in the page, so the raw HTML never leaves the browser:
 * - scripts, styles, media, iframes, hidden inputs, comments, SVG paths and <head> are removed
 * - outside the "keep" regions of a fixture, all text is removed and only structural attributes
 *   (id, class, role, data-testid, ...) are left, which drops account names, avatars and history
 * - inside the "keep" regions, text and most attributes stay, except URLs and inline styles;
 *   texts longer than 200 characters are cut to a 120-character excerpt
 * - emails, UUIDs, JWTs and long token-like strings are replaced with REDACTED everywhere
 */
(() => {
  const FILL_TEXT = 'Fixture prompt.';

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  /* Wait until a selector matches, polling every 250 ms */
  const waitFor = async (selector, timeout = 10000) => {
    for (let waited = 0; waited < timeout; waited += 250) {
      const element = document.querySelector(selector);
      if (element) return element;
      await sleep(250);
    }
    throw new Error(`Timed out waiting for ${selector}`);
  };

  /* Type into a ProseMirror / Lexical editor the way the injectors do */
  const typeIntoEditor = async selector => {
    const editor = await waitFor(selector);
    editor.focus();
    document.execCommand('insertText', false, FILL_TEXT);
    await sleep(1000);
  };

  const clearEditor = selector => {
    const editor = document.querySelector(selector);
    if (!editor) return;
    editor.focus();
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
  };

  /* Set a React-controlled textarea through the native setter so the app registers the change */
  const setTextarea = async (selector, value) => {
    const textarea = await waitFor(selector);
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(1000);
  };

  /* X names avatars after the account, including the signed-in one: data-testid="UserAvatar-Container-<handle>" */
  const X_AVATAR_HANDLE = /(UserAvatar-Container-)[A-Za-z0-9_]+/g;

  /* The @handle of an X post's author */
  const xHandle = post => post.querySelector('[data-testid="User-Name"]')?.textContent.match(/@[A-Za-z0-9_]{1,15}/)?.[0] ?? '';

  /* The main X post and the posts around it by the same author (a self thread), as the extractor collects them */
  const xThread = root => {
    const posts = [...root.querySelectorAll('article[data-testid="tweet"]')];
    const main = posts.findIndex(post => post.matches('[tabindex="-1"]'));
    if (main < 0) return [];
    const handle = xHandle(posts[main]);
    let start = main;
    while (start > 0 && xHandle(posts[start - 1]) === handle) start--;
    let end = main;
    while (end < posts.length - 1 && xHandle(posts[end + 1]) === handle) end++;
    return posts.slice(start, end + 1);
  };

  /*
   * One entry per fixture.
   * - match: the page the fixture is captured from
   * - source: the URL recorded in the fixture header (never the raw location, which may carry a chat id)
   * - prepare / cleanup: bring the page into the captured state and back, without sending anything
   * - keep: the regions whose text and attributes are kept; a selector keeps its first match,
   *   a function receives the document root and returns the regions
   * - drop: selectors of regions removed entirely, to keep the fixture small
   * - redact: site-specific patterns whose first group is kept and the rest replaced with REDACTED
   */
  const FIXTURES = {
    'youtube-watch': {
      match: /^https:\/\/www\.youtube\.com\/watch\?/,
      source: () => `https://www.youtube.com/watch?v=${new URL(location.href).searchParams.get('v')}`,
      prepare: async () => {
        if (!document.querySelector('ytd-transcript-segment-renderer, transcript-segment-view-model')) {
          (await waitFor('#description-inline-expander ytd-video-description-transcript-section-renderer button')).click();
          await waitFor('ytd-transcript-segment-renderer, transcript-segment-view-model');
        }
        await sleep(3000);
      },
      keep: [
        '#above-the-fold #title',
        '#description-inline-expander ytd-video-description-transcript-section-renderer',
        'ytd-engagement-panel-section-list-renderer:has(ytd-transcript-segment-renderer, transcript-segment-view-model)',
      ],
      drop: ['#secondary #related', 'ytd-comments', '#guide', 'tp-yt-app-drawer', 'ytd-miniplayer', '#player-container-outer'],
    },
    'x-post': {
      match: /^https:\/\/x\.com\/[^/]+\/status\/\d+$/,
      source: () => location.origin + location.pathname,
      keep: [xThread],
      drop: ['[data-testid="sidebarColumn"]', 'header[role="banner"]'],
      redact: [X_AVATAR_HANDLE],
    },
    'x-article': {
      match: /^https:\/\/x\.com\/[^/]+\/status\/\d+$/,
      source: () => location.origin + location.pathname,
      keep: ['[data-testid="twitterArticleReadView"]', '[data-testid="User-Name"]'],
      drop: ['[data-testid="sidebarColumn"]', 'header[role="banner"]'],
      redact: [X_AVATAR_HANDLE],
    },
    'claude-composer': {
      match: /^https:\/\/claude\.ai\/new/,
      source: () => 'https://claude.ai/new',
      prepare: () => typeIntoEditor('div.ProseMirror[contenteditable="true"]'),
      cleanup: () => clearEditor('div.ProseMirror[contenteditable="true"]'),
      keep: ['fieldset:has(div.ProseMirror)'],
      drop: ['nav'],
    },
    'deepseek-composer': {
      match: /^https:\/\/chat\.deepseek\.com\/$/,
      source: () => 'https://chat.deepseek.com/',
      prepare: () => setTextarea('textarea', FILL_TEXT),
      cleanup: () => setTextarea('textarea', ''),
      /* The composer: the textarea with the DeepThink / Search toggles and the send button */
      keep: ['div:has(> div > textarea):has(div[role="button"].ds-button--primary)'],
      drop: [],
    },
  };

  const REMOVED_ELEMENTS = [
    'script',
    'style',
    'link',
    'meta',
    'noscript',
    'template',
    'iframe',
    'img',
    'picture',
    'source',
    'video',
    'audio',
    'canvas',
    'object',
    'embed',
    'input[type="hidden"]',
    '#free-ai-summarizer-root',
    /* Injected by other extensions installed in the capturing browser */
    'plasmo-csui',
  ].join(',');

  /* Attributes kept outside the keep regions: enough for selectors, nothing user-written */
  const STRUCTURAL_ATTRIBUTES = new Set([
    'id',
    'class',
    'role',
    'tabindex',
    'type',
    'contenteditable',
    'disabled',
    'hidden',
    'aria-disabled',
    'aria-hidden',
    'aria-checked',
    'aria-selected',
    'aria-expanded',
    'data-testid',
    'data-test-id',
    'visibility',
    'target-id',
  ]);

  /* Attributes dropped even inside the keep regions: URLs, inline styles, handlers */
  const DROPPED_ATTRIBUTES = new Set([
    'style',
    'src',
    'srcset',
    'href',
    'xlink:href',
    'action',
    'formaction',
    'poster',
    'background',
    'nonce',
    'integrity',
    'ping',
  ]);

  const SECRET_PATTERNS = [
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?/g,
  ];

  /* Long words with several digits are tokens or ids; camelCase class names like ...A11yLabel are not */
  const TOKEN_PATTERN = /[A-Za-z0-9_-]{32,}/g;
  const isTokenLike = word => (word.match(/\d/g) ?? []).length >= 4;

  const scrub = (value, redact = []) =>
    redact
      .reduce(
        (result, pattern) => result.replace(pattern, '$1REDACTED'),
        SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, 'REDACTED'), value)
      )
      .replace(TOKEN_PATTERN, word => (isTokenLike(word) ? 'REDACTED' : word));

  /* Long texts are cut so that fixtures carry excerpts of third-party content, not whole articles */
  const MAX_TEXT_LENGTH = 200;
  const EXCERPT_LENGTH = 120;
  const excerpt = text => (text.length > MAX_TEXT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}…` : text);

  const sanitize = (config, report) => {
    /* Parse into an inert document: a clone in the live one upgrades custom elements, whose callbacks react to the edits */
    const inert = new DOMParser().parseFromString(document.documentElement.outerHTML, 'text/html');
    const root = inert.documentElement;

    root.querySelector('head')?.replaceChildren();
    root.querySelectorAll(REMOVED_ELEMENTS).forEach(element => element.remove());
    config.drop.forEach(selector => root.querySelectorAll(selector).forEach(element => element.remove()));
    root.querySelectorAll('svg').forEach(svg => svg.replaceChildren());

    const kept = new Set();
    config.keep.forEach(keep => {
      const isSelector = typeof keep === 'string';
      const regions = isSelector ? [root.querySelector(keep)].filter(Boolean) : keep(root);
      report.keep[isSelector ? keep : keep.name] = regions.length;
      regions.forEach(region => {
        kept.add(region);
        region.querySelectorAll('*').forEach(element => kept.add(element));
      });
    });

    const walker = inert.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT);
    const removals = [];
    for (let node = walker.currentNode; node; node = walker.nextNode()) {
      if (node.nodeType === Node.COMMENT_NODE) {
        removals.push(node);
      } else if (node.nodeType === Node.TEXT_NODE) {
        if (!kept.has(node.parentElement) || !node.textContent.trim()) {
          removals.push(node);
        } else {
          node.textContent = excerpt(scrub(node.textContent, config.redact));
          report.textChars += node.textContent.length;
        }
      } else {
        const inKeep = kept.has(node);
        [...node.attributes].forEach(({ name, value }) => {
          const allowed = inKeep ? !DROPPED_ATTRIBUTES.has(name) && !name.startsWith('on') : STRUCTURAL_ATTRIBUTES.has(name);
          if (allowed) {
            node.setAttribute(name, scrub(value, config.redact));
          } else {
            node.removeAttribute(name);
          }
        });
      }
    }
    removals.forEach(node => node.remove());

    return root;
  };

  window.captureFixture = async name => {
    const config = FIXTURES[name];
    if (!config) throw new Error(`Unknown fixture: ${name}. Known: ${Object.keys(FIXTURES).join(', ')}`);
    if (!config.match.test(location.href)) throw new Error(`Open ${config.match} before capturing ${name}`);

    await config.prepare?.();
    const report = { name, keep: {}, textChars: 0, bytes: 0 };
    try {
      const root = sanitize(config, report);
      const missing = Object.entries(report.keep).filter(([, count]) => count === 0);
      if (missing.length > 0) throw new Error(`Keep regions not found: ${missing.map(([selector]) => selector).join(', ')}`);

      const captured = new Date().toLocaleDateString('sv-SE');
      const html = `<!-- fixture: ${name} | source: ${config.source()} | captured: ${captured} | sanitized by scripts/fixtures/capture.js -->\n<!DOCTYPE html>\n${root.outerHTML}\n`;
      report.bytes = html.length;
      window.lastFixture = html;
      return report;
    } finally {
      await config.cleanup?.();
    }
  };

  /*
   * Copy the last capture on the next click in the page. Writing to the clipboard outside a user
   * gesture never settles when the page is driven remotely; in DevTools, `copy(lastFixture)` also works.
   */
  window.armFixtureCopy = () => {
    window.lastFixtureCopy = 'armed';
    document.addEventListener(
      'click',
      () => {
        navigator.clipboard.writeText(window.lastFixture).then(
          () => (window.lastFixtureCopy = 'copied'),
          error => (window.lastFixtureCopy = `failed: ${error.message}`)
        );
      },
      { once: true, capture: true }
    );
  };

  return Object.keys(FIXTURES);
})();
