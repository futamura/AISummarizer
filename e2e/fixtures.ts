import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test as base, type BrowserContext, chromium, expect, type Page, type Route, type Worker } from '@playwright/test';

export { expect };

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.dirname(E2E_DIR);
const PAGES_DIR = path.join(E2E_DIR, 'pages');
/* Sanitized snapshots of live pages, shared with the Jest tests */
const FIXTURES_DIR = path.join(REPO_DIR, 'src', 'features', 'content', '__fixtures__');

/* .test is reserved for testing (RFC 6761), so a routing mistake cannot reach a real site */
const PAGE_HOST_SUFFIX = '.e2e.test';
export const PAGE_ORIGIN = 'https://news.e2e.test';

/* The fixture each live host answers with. The AI service hosts are the ones getSummarizeUrl opens */
const FIXTURE_HOSTS: Record<string, string> = {
  'www.youtube.com': 'youtube-watch',
  'chatgpt.com': 'chatgpt-composer',
  'gemini.google.com': 'gemini-composer',
  'aistudio.google.com': 'aistudio-composer',
  'claude.ai': 'claude-composer',
  'grok.com': 'grok-tiptap-composer',
  'www.perplexity.ai': 'perplexity-composer',
  'chat.deepseek.com': 'deepseek-composer',
  'www.kimi.ai': 'kimi-composer',
  'chat.qwen.ai': 'qwen-composer',
};

/* x.com serves posts and long-form articles on the same path pattern */
const X_ARTICLE_PATH = '/Safety/status/1801282137921871887';

/* The article of e2e/pages/article.html, as a prompt carries it */
export const ARTICLE_TITLE = "The Lighthouse Keeper's Log";
export const ARTICLE_SENTENCE = 'a page that described a ship nobody else had seen';

export interface ExtensionOptions {
  /* The unpacked build to load, relative to the repository root */
  distDir: string;
}

interface ExtensionFixtures {
  serviceWorker: Worker;
  extensionId: string;
  openPage: (name: string) => Promise<Page>;
  openFixturePage: (name: string) => Promise<Page>;
  serveFixture: (host: string, name: string) => Promise<void>;
  tabIdFor: (page: Page) => Promise<number>;
  openPopupFor: (target: Page) => Promise<Page>;
  waitForServicePage: (host: string) => Promise<Page>;
}

export interface CapturedFixture {
  html: string;
  /* The URL the fixture was captured from */
  source: string;
}

/**
 * Read a captured fixture
 * @param name - The fixture name, its file name without .html
 * @returns The HTML and the URL it was captured from
 */
export const readFixture = (name: string): CapturedFixture => {
  const file = path.join(FIXTURES_DIR, `${name}.html`);
  const html = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const header = html.match(/^<!-- fixture: (\S+) \| source: (\S+) \|/);
  if (!header || header[1] !== name) throw new Error(`No captured fixture ${name} with a valid header in src/features/content/__fixtures__/`);
  return { html, source: header[2] };
};

/**
 * The fixture a live URL is answered with
 * @param url - The requested URL
 * @returns The fixture name, or undefined for a host without one
 */
const fixtureForUrl = (url: URL): string | undefined => {
  if (url.hostname === 'x.com') return url.pathname === X_ARTICLE_PATH ? 'x-article' : 'x-post';
  return FIXTURE_HOSTS[url.hostname];
};

/**
 * Answer a page with a fixture, and keep its images, scripts and API calls off the network
 * @param route - The intercepted request
 * @param name - The fixture name
 */
const answerWithFixture = (route: Route, name: string): Promise<void> => {
  if (route.request().resourceType() !== 'document') return route.abort();
  return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFixture(name).html });
};

/**
 * Answer the test pages and the fixture hosts, and keep everything else off the network
 * @param route - The intercepted request
 */
