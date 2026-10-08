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

  /* Lexical ignores execCommand('delete'), but handles a beforeinput deletion over a full selection */
  const clearLexical = selector => {
    const editor = document.querySelector(selector);
    if (!editor) return;
    editor.focus();
    getSelection().selectAllChildren(editor);
    editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
  };

  /* Set the paragraph of a Quill editor the way the Gemini injector does */
  const setQuillText = async (selector, text) => {
    const editor = await waitFor(selector);
    const paragraph = editor.querySelector('p') || editor.appendChild(document.createElement('p'));
    paragraph.textContent = text;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(1000);
  };

  /* Open a menu so its items are captured, unless they are already rendered */
  const openMenu = async (triggerSelector, itemSelector) => {
    if (!document.querySelector(itemSelector)) {
      (await waitFor(triggerSelector)).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await waitFor(itemSelector);
    }
    await sleep(1000);
  };

  /* The innermost ancestor of the editor that also holds the send button: the composer */
  const composerOf = (editorSelector, buttonSelector) => {
    const keep = root => {
      let element = root.querySelector(editorSelector);
      while (element && !element.querySelector(buttonSelector)) element = element.parentElement;
      return element ? [element] : [];
    };
    /* The capture report lists keep regions by name */
    return Object.defineProperty(keep, 'name', { value: `composer of ${editorSelector}` });
  };

  /* grok.com serves a textarea or a Tiptap editor in its composer, varying between page loads */
  const requireGrokEditor = selector => {
    if (!document.querySelector(selector)) throw new Error(`This load serves the other Grok composer; reload until ${selector} appears`);
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

  /* Signed out, X serves other markup: a bare <article> per post, without data-testid */
  const X_SIGNED_OUT_POST = 'article:not([data-testid])';

  /* A post's own link, /<handle>/status/<id>, the only href the signed-out fixtures keep: it tells the main post apart */
  const X_STATUS_PATH = /^\/[A-Za-z0-9_]{1,15}\/status\/\d+$/;

  /* The @handle of a signed-out X post's author: the first link that reads as a handle */
  const xSignedOutHandle = post => [...post.querySelectorAll('a')].map(link => link.textContent.trim()).find(text => /^@[A-Za-z0-9_]{1,15}$/.test(text)) ?? '';

  /* The signed-out counterpart of xThread: the main post is the one linking to the status id of the page */
  const xSignedOutThread = root => {
    const id = location.pathname.match(/\/status\/(\d+)/)?.[1];
    const posts = [...root.querySelectorAll(X_SIGNED_OUT_POST)];
    const main = posts.findIndex(post => [...post.querySelectorAll('a[href]')].some(link => link.getAttribute('href').endsWith(`/status/${id}`)));
    if (main < 0) return [];
    const handle = xSignedOutHandle(posts[main]);
    let start = main;
    while (start > 0 && xSignedOutHandle(posts[start - 1]) === handle) start--;
    let end = main;
    while (end < posts.length - 1 && xSignedOutHandle(posts[end + 1]) === handle) end++;
    return posts.slice(start, end + 1);
  };

  const X_SIGNED_OUT = {
    match: /^https:\/\/x\.com\/[^/]+\/status\/\d+$/,
    source: () => location.origin + location.pathname,
    keep: [xSignedOutThread],
    drop: [],
    keepHref: X_STATUS_PATH,
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
   * - keepHref: inside the keep regions, the hrefs matching this pattern are kept (all others are dropped)
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
    /* Signed out (a private window): the same pages as x-post and x-article, in the signed-out markup */
    'x-signed-out-post': X_SIGNED_OUT,
    'x-signed-out-article': X_SIGNED_OUT,
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
    'chatgpt-composer': {
      match: /^https:\/\/chatgpt\.com\/(\?|$)/,
      source: () => 'https://chatgpt.com/',
      prepare: () => typeIntoEditor('#prompt-textarea'),
      cleanup: () => clearEditor('#prompt-textarea'),
      keep: ['form:has(#prompt-textarea)'],
      drop: ['nav'],
    },
    /* Signed out (a private window): a plain textarea composer instead of ProseMirror */
    'chatgpt-guest-composer': {
      match: /^https:\/\/chatgpt\.com\/(\?|$)/,
      source: () => 'https://chatgpt.com/',
      prepare: () => setTextarea('form textarea[name="prompt"]', FILL_TEXT),
      cleanup: () => setTextarea('form textarea[name="prompt"]', ''),
      keep: ['form:has(textarea[name="prompt"])'],
      drop: ['nav'],
    },
    'gemini-composer': {
      match: /^https:\/\/gemini\.google\.com\/app(\?|$)/,
      source: () => 'https://gemini.google.com/app',
      prepare: async () => {
        await setQuillText('rich-textarea div.ql-editor[contenteditable="true"]', FILL_TEXT);
        await openMenu('bard-mode-switcher button', '[data-test-id^="bard-mode-option"]');
      },
      cleanup: () => setQuillText('rich-textarea div.ql-editor[contenteditable="true"]', ''),
      /* The composer with the mode picker, and the open mode menu */
      keep: ['fieldset:has(rich-textarea)', '.cdk-overlay-pane:has([data-test-id^="bard-mode-option"])'],
      drop: [],
    },
    'grok-textarea-composer': {
      match: /^https:\/\/grok\.com\/(\?|$)/,
      source: () => 'https://grok.com/',
      prepare: () => {
        requireGrokEditor('form textarea');
        return setTextarea('form textarea', FILL_TEXT);
      },
      cleanup: () => setTextarea('form textarea', ''),
      keep: ['form:has(textarea)'],
      drop: ['nav'],
    },
    'grok-tiptap-composer': {
      match: /^https:\/\/grok\.com\/(\?|$)/,
      source: () => 'https://grok.com/',
      prepare: () => {
        requireGrokEditor('form div.tiptap.ProseMirror');
        return typeIntoEditor('div.tiptap.ProseMirror[contenteditable="true"]');
      },
      cleanup: () => clearEditor('div.tiptap.ProseMirror[contenteditable="true"]'),
      keep: ['form:has(div.tiptap)'],
      drop: ['nav'],
    },
    'perplexity-composer': {
      match: /^https:\/\/www\.perplexity\.ai\/(\?|$)/,
      source: () => 'https://www.perplexity.ai/',
      prepare: () => typeIntoEditor('#ask-input'),
      cleanup: () => clearLexical('#ask-input'),
      keep: [composerOf('#ask-input', 'button[aria-label="Submit"]')],
      drop: [],
    },
    'kimi-composer': {
      match: /^https:\/\/www\.kimi\.ai\/(\?|$)/,
      source: () => 'https://www.kimi.ai/',
      prepare: async () => {
        await typeIntoEditor('div[contenteditable="true"][data-lexical-editor="true"]');
        await openMenu('.current-model', '.model-item');
      },
      cleanup: () => clearLexical('div[contenteditable="true"][data-lexical-editor="true"]'),
      /* The composer with the model chip, and the open model menu */
      keep: [composerOf('div[data-lexical-editor="true"]', 'div.send-button-container'), '.kimi-menu:has(.model-item)'],
      drop: [],
    },
    'qwen-composer': {
      match: /^https:\/\/chat\.qwen\.ai\/(\?|$)/,
      source: () => 'https://chat.qwen.ai/',
      prepare: async () => {
        await setTextarea('textarea.message-input-textarea', FILL_TEXT);
        await openMenu('[aria-label="Select Model"]', '[role="option"]');
      },
      cleanup: () => setTextarea('textarea.message-input-textarea', ''),
      /* The composer, the model picker in the header, and its open menu */
      keep: [composerOf('textarea.message-input-textarea', 'button.send-button'), '[aria-label="Select Model"]', '[role="listbox"]:has([role="option"])'],
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
    '.translatetweet',
  ].join(',');

  /*
   * Custom elements and attributes that other extensions (DeepL, Proton Pass, Dark Reader, ...) add to
   * every page: they are not the site's markup, and they reveal which extensions the capturer uses
   */
  const EXTENSION_ELEMENT_PREFIXES = ['deepl-', 'protonpass-', 'plasmo-'];
  const EXTENSION_ATTRIBUTE_PREFIXES = ['data-darkreader', 'data-dl-'];

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

  /* A leading run of plain words is a name, not part of the token: bard-mode-option-<hash> keeps its prefix for selectors */
  const WORD_PREFIX = /^(?:[A-Za-z]+-)*/;
  const redactToken = word => `${word.match(WORD_PREFIX)[0]}REDACTED`;

  const scrub = (value, redact = []) =>
    redact
      .reduce(
        (result, pattern) => result.replace(pattern, '$1REDACTED'),
        SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, 'REDACTED'), value)
      )
      .replace(TOKEN_PATTERN, word => (isTokenLike(word) ? redactToken(word) : word));

  /* Long texts are cut so that fixtures carry excerpts of third-party content, not whole articles */
  const MAX_TEXT_LENGTH = 200;
  const EXCERPT_LENGTH = 120;
  const excerpt = text => (text.length > MAX_TEXT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}…` : text);

  const sanitize = (config, report) => {
    /*
     * Copy into an inert document: a clone in the live one upgrades custom elements, whose callbacks react to the edits.
     * Importing (rather than parsing outerHTML) also works on pages that enforce Trusted Types, such as Gemini
     */
    const inert = document.implementation.createHTMLDocument('');
    const root = inert.importNode(document.documentElement, true);
    inert.replaceChild(root, inert.documentElement);

    root.querySelector('head')?.replaceChildren();
    root.querySelectorAll(REMOVED_ELEMENTS).forEach(element => element.remove());
    [...root.querySelectorAll('*')]
      .filter(element => EXTENSION_ELEMENT_PREFIXES.some(prefix => element.localName.startsWith(prefix)))
      .forEach(element => element.remove());
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
          const fromExtension = EXTENSION_ATTRIBUTE_PREFIXES.some(prefix => name.startsWith(prefix));
          const keptHref = inKeep && name === 'href' && config.keepHref?.test(value);
          const allowed = !fromExtension && (keptHref || (inKeep ? !DROPPED_ATTRIBUTES.has(name) && !name.startsWith('on') : STRUCTURAL_ATTRIBUTES.has(name)));
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
