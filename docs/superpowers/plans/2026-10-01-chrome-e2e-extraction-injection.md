# Chrome E2E Extraction, Injection and Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Chrome E2E suite to YouTube / X extraction, injection into all AI service composers, and the context menu (through a development-only hook), still offline and in CI.

**Architecture:** A local HTTPS server (`e2e/fixture-server.ts`) serves the hand-written pages and the captured fixtures of `src/features/content/__fixtures__/` at their real host names (page loads only; other requests get 404), and Chromium's `--host-resolver-rules` sends those hosts to it and every other host nowhere, so no request of the browser or the extension reaches a live site. Task 1 first used `context.route`, which leaked (spec, "Network leak"); Task 2 replaces it. New helpers open a fixture page, override a host's fixture, look up a tab ID by exact URL and wait for the AI service tab the service worker opens. A hook on the service worker global, defined only in development builds, calls the real context menu handler.

**Tech Stack:** `@playwright/test` 1.63.0 (locked), bundled Chromium (`channel: 'chromium'`), webpack production mode for dead-code removal, GitHub Actions (unchanged).

**Spec:** `docs/superpowers/specs/2026-10-01-chrome-e2e-extraction-injection-design.md`

## Global Constraints

- No new dependencies and no version changes
- No network, enforced by Chromium's resolver (from Task 2 on): `--host-resolver-rules` maps `news.e2e.test` and the fixture hosts to the local HTTPS server and every other host to `~NOTFOUND`. `context.route` is not used for this: it missed the first navigation of tabs opened by the service worker and let them reach the live sites (spec, "Network leak")
- The server answers only `Sec-Fetch-Dest: document` requests with HTML (`e2e/pages/` for `news.e2e.test`, fixtures for the fixture hosts); everything else gets 404
- No injection or context menu spec runs before Task 2's routing tests pass
- Fixture hosts: `www.youtube.com`, `x.com` (by path), `chatgpt.com`, `gemini.google.com`, `aistudio.google.com`, `claude.ai`, `grok.com`, `www.perplexity.ai`, `chat.deepseek.com`, `www.kimi.ai`, `chat.qwen.ai`
- Hook name: `__aiSummarizerE2E`, defined only inside `if (process.env.NODE_ENV === 'development') { … }` in `ServiceWorker.initialize()`; never in a method or helper that survives in production
- Context menu specs run in the `dev` project only; the build check runs in `prod` only; every other spec runs in both
- Do not work around a product race in the tests: if `INJECT_ARTICLE` is lost because the content script listener is not registered yet, stop and report (see Task 2)
- Source comments in English, block comments (`/* */`) only, even for one line (repo rule)
- Prettier: single quotes, semicolons, `printWidth: 160`, import order plugin (run `pnpm prettier-fix` before each commit)
- Commit messages: Conventional Commits, English, no AI attribution or `Co-Authored-By`
- Stage files by path; never `git add -A` (an untracked `.superpowers/` directory exists and must stay out)
- Build both extensions before any E2E run that follows a source change: `pnpm build` and `pnpm start` (the E2E config never builds)

## Review Focus

- A request the extension itself starts (a tab from `chrome.tabs.create`, a `fetch` in the service worker): expected to stay on the machine. Task 2 adds routing tests for both
- A fixture page asking for its own images, scripts or API (`https://chatgpt.com/backend-api/…`): expected to get 404 from the local server, never the fixture HTML and never the site. Task 1 adds a routing test that fetches from a fixture host; Task 2 keeps it
- A misspelled fixture name in `serveFixture` / `openFixturePage`: expected to fail at once naming the fixture, not as a later 404 or empty page. Task 1 adds a test for `readFixture` with an unknown name
- A target page whose URL has a query string (`watch?v=…`): expected to be found by `openPopupFor`. Covered by the YouTube scenario (Task 1), which also checks `# URL` with the query string
- The AI service tab not opening (popup click lost, service worker failure): expected to fail within 10 s naming the host, not after the 30 s test timeout. `waitForServicePage` (Task 1) polls with its own 10 s timeout and message
- The hook leaking into `dist/prod` through a refactor (for example, moving it into a method): expected to fail CI. Task 3 adds the build check and first sees it fail against `dist/dev`

---

## File Structure

| File | Responsibility |
|---|---|
| `e2e/fixture-server.ts` | (Task 2) HTTPS server for the test pages and fixtures, self-signed certificate, resolver rules, per-test overrides, request log |
| `e2e/fixtures.ts` | Browser context with the resolver rules, `readFixture`, fixtures `openPage`, `openFixturePage`, `serveFixture`, `tabIdFor`, `openPopupFor`, `waitForServicePage`; helpers `waitForToast`, `readClipboard`, `writeClipboard`, `readComposer`, `expectArticleInjected` |
| `e2e/routing.spec.ts` | Adds: fixture host serves its fixture and aborts subresources; unknown fixture name fails clearly |
| `e2e/extraction.spec.ts` | YouTube, X post, X article copied through the popup |
| `e2e/injection.spec.ts` | Eleven composers filled through the popup |
| `e2e/context-menu.spec.ts` | dev only: Copy and Claude through the hook |
| `e2e/prod-build.spec.ts` | prod only: the hook name is absent from `dist/prod` |
| `src/pages/ServiceWorker.ts` | `declare global` for the hook; the dev-only block in `initialize()` |
| `CLAUDE.md` | `pnpm test:e2e` entry mentions the fixtures and the hook |