const routeRequest = async (route: Route): Promise<void> => {
  const url = new URL(route.request().url());
  /* chrome-extension:// and data: requests are the extension's own files */
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return route.continue();
  if (url.hostname.endsWith(PAGE_HOST_SUFFIX)) {
    const file = path.join(PAGES_DIR, `${url.pathname.slice(1)}.html`);
    if (path.dirname(file) === PAGES_DIR && existsSync(file)) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(file, 'utf8') });
    }
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
  }
  const fixture = fixtureForUrl(url);
  if (fixture) return answerWithFixture(route, fixture);
  console.warn(`[e2e] Aborted a request outside the test pages and fixture hosts: ${url.href}`);
  return route.abort();
};

/**
 * Open a URL in a new tab and wait for the content script
 * @param context - The browser context
 * @param url - The URL to open
 * @param hint - What to do when the URL is not answered
 * @returns The page
 */
const openUrl = async (context: BrowserContext, url: string, hint: string): Promise<Page> => {
  const page = await context.newPage();
  const response = await page.goto(url);
  /* A missing page would otherwise load the 404 text, which also fails to extract */
  if (!response?.ok()) throw new Error(`${url} answered ${response?.status()}: ${hint}`);
  /* The content script appends its root to the body once it runs */
  await page.locator('#free-ai-summarizer-root').waitFor({ state: 'attached' });
  return page;
};

export const test = base.extend<ExtensionFixtures & ExtensionOptions>({
  distDir: ['dist/prod', { option: true }],

  context: async ({ distDir }, use, testInfo) => {
    const extensionDir = path.resolve(REPO_DIR, distDir);
    if (!existsSync(path.join(extensionDir, 'manifest.json'))) throw new Error(`Build ${distDir} first (pnpm build / pnpm start)`);

    /* A fresh profile per test, so no storage or tab carries over */
    const userDataDir = mkdtempSync(path.join(tmpdir(), 'ai-summarizer-e2e-'));
    try {
      const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: true,
        /* The default clipboard prompt names the browser language */
        locale: 'en-US',
        permissions: ['clipboard-read', 'clipboard-write'],
        args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
      });
      await context.route('**/*', routeRequest);

      await use(context);

      /*
       * Playwright does not capture pages of a persistent context on failure, so attach them here. Saved
       * as files in test-results/, since only the HTML reporter writes attachments given as a body
       */
      if (testInfo.status !== testInfo.expectedStatus) {
        for (const [index, page] of context.pages().entries()) {
          const file = testInfo.outputPath(`page-${index}.png`);
          const saved = await page.screenshot({ path: file }).then(
            () => true,
            () => false
          );
          if (saved) await testInfo.attach(`page-${index}.png`, { path: file, contentType: 'image/png' });
        }
      }
      await context.close();
    } finally {
      /* Also when the launch or the close throws, so no profile is left behind */
      rmSync(userDataDir, { recursive: true, force: true });
    }
  },

  serviceWorker: async ({ context, distDir }, use) => {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 10_000 }).catch(() => {
        throw new Error(`The service worker of ${distDir} did not start within 10 s`);
      }));
    await use(worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },

  openPage: async ({ context }, use) => {
    await use((name: string) => openUrl(context, `${PAGE_ORIGIN}/${name}`, `add e2e/pages/${name}.html`));
  },

  openFixturePage: async ({ context }, use) => {
    await use(async (name: string) => {
      const { source } = readFixture(name);
      if (fixtureForUrl(new URL(source)) !== name) throw new Error(`${source} is not answered with ${name}: add its host to FIXTURE_HOSTS in e2e/fixtures.ts`);
      return openUrl(context, source, `check the routing of ${name}`);
    });
  },

  serveFixture: async ({ context }, use) => {
    await use(async (host: string, name: string) => {
      /* Fail now on an unknown name, rather than on the first request */
      readFixture(name);
      /* Routes added later run first, so this one overrides the host's default for the rest of the test */
      await context.route(
        url => url.hostname === host,
        route => answerWithFixture(route, name)
      );
    });
  },

  tabIdFor: async ({ serviceWorker }, use) => {
    await use(async (page: Page) => {
      const url = page.url();
      /* tabs.query({ url }) takes a match pattern, which a URL with a query string such as ?v= does not match */
      const tabId = await serviceWorker.evaluate(async target => (await chrome.tabs.query({})).find(tab => tab.url === target)?.id, url);
      if (tabId === undefined) throw new Error(`No tab found for ${url}`);
      return tabId;
    });
  },

  openPopupFor: async ({ context, serviceWorker, extensionId, tabIdFor }, use) => {
    await use(async (target: Page) => {
      const tabId = await tabIdFor(target);

      /*
       * The popup acts on the active tab of its window, read once when it renders. A popup opened from
       * the toolbar cannot be driven by Playwright, so popup.html is opened in a tab, the target tab is
       * made active again, and the popup is reloaded to read it.
       */
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await serviceWorker.evaluate(async id => {
        await chrome.tabs.update(id, { active: true });
      }, tabId);
      await popup.reload();
      await popup.getByText('Summarize this page').waitFor();
      return popup;
    });
  },

  waitForServicePage: async ({ context }, use) => {
    await use(async (host: string) => {
      const find = (): Page | undefined =>
        context.pages().find(page => {
          try {
            return new URL(page.url()).hostname === host;
          } catch {
            return false;
          }
        });
      await expect.poll(() => find() !== undefined, { message: `a tab on ${host} opened by the extension`, timeout: 10_000, intervals: [100] }).toBe(true);
      const page = find();
      if (!page) throw new Error(`The tab on ${host} closed while it was found`);
      return page;
    });
  },
});