---

### Task 1: Fixture routing, helpers and the extraction specs

**Files:**
- Modify: `e2e/fixtures.ts` (replace the whole file)
- Modify: `e2e/routing.spec.ts`
- Create: `e2e/extraction.spec.ts`

**Interfaces:**
- Consumes: existing `e2e/playwright.config.ts` (projects `prod` / `dev`, option `distDir`)
- Produces (from `e2e/fixtures.ts`):
  - `test` with fixtures `distDir: string`, `context`, `serviceWorker: Worker`, `extensionId: string`, `openPage(name: string): Promise<Page>`, `openFixturePage(name: string): Promise<Page>`, `serveFixture(host: string, name: string): Promise<void>`, `tabIdFor(page: Page): Promise<number>`, `openPopupFor(target: Page): Promise<Page>`, `waitForServicePage(host: string): Promise<Page>`
  - `expect`, `PAGE_ORIGIN = 'https://news.e2e.test'`, `interface ExtensionOptions { distDir: string }`
  - `readFixture(name: string): { html: string; source: string }`
  - `waitForToast(page: Page, text: string, timeout = 5000): Promise<void>`, `readClipboard(page: Page): Promise<string>`, `writeClipboard(page: Page, text: string): Promise<void>`
  - `ARTICLE_TITLE`, `ARTICLE_SENTENCE`, `readComposer(page: Page, selector: string): Promise<string | null>`, `expectArticleInjected(page: Page, editorSelector: string): Promise<void>` (used from Task 2)

- [ ] **Step 1: Build both extension builds fresh**

Run: `pnpm build`
Expected: webpack finishes, `dist/prod/manifest.json` exists

Run: `pnpm start`
Expected: webpack finishes and exits, `dist/dev/manifest.json` exists

- [ ] **Step 2: Write the failing extraction spec**

Create `e2e/extraction.spec.ts`:

```ts
import { expect, readClipboard, test, waitForToast } from './fixtures';

/* A YouTube transcript is read 4 s after the request, then once its segment count settles */
const EXTRACTION_TIMEOUT = 20_000;

test('copies the transcript of a YouTube video', async ({ openFixturePage, openPopupFor }) => {
  const video = await openFixturePage('youtube-watch');
  const popup = await openPopupFor(video);

  await popup.getByText('Copy to clipboard').click();

  /* Shown after 500 ms, well before the transcript is read */
  await waitForToast(video, 'Extracting transcript…');
  await waitForToast(video, 'Article copied to clipboard', EXTRACTION_TIMEOUT);
  const text = await readClipboard(video);
  expect(text).toContain('# Title\nMe at the zoo');
  expect(text).toContain('# URL\nhttps://www.youtube.com/watch?v=jNQXAC9IVRw');
  expect(text).toContain('[0:01](https://youtu.be/jNQXAC9IVRw?t=1s) All right, so here we are, in front of the elephants');
});

test('copies an X post with its self reply', async ({ openFixturePage, openPopupFor }) => {
  const post = await openFixturePage('x-post');
  const popup = await openPopupFor(post);

  await popup.getByText('Copy to clipboard').click();

  await waitForToast(post, 'Article copied to clipboard', EXTRACTION_TIMEOUT);
  const text = await readClipboard(post);
  expect(text).toContain('# Title\nDevelopers (@XDevelopers): X Livestream API has been rebuilt from the ground up.');
  expect(text).toContain('Check out our official docs here:');
  /* X shows a machine translation under the post for the signed-in user's language */
  expect(text).not.toContain('ゼロから');
});

test('copies an X article with its title and paragraphs', async ({ openFixturePage, openPopupFor }) => {
  const article = await openFixturePage('x-article');
  const popup = await openPopupFor(article);

  await popup.getByText('Copy to clipboard').click();

  await waitForToast(article, 'Article copied to clipboard', EXTRACTION_TIMEOUT);
  const text = await readClipboard(article);
  expect(text).toContain('# Title\nX achieves TAG Brand Safety Certification');
  expect(text).toContain('For our customers, we have deployed every single brand control');
});
```

- [ ] **Step 3: Add the failing routing tests**

Replace `e2e/routing.spec.ts` with:

```ts
import { expect, PAGE_ORIGIN, readFixture, test } from './fixtures';

test('never reaches a site outside the test pages', async ({ context }) => {
  const page = await context.newPage();
  await expect(page.goto('https://example.com/')).rejects.toThrow(/net::ERR_FAILED/);
});

test('answers a missing test page with 404', async ({ context }) => {
  const page = await context.newPage();
  const response = await page.goto(`${PAGE_ORIGIN}/no-such-page`);
  expect(response?.status()).toBe(404);
});

test('serves a fixture host its fixture and keeps its other requests off the network', async ({ context }) => {
  const page = await context.newPage();
  const response = await page.goto('https://chatgpt.com/');
  expect(await response?.text()).toContain('<!-- fixture: chatgpt-composer |');

  const fetched = await page.evaluate(() =>
    fetch('https://chatgpt.com/backend-api/me').then(
      () => 'answered',
      () => 'aborted'
    )
  );
  expect(fetched).toBe('aborted');
});

test('names a fixture that does not exist', () => {
  expect(() => readFixture('no-such-fixture')).toThrow('No captured fixture no-such-fixture');
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `pnpm test:e2e extraction routing`
Expected: FAIL — TypeScript/fixture errors such as `Test has unknown parameter "openFixturePage"` and `readFixture` not exported

- [ ] **Step 5: Replace `e2e/fixtures.ts`**

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test as base, chromium, expect, type BrowserContext, type Page, type Route, type Worker } from '@playwright/test';

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
```

- [ ] **Step 6: Run the new and changed specs**

Run: `pnpm test:e2e extraction routing`
Expected: PASS — 7 tests × 2 projects = 14 passed

If the YouTube test fails on "Extracting transcript…" or the copy, check the failure screenshot in `test-results/` before changing anything; do not raise timeouts beyond 20 s without reporting why.

- [ ] **Step 7: See each new scenario detect a failure**

Temporarily change, one at a time, and run `pnpm test:e2e extraction routing --project prod`:
- `'# Title\nMe at the zoo'` → `'# Title\nMe at the park'` — expect the YouTube test to FAIL
- `'Check out our official docs here:'` → `'Check out our docs:'` — expect the X post test to FAIL
- `'X achieves TAG Brand Safety Certification'` → `'X achieves certification'` — expect the X article test to FAIL
- `toBe('aborted')` → `toBe('answered')` — expect the routing test to FAIL

Revert each change. Run `git diff e2e/extraction.spec.ts e2e/routing.spec.ts` against the Step 2 / Step 3 code to confirm nothing wrong is left.

- [ ] **Step 8: Run the whole suite**

Run: `pnpm test:e2e`
Expected: PASS — the existing specs (popup, options, copy, extraction-failure) still pass with the new `openPopupFor`

- [ ] **Step 9: Lint, format, type-check**

Run: `pnpm prettier-fix`
Run: `pnpm eslint-check`
Expected: no errors
Run: `pnpm type-check`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add e2e/fixtures.ts e2e/routing.spec.ts e2e/extraction.spec.ts
git commit -m "test: check YouTube and X extraction end to end on captured fixtures"
```

---

### Task 2: Local fixture server behind Chromium's resolver

Added after the network leak (spec, "Network leak"). Task 1's `context.route` routing is replaced; its specs must still pass.

**Files:**
- Create: `e2e/fixture-server.ts`
- Modify: `e2e/fixtures.ts` (replace the whole file)
- Modify: `e2e/routing.spec.ts` (replace the whole file)

**Interfaces:**
- Consumes (from Task 1): the fixture API of `e2e/fixtures.ts` (kept unchanged for the specs)
- Produces:
  - `e2e/fixture-server.ts`: `PAGE_ORIGIN`, `readFixture(name)`, `fixtureForUrl(url: URL): string | undefined`, `startFixtureServer(): Promise<FixtureServer>` with `FixtureServer { resolverRules: string; requests: string[]; override(host: string, name: string): void; reset(): void; close(): Promise<void> }`
  - `e2e/fixtures.ts`: everything Task 1 produced, plus the worker fixture `fixtureServer: FixtureServer`. `serveFixture(host, name)` now calls `fixtureServer.override`
  - `fixtureServer.requests` entries look like `chatgpt.com/?opened-by=extension document` (`<hostname><path><query> <Sec-Fetch-Dest>`)

- [ ] **Step 1: Put the safety net in first**

`e2e/injection.spec.ts` is in the working tree, uncommitted, from the stopped first attempt. Do not run it until Step 8.

In `e2e/fixtures.ts`, in the `context` fixture's `args`, add `'--host-resolver-rules=MAP * ~NOTFOUND'` after the `--load-extension` entry. This alone keeps every request of the browser off the network (the `.e2e.test` pages still come from `context.route`, which fulfills without resolving).

Run: `pnpm test:e2e routing extraction.spec copy popup`
Expected: PASS except `never reaches a site outside the test pages`, which now fails with `net::ERR_NAME_NOT_RESOLVED` instead of `ERR_FAILED` (it is rewritten in Step 2)

- [ ] **Step 2: Write the failing routing tests**

Replace `e2e/routing.spec.ts` with:

```ts
import { CHATGPT_SELECTORS } from '../src/constants/Selectors';
import { expect, PAGE_ORIGIN, readFixture, test } from './fixtures';

test('never reaches a site outside the test pages', async ({ context }) => {
  const page = await context.newPage();
  await expect(page.goto('https://example.com/')).rejects.toThrow(/net::ERR_NAME_NOT_RESOLVED/);
});

test('answers a missing test page with 404', async ({ context }) => {
  const page = await context.newPage();
  const response = await page.goto(`${PAGE_ORIGIN}/no-such-page`);
  expect(response?.status()).toBe(404);
});

test('serves a fixture host its fixture and nothing else', async ({ context }) => {
  const page = await context.newPage();
  const response = await page.goto('https://chatgpt.com/');
  expect(await response?.text()).toContain('<!-- fixture: chatgpt-composer |');

  /* A fixture keeps the site's own URLs for images, scripts and API calls */
  const status = await page.evaluate(() => fetch('https://chatgpt.com/backend-api/me').then(answer => answer.status));
  expect(status).toBe(404);
});

test('answers a tab the extension opens from the local server', async ({ serviceWorker, fixtureServer, waitForServicePage }) => {
  /* The first navigation of such a tab is the one context.route missed */
  await serviceWorker.evaluate(() => chrome.tabs.create({ url: 'https://chatgpt.com/?opened-by=extension' }));

  const page = await waitForServicePage('chatgpt.com');
  await expect(page.locator(CHATGPT_SELECTORS.editor).first()).toBeAttached();
  expect(fixtureServer.requests).toContain('chatgpt.com/?opened-by=extension document');
});

test('keeps requests of the extension off the network', async ({ serviceWorker }) => {
  const result = await serviceWorker.evaluate(() =>
    fetch('https://example.com/').then(
      () => 'answered',
      () => 'failed'
    )
  );
  expect(result).toBe('failed');
});

test('names a fixture that does not exist', () => {
  expect(() => readFixture('no-such-fixture')).toThrow('No captured fixture no-such-fixture');
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm test:e2e routing`
Expected: FAIL — `Test has unknown parameter "fixtureServer"` for the extension tab test; `serves a fixture host its fixture and nothing else` fails because the `fetch` is aborted (rejects) instead of answering 404. With the safety net in place, no request leaves the machine.

- [ ] **Step 4: Create `e2e/fixture-server.ts`**

```ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.dirname(E2E_DIR);
const PAGES_DIR = path.join(E2E_DIR, 'pages');
/* Sanitized snapshots of live pages, shared with the Jest tests */
const FIXTURES_DIR = path.join(REPO_DIR, 'src', 'features', 'content', '__fixtures__');

/* .test is reserved for testing (RFC 6761), so even a resolver mistake cannot reach a real site */
const PAGE_HOST = 'news.e2e.test';
export const PAGE_ORIGIN = `https://${PAGE_HOST}`;

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
const X_HOST = 'x.com';
const X_ARTICLE_PATH = '/Safety/status/1801282137921871887';

/* Every host the browser resolves to the server; any other host does not resolve */
const SERVED_HOSTS = [PAGE_HOST, X_HOST, ...Object.keys(FIXTURE_HOSTS)];

export interface CapturedFixture {
  html: string;
  /* The URL the fixture was captured from */
  source: string;
}

export interface FixtureServer {
  /* Value for Chromium's --host-resolver-rules: the served hosts to this server, every other host to nowhere */
  resolverRules: string;
  /* Every request received since the last reset, as "<hostname><path><query> <Sec-Fetch-Dest>" */
  requests: string[];
  /* Answer a served host with another fixture until the next reset */
  override: (host: string, name: string) => void;
  /* Drop the overrides and the request log, between tests */
  reset: () => void;
  close: () => Promise<void>;
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
 * The fixture a live URL is answered with by default
 * @param url - The requested URL
 * @returns The fixture name, or undefined for a host without one
 */
export const fixtureForUrl = (url: URL): string | undefined => {
  if (url.hostname === X_HOST) return url.pathname === X_ARTICLE_PATH ? 'x-article' : 'x-post';
  return FIXTURE_HOSTS[url.hostname];
};

/**
 * Read a hand-written test page of e2e/pages/
 * @param pathname - The URL path, the file name without .html
 * @returns The HTML, or undefined when there is no such page
 */
const readTestPage = (pathname: string): string | undefined => {
  const file = path.join(PAGES_DIR, `${pathname.slice(1)}.html`);
  return path.dirname(file) === PAGES_DIR && existsSync(file) ? readFileSync(file, 'utf8') : undefined;
};

/**
 * Create a self-signed certificate for the server; the browser is started to accept it
 * @returns The private key and the certificate, in PEM
 */
const createCertificate = (): { key: Buffer; cert: Buffer } => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ai-summarizer-e2e-cert-'));
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=ai-summarizer-e2e', '-keyout', keyFile, '-out', certFile], {
      stdio: 'pipe',
    });
    return { key: readFileSync(keyFile), cert: readFileSync(certFile) };
  } catch (error) {
    throw new Error(`openssl is needed to create the test certificate: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/**
 * Start the HTTPS server that answers every served host. Only page loads get HTML; images, scripts
 * and API calls get 404, since the fixtures keep the site's own URLs for them
 * @returns The running server
 */
export const startFixtureServer = async (): Promise<FixtureServer> => {
  const overrides = new Map<string, string>();
  const requests: string[] = [];

  const server = createServer(createCertificate(), (request, response) => {
    const url = new URL(request.url ?? '/', `https://${request.headers.host ?? 'unknown.invalid'}`);
    const destination = String(request.headers['sec-fetch-dest'] ?? '');
    requests.push(`${url.hostname}${url.pathname}${url.search} ${destination}`);

    let html: string | undefined;
    if (destination === 'document') {
      if (url.hostname === PAGE_HOST) {
        html = readTestPage(url.pathname);
      } else {
        const name = overrides.get(url.hostname) ?? fixtureForUrl(url);
        if (name) html = readFixture(name).html;
      }
    }
    if (html === undefined) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    resolverRules: [...SERVED_HOSTS.map(host => `MAP ${host} 127.0.0.1:${port}`), 'MAP * ~NOTFOUND'].join(', '),
    requests,
    override: (host: string, name: string) => {
      if (!SERVED_HOSTS.includes(host)) throw new Error(`${host} is not served: add it to FIXTURE_HOSTS in e2e/fixture-server.ts`);
      /* Fail now on an unknown name, rather than on the first request */
      readFixture(name);
      overrides.set(host, name);
    },
    reset: () => {
      overrides.clear();
      requests.length = 0;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close(error => (error ? reject(error) : resolve()));
      }),
  };
};
```

- [ ] **Step 5: Replace `e2e/fixtures.ts`**

```ts
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test as base, type BrowserContext, chromium, expect, type Page, type Worker } from '@playwright/test';