/**
 * Wait for a toast of the content script. Its shadow root is closed in every build, so Playwright's
 * locators cannot see inside it; the accessibility tree of the page includes it.
 * @param page - The page showing the toast
 * @param text - Text the toast contains
 * @param timeout - How long to wait in ms
 */
export const waitForToast = async (page: Page, text: string, timeout = 5000): Promise<void> => {
  const cdp = await page.context().newCDPSession(page);
  try {
    await expect
      .poll(
        async () => {
          const { nodes } = await cdp.send('Accessibility.getFullAXTree');
          return nodes.some(node => String(node.name?.value ?? '').includes(text));
        },
        { message: `toast containing "${text}"`, timeout, intervals: [100] }
      )
      .toBe(true);
  } finally {
    /* A failing detach must not hide the result of the poll */
    await cdp.detach().catch(() => undefined);
  }
};

/**
 * Read the clipboard from a page. The page must be in the active tab
 * @param page - A page in the active tab
 * @returns The clipboard text
 */
export const readClipboard = (page: Page): Promise<string> => page.evaluate(() => navigator.clipboard.readText());

/**
 * Write to the clipboard from a page. The page must be in the active tab
 * @param page - A page in the active tab
 * @param text - The text to write
 */
export const writeClipboard = (page: Page, text: string): Promise<void> => page.evaluate(value => navigator.clipboard.writeText(value), text);

/**
 * Read the text of an AI service's composer, the first element the selector matches, as the injector finds it
 * @param page - The AI service page
 * @param selector - The editor selector of the service
 * @returns The text, or null without an editor
 */
export const readComposer = (page: Page, selector: string): Promise<string | null> =>
  page.evaluate(target => {
    const editor = document.querySelector(target);
    return editor instanceof HTMLTextAreaElement ? editor.value : (editor?.textContent ?? null);
  }, selector);

/**
 * Check that the article of e2e/pages/article.html was injected. The fixture has no site script, so
 * the send click changes nothing and the composer keeps the prompt
 * @param page - The AI service page
 * @param editorSelector - The editor selector of the service
 */
export const expectArticleInjected = async (page: Page, editorSelector: string): Promise<void> => {
  /* Shown only when the injector finishes, which takes a few seconds of deliberate waits */
  await waitForToast(page, 'Article has been sent!', 20_000);
  const text = await readComposer(page, editorSelector);
  expect(text).toContain(ARTICLE_TITLE);
  expect(text).toContain(ARTICLE_SENTENCE);
};