import { fixtureForUrl, type FixtureServer, PAGE_ORIGIN, readFixture, startFixtureServer } from './fixture-server';

export { expect, PAGE_ORIGIN, readFixture };

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.dirname(E2E_DIR);

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

interface WorkerFixtures {
  fixtureServer: FixtureServer;
}

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

export const test = base.extend<ExtensionFixtures & ExtensionOptions, WorkerFixtures>({
  distDir: ['dist/prod', { option: true }],

  fixtureServer: [
    /* eslint-disable-next-line no-empty-pattern */
    async ({}, use) => {
      const server = await startFixtureServer();
      await use(server);
      await server.close();
    },
    { scope: 'worker' },
  ],

  context: async ({ distDir, fixtureServer }, use, testInfo) => {
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
        /* The fixture server's certificate is self-signed */
        ignoreHTTPSErrors: true,
        args: [
          `--disable-extensions-except=${extensionDir}`,
          `--load-extension=${extensionDir}`,
          /*
           * Every request of the browser, including the tabs the extension opens, which context.route
           * does not catch, goes to the fixture server or fails to resolve. Nothing reaches a live site
           */
          `--host-resolver-rules=${fixtureServer.resolverRules}`,
          '--ignore-certificate-errors',
        ],
      });

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
      fixtureServer.reset();
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
      if (fixtureForUrl(new URL(source)) !== name) throw new Error(`${source} is not answered with ${name}: add its host to FIXTURE_HOSTS in e2e/fixture-server.ts`);
      return openUrl(context, source, `check the fixture server's answer for ${name}`);
    });
  },

  serveFixture: async ({ fixtureServer }, use) => {
    await use(async (host: string, name: string) => fixtureServer.override(host, name));
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
```

Then append, unchanged from Task 1's version, the helpers `waitForToast`, `readClipboard`, `writeClipboard`, `readComposer` and `expectArticleInjected` (copy them from the current file before replacing it).

- [ ] **Step 6: Run the routing spec**

Run: `pnpm test:e2e routing`
Expected: PASS — 6 tests × 2 projects = 12 passed

- [ ] **Step 7: See the routing tests detect a failure**

Temporarily change `if (destination === 'document')` in `e2e/fixture-server.ts` to `if (destination === 'iframe')` and run `pnpm test:e2e routing --project prod`.
Expected: FAIL in `serves a fixture host its fixture and nothing else` and `answers a tab the extension opens from the local server` (404 instead of the fixture). No request leaves the machine: the resolver rules are unchanged.

Revert. Run `git diff e2e/fixture-server.ts` — expected: nothing beyond the new file (it is untracked; compare with Step 4 instead).

- [ ] **Step 8: Run every spec except injection**

Run: `pnpm test:e2e --grep-invert "injects the article"`
Expected: PASS — routing, extraction, popup, options, copy and extraction-failure in both projects (28 passed)

- [ ] **Step 9: Lint, format, type-check**

Run: `pnpm prettier-fix`
Run: `pnpm eslint-check`
Run: `pnpm type-check`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add e2e/fixture-server.ts e2e/fixtures.ts e2e/routing.spec.ts
git commit -m "test: serve E2E pages from a local HTTPS server behind the resolver"
git show --stat HEAD
```

Expected: exactly the three files; `e2e/injection.spec.ts` and `.superpowers/` stay out

---

### Task 3: Injection into every composer

**Files:**
- Create: `e2e/injection.spec.ts`

**Interfaces:**
- Consumes (from Tasks 1 and 2, `e2e/fixtures.ts`): `test` fixtures `openPage`, `openPopupFor`, `serveFixture(host, name)`, `waitForServicePage(host)`; `expectArticleInjected(page, editorSelector)`
- Consumes: editor selectors from `src/constants/Selectors.ts` (that file imports nothing, so it loads outside the extension)
- Produces: nothing for later tasks

- [ ] **Step 1: Write the spec**

`e2e/injection.spec.ts` is already in the working tree from the stopped first attempt; make sure it matches this content:

```ts
import {
  AISTUDIO_SELECTORS,
  CHATGPT_SELECTORS,
  CLAUDE_SELECTORS,
  DEEPSEEK_SELECTORS,
  GEMINI_SELECTORS,
  GROK_SELECTORS,
  KIMI_SELECTORS,
  PERPLEXITY_SELECTORS,
  QWEN_SELECTORS,
} from '../src/constants/Selectors';
import { expectArticleInjected, test } from './fixtures';

interface Composer {
  /* Shown in the test title */
  name: string;
  /* The service's button in the popup */
  label: string;
  /* The host the summary opens on */
  host: string;
  /* The editor the injector fills */
  editor: string;
  /* A fixture other than the host's default */
  fixture?: string;
}

const COMPOSERS: Composer[] = [
  { name: 'ChatGPT', label: 'ChatGPT', host: 'chatgpt.com', editor: CHATGPT_SELECTORS.editor },
  { name: 'ChatGPT signed out', label: 'ChatGPT', host: 'chatgpt.com', editor: CHATGPT_SELECTORS.editor, fixture: 'chatgpt-guest-composer' },
  { name: 'Gemini', label: 'Gemini', host: 'gemini.google.com', editor: GEMINI_SELECTORS.editor },
  { name: 'AI Studio', label: 'AI Studio', host: 'aistudio.google.com', editor: AISTUDIO_SELECTORS.editor },
  { name: 'Claude', label: 'Claude', host: 'claude.ai', editor: CLAUDE_SELECTORS.editor },
  { name: 'Grok', label: 'Grok', host: 'grok.com', editor: GROK_SELECTORS.editor },
  { name: 'Grok signed out', label: 'Grok', host: 'grok.com', editor: GROK_SELECTORS.editor, fixture: 'grok-textarea-composer' },
  { name: 'Perplexity', label: 'Perplexity', host: 'www.perplexity.ai', editor: PERPLEXITY_SELECTORS.editor },
  { name: 'DeepSeek', label: 'DeepSeek', host: 'chat.deepseek.com', editor: DEEPSEEK_SELECTORS.editor },
  { name: 'Kimi', label: 'Kimi', host: 'www.kimi.ai', editor: KIMI_SELECTORS.editor },
  { name: 'Qwen', label: 'Qwen', host: 'chat.qwen.ai', editor: QWEN_SELECTORS.editor },
];

for (const composer of COMPOSERS) {
  test(`injects the article into ${composer.name}`, async ({ openPage, openPopupFor, serveFixture, waitForServicePage }) => {
    if (composer.fixture) await serveFixture(composer.host, composer.fixture);
    const article = await openPage('article');
    const popup = await openPopupFor(article);

    await popup.getByText(composer.label, { exact: true }).click();

    const service = await waitForServicePage(composer.host);
    await expectArticleInjected(service, composer.editor);
  });
}
```

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e injection`
Expected: PASS — 11 tests × 2 projects = 22 passed

If a test fails, find out why before changing anything:
- Toast never appears and the composer is empty in the failure screenshot: check whether `INJECT_ARTICLE` arrived before the content script registered its listener (the service worker logs `Failed to send message to content script` in the dev build; read it with `serviceWorker.on('console', …)` in a throwaway local edit). If that is the cause, **stop**: report it to the user as a product race on fast pages, with the evidence. Do not add retries or delays to the tests
- Toast "Couldn't …" or a failure toast: the injector rejected the fixture; compare with the service's Jest test in `src/features/content/injectors/__tests__/`
- Tab not found on the host: the popup label or the host in `COMPOSERS` is wrong; compare with `getSummarizeUrl` in `src/types/AIService.ts`

- [ ] **Step 3: See the check detect a failure**

Temporarily change `ARTICLE_SENTENCE` in `e2e/fixtures.ts` to `'a sentence that is not in the article'` and run `pnpm test:e2e injection --project prod -g Claude`.
Expected: FAIL on `toContain`.

Temporarily change `{ name: 'Claude', label: 'Claude', host: 'claude.ai', … }` to `host: 'claude.com'` and run the same command.
Expected: FAIL with `a tab on claude.com opened by the extension` after about 10 s.

Revert both. Run `git diff e2e/fixtures.ts` — expected: no output.

- [ ] **Step 4: Lint, format, type-check**

Run: `pnpm prettier-fix`
Run: `pnpm eslint-check`
Run: `pnpm type-check`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add e2e/injection.spec.ts
git commit -m "test: check injection into every AI service composer end to end"
```

---

### Task 4: Context menu hook, its specs and the production build check

**Files:**
- Modify: `src/pages/ServiceWorker.ts` (imports block end: `declare global`; `initialize()`: the dev-only block before `this.isInitialized = true;`)
- Create: `e2e/context-menu.spec.ts`
- Create: `e2e/prod-build.spec.ts`

**Interfaces:**
- Consumes (from Tasks 1 and 2): `test` fixtures `distDir`, `openPage`, `serviceWorker`, `tabIdFor`, `waitForServicePage`; helpers `expectArticleInjected`, `readClipboard`, `waitForToast`, `expect`, `PAGE_ORIGIN`
- Produces: `globalThis.__aiSummarizerE2E?: { clickContextMenu(menuItemId: string, tabId: number): Promise<void> }` in development builds; menu item IDs come from `src/models/ContextMenuItems.ts` (`'copy'`, `'claude'`)

- [ ] **Step 1: Write the failing specs**

Create `e2e/context-menu.spec.ts`:

```ts
import { CLAUDE_SELECTORS } from '../src/constants/Selectors';
import { expect, expectArticleInjected, PAGE_ORIGIN, readClipboard, test, waitForToast } from './fixtures';

test.skip(({ distDir }) => distDir !== 'dist/dev', 'The context menu hook exists in development builds only');

/**
 * Click a context menu item through the hook. Runs in the service worker
 * @param args - The menu item ID (src/models/ContextMenuItems.ts) and the tab it is clicked on
 */
const clickMenuItem = async ({ menuItemId, tabId }: { menuItemId: string; tabId: number }): Promise<void> => {
  if (!globalThis.__aiSummarizerE2E) throw new Error('No context menu hook: is this a development build?');
  await globalThis.__aiSummarizerE2E.clickContextMenu(menuItemId, tabId);
};

test('copies the article from the context menu', async ({ openPage, serviceWorker, tabIdFor }) => {
  const article = await openPage('article');
  const tabId = await tabIdFor(article);

  await serviceWorker.evaluate(clickMenuItem, { menuItemId: 'copy', tabId });

  /* Checked right after the click: the success toast disappears after 3 s */
  await waitForToast(article, 'Article copied to clipboard');
  const text = await readClipboard(article);
  expect(text).toContain("# Title\nThe Lighthouse Keeper's Log");
  expect(text).toContain(`# URL\n${PAGE_ORIGIN}/article`);
});

test('opens Claude with the article from the context menu', async ({ openPage, serviceWorker, tabIdFor, waitForServicePage }) => {
  const article = await openPage('article');
  const tabId = await tabIdFor(article);

  await serviceWorker.evaluate(clickMenuItem, { menuItemId: 'claude', tabId });

  const claude = await waitForServicePage('claude.ai');
  await expectArticleInjected(claude, CLAUDE_SELECTORS.editor);
});
```

Create `e2e/prod-build.spec.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from './fixtures';

const REPO_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/* Defined in src/pages/ServiceWorker.ts for development builds only */
const HOOK_NAME = '__aiSummarizerE2E';

test.skip(({ distDir }) => distDir !== 'dist/prod', 'Only the production build must leave the hook out');

/* Uses no browser: the context fixture is never requested, so Chromium is not launched */
test('leaves the context menu hook out of the production build', ({ distDir }) => {
  const dir = path.resolve(REPO_DIR, distDir);
  const scripts = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.js'));
  expect(scripts.length).toBeGreaterThan(0);

  const withHook = scripts.filter(file => readFileSync(path.join(dir, file), 'utf8').includes(HOOK_NAME));
  expect(withHook).toEqual([]);
});
```

- [ ] **Step 2: Run them to see the context menu specs fail**

Run: `pnpm test:e2e context-menu prod-build`
Expected: the two dev context menu tests FAIL with `No context menu hook: is this a development build?` (Playwright strips types, so the missing declaration does not stop the run); the prod build check PASSES, since no hook exists yet

Run: `pnpm type-check`
Expected: FAIL — `Property '__aiSummarizerE2E' does not exist on type 'typeof globalThis'` in `e2e/context-menu.spec.ts`

- [ ] **Step 3: Add the hook**

In `src/pages/ServiceWorker.ts`, after the `getPendingAIServiceKey` line, add:

```ts
declare global {
  /* Test hook of development builds, defined in ServiceWorker.initialize() */
  var __aiSummarizerE2E: { clickContextMenu: (menuItemId: string, tabId: number) => Promise<void> } | undefined;
}
```

In `initialize()`, directly before `this.isInitialized = true;`, add:

```ts
    /*
     * Test hook: no test tool can click a native context menu (e2e/context-menu.spec.ts). Kept inline:
     * production builds drop this whole block, while a method would stay in the bundle
     */
    if (process.env.NODE_ENV === 'development') {
      globalThis.__aiSummarizerE2E = {
        clickContextMenu: async (menuItemId: string, tabId: number) => this.handleContextMenuClicked({ menuItemId, editable: false }, await chrome.tabs.get(tabId)),
      };
    }
```

- [ ] **Step 4: Rebuild both builds**

Run: `pnpm build`
Run: `pnpm start`
Expected: both finish without errors

- [ ] **Step 5: Run the specs**

Run: `pnpm test:e2e context-menu prod-build`
Expected: PASS — dev: 2 context menu tests passed, prod build check skipped; prod: build check passed, 2 context menu tests skipped

- [ ] **Step 6: See the build check and the menu specs detect a failure**

Temporarily change the skip in `e2e/prod-build.spec.ts` to `distDir !== 'dist/dev'` and run `pnpm test:e2e prod-build --project dev`.
Expected: FAIL, `withHook` lists `service-worker.js`.

Temporarily change `menuItemId: 'claude'` to `menuItemId: 'chatgpt'` and run `pnpm test:e2e context-menu --project dev -g Claude`.
Expected: FAIL with `a tab on claude.ai opened by the extension`.

Revert both. Run `git diff e2e/` — expected: no output.

- [ ] **Step 7: Run every check**

Run: `pnpm test:e2e`
Expected: PASS — all specs, both projects

Run: `pnpm test`
Expected: PASS (Jest; the service worker change touches no unit under test)

Run: `pnpm prettier-fix`
Run: `pnpm eslint-check`
Run: `pnpm type-check`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/pages/ServiceWorker.ts e2e/context-menu.spec.ts e2e/prod-build.spec.ts
git commit -m "test: drive the context menu through a development-only hook"
```

---

### Task 5: Documentation, final verification and pull request

**Files:**
- Modify: `CLAUDE.md` (the `pnpm test:e2e` line under "Commands")

**Interfaces:**
- Consumes: Tasks 1–4
- Produces: the pull request

- [ ] **Step 1: Update CLAUDE.md**

Replace the line

```
- `pnpm test:e2e` — Playwright end-to-end tests (`e2e/`) of `dist/prod` and `dist/dev` in headless Chromium. Build both first (`pnpm build`, `pnpm start`): a build left from another branch is tested as is. One-time setup: `pnpm exec playwright install chromium`
```

with

```
- `pnpm test:e2e` — Playwright end-to-end tests (`e2e/`) of `dist/prod` and `dist/dev` in headless Chromium, offline: hand-written pages in `e2e/pages/` and the captured fixtures of `src/features/content/__fixtures__/`, served at their real hosts. The context menu is driven through `__aiSummarizerE2E`, a hook only development builds define; a test checks that `dist/prod` leaves it out. Build both first (`pnpm build`, `pnpm start`): a build left from another branch is tested as is. One-time setup: `pnpm exec playwright install chromium`
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe the E2E fixtures and the context menu hook"
git show --stat HEAD
```

Expected: only `CLAUDE.md`; no `.superpowers/`

- [ ] **Step 3: Final verification from clean builds**

Run: `pnpm build`
Run: `pnpm start`
Run: `pnpm test:e2e`
Run: `pnpm test`
Run: `pnpm prettier-check`
Run: `pnpm eslint-check`
Run: `pnpm type-check`
Expected: all pass. Record the E2E totals (passed / skipped) and the run time for the PR body

- [ ] **Step 4: Checkpoint with the user**

Report the results and ask before pushing and opening the pull request (outward-facing). Do not continue without an answer.

- [ ] **Step 5: Push and open the pull request into `develop`**

```bash
git push -u origin feat/fut-192-chrome-e2e-extraction-injection
gh pr create --base develop --title "test: Chrome E2E for YouTube / X extraction, injection and the context menu" --body "<body>"
```

The body (English, no AI attribution): summary of the three scenario groups, the dev-only hook and the build check, the local totals from Step 3, and `Fixes FUT-192`.

- [ ] **Step 6: Watch CI**

Run: `gh pr checks --watch`
Expected: `check` and `e2e` pass. If `e2e` fails only in CI, download the `playwright-report` artifact and read the failure before changing anything

- [ ] **Step 7: Linear**

Move FUT-192 to In Review with a comment linking the PR.
