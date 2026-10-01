# Chrome E2E Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the built Chrome extension (`dist/prod` and `dist/dev`) in headless Chromium with Playwright, check the popup, options page, copy and toasts on a local article page, and run it in CI.

**Architecture:** A Playwright Test suite in a new top-level `e2e/` directory. A custom fixture launches a persistent Chromium context with the unpacked build loaded, answers every `https://*.e2e.test/` request with a local HTML page and aborts all other network requests. Helpers drive the real popup (opened in a tab, with the target tab made active) and read toasts from the CDP accessibility tree, since the content script's shadow root is closed.

**Tech Stack:** `@playwright/test` 1.63.0 (already a dev dependency), bundled Chromium (`channel: 'chromium'`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-01-chrome-e2e-foundation-design.md`

## Global Constraints

- No new dependencies and no version changes (`@playwright/test` stays at the locked 1.63.0)
- Browser: `chromium.launchPersistentContext`, `channel: 'chromium'`, `headless: true`, `locale: 'en-US'`
- Projects: `prod` → `dist/prod`, `dev` → `dist/dev`; the config never builds
- Missing build error message: `Build <dir> first (pnpm build / pnpm start)`
- No network: only `https://*.e2e.test/` is answered (from `e2e/pages/`); every other http(s) request is aborted and logged
- Toast checks read the CDP accessibility tree in both builds; no baseline screenshots (that is FUT-161)
- CI: new `e2e` job in `.github/workflows/ci.yml`, `permissions: contents: read` stays, no secrets, report artifact on failure only, 7 days
- Source comments in English, block comments (`/* */`) only, even for one line (repo rule)
- Prettier: single quotes, semicolons, `printWidth: 160`, import order plugin (run `pnpm prettier-fix` before each commit)
- Commit messages: Conventional Commits, English, no AI attribution or `Co-Authored-By`
- Stage files by path; never `git add -A` (an untracked `.superpowers/` directory exists and must stay out)

## Review Focus

- Stale build: `dist/dev` or `dist/prod` built from another branch makes the suite test old code. Expected: CI always builds fresh; locally the config comment says to rebuild. Not testable; Task 1 puts the warning in `e2e/playwright.config.ts`
- A request outside `*.e2e.test` (a page or the extension reaching the network): expected to fail fast, never to hang or reach the site. Task 1 adds `routing.spec.ts`
- Popup rendered before the target tab became active: it shows "Not available on this page". Expected: `openPopupFor` fails with a clear timeout on "Summarize this page", not a later confusing click error. Covered by `openPopupFor` waiting for that text (Task 1)
- Success toast gone before the check (it disappears after 3 s): expected to be found when polling starts right after the click. `waitForToast` polls every 100 ms (Task 2)
- Two tests sharing the clipboard: a parallel run could read another test's copy. Expected: tests are isolated. `workers: 1` in the config (Task 1), and the failure test writes its own sentinel first (Task 3)

---

## File Structure

| File | Responsibility |
|---|---|
| `e2e/playwright.config.ts` | Projects (`prod` / `dev`), test match, reporter, single worker |
| `e2e/fixtures.ts` | Extended `test`: `distDir` option, `context` (extension loaded, routing), `serviceWorker`, `extensionId`, `openPage`, `openPopupFor`; helpers `waitForToast`, `readClipboard`, `writeClipboard` |
| `e2e/pages/article.html` | Readable article with a known title and paragraphs |
| `e2e/pages/empty.html` | Page without readable content |
| `e2e/routing.spec.ts` | Nothing outside `*.e2e.test` is reachable |
| `e2e/popup.spec.ts` | Popup renders the full menu for an article page |
| `e2e/options.spec.ts` | Options page renders |
| `e2e/copy.spec.ts` | Copy puts the article on the clipboard and shows the toast |
| `e2e/extraction-failure.spec.ts` | Copy on an empty page shows the failure toast and leaves the clipboard alone |
| `package.json` | `test:e2e` script; `e2e/**/*.ts` in the ESLint / Prettier globs |
| `tsconfig.json` | Include `e2e/**/*.ts` |
| `jest.config.js` | Ignore `e2e/` (Jest's default match would pick up `*.spec.ts`) |
| `.gitignore` | `/playwright-report`, `/test-results` |
| `.github/workflows/ci.yml` | `e2e` job |
| `DIRECTORYSTRUCTURE.md` | `e2e/` entry |

---

### Task 1: E2E harness with the popup, options and routing specs

**Files:**
- Create: `e2e/playwright.config.ts`, `e2e/fixtures.ts`, `e2e/pages/article.html`, `e2e/routing.spec.ts`, `e2e/popup.spec.ts`, `e2e/options.spec.ts`
- Modify: `package.json` (scripts), `tsconfig.json` (`include`), `jest.config.js`, `.gitignore`, `DIRECTORYSTRUCTURE.md`

**Interfaces:**
- Produces (from `e2e/fixtures.ts`):
  - `test` — Playwright `test` extended with fixtures `distDir: string` (option), `context: BrowserContext`, `serviceWorker: Worker`, `extensionId: string`, `openPage: (name: string) => Promise<Page>`, `openPopupFor: (target: Page) => Promise<Page>`
  - `expect` — re-exported from `@playwright/test`
  - `PAGE_ORIGIN = 'https://news.e2e.test'`
  - `interface ExtensionOptions { distDir: string }`

- [ ] **Step 1: Build both extension builds fresh**

The local `dist/` may come from another branch.

Run: `pnpm build`
Expected: webpack finishes, `dist/prod/manifest.json` exists

Run: `pnpm start`
Expected: webpack finishes and exits (no watch), `dist/dev/manifest.json` exists

- [ ] **Step 2: Exclude `e2e/` from Jest and add it to the tooling**

`jest.config.js` — add `testPathIgnorePatterns` after `testEnvironment`:

```js
  testEnvironment: 'node',
  /* e2e/ holds Playwright specs, run by pnpm test:e2e */
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/'],
```

`tsconfig.json` — add `"e2e/**/*.ts"` to `include`, after `"scripts/**/*.ts"`:

```json
    "scripts/**/*.ts",
    "e2e/**/*.ts",
    "webpack.config.ts"
```

`package.json` — add `"e2e/**/*.ts"` to the four lint / format scripts and add `test:e2e` after `test`:

```json
    "prettier-check": "prettier --config prettier.config.js --check \"src/**/*.{js,jsx,ts,tsx,css,scss,json}\" \"build/**/*.ts\" \"scripts/**/*.ts\" \"e2e/**/*.ts\"",
    "prettier-fix": "prettier --config prettier.config.js --write \"src/**/*.{js,jsx,ts,tsx,css,scss,json}\" \"build/**/*.ts\" \"scripts/**/*.ts\" \"e2e/**/*.ts\"",
    "eslint-check": "eslint \"src/**/*.{ts,tsx,js,jsx}\" \"build/**/*.ts\" \"scripts/**/*.ts\" \"e2e/**/*.ts\"",
    "eslint-fix": "eslint --fix \"src/**/*.{ts,tsx,js,jsx}\" \"build/**/*.ts\" \"scripts/**/*.ts\" \"e2e/**/*.ts\"",
```

```json
    "test": "jest",
    "test:e2e": "playwright test --config e2e/playwright.config.ts",
```

`.gitignore` — append under `# testing`:

```
# testing
/coverage
/playwright-report
/test-results
```

- [ ] **Step 3: Write the article page**

`e2e/pages/article.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>The Lighthouse Keeper's Log</title>
  </head>
  <body>
    <header><nav><a href="/">E2E News</a></nav></header>
    <main>
      <article>
        <h1>The Lighthouse Keeper's Log</h1>
        <p>The lighthouse keeper recorded every passing ship in a leather-bound log, noting the hour, the weather and the flag each vessel flew.</p>
        <p>For forty years the entries followed the same pattern, until a winter storm in 1911 left a page that described a ship nobody else had seen.</p>
        <p>Historians who studied the log later found that the ship matched the description of a schooner reported missing two decades earlier.</p>
        <p>The keeper never mentioned the sighting to anyone, and the page stayed unread in the lighthouse archive until the building was restored.</p>
        <p>Today the log is kept in the town museum, open at the page of the storm, next to a painting of the schooner made from the keeper's notes.</p>
      </article>
    </main>
    <footer><p>E2E News is a test page for the extension's end-to-end tests.</p></footer>
  </body>
</html>
```

- [ ] **Step 4: Write the fixtures**

`e2e/fixtures.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test as base, type BrowserContext, chromium, expect, type Page, type Route, type Worker } from '@playwright/test';

export { expect };

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.dirname(E2E_DIR);
const PAGES_DIR = path.join(E2E_DIR, 'pages');

/* .test is reserved for testing (RFC 6761), so a routing mistake cannot reach a real site */
const PAGE_HOST_SUFFIX = '.e2e.test';
export const PAGE_ORIGIN = 'https://news.e2e.test';

export interface ExtensionOptions {
  /* The unpacked build to load, relative to the repository root */
  distDir: string;
}

interface ExtensionFixtures {
  serviceWorker: Worker;
  extensionId: string;
  openPage: (name: string) => Promise<Page>;
  openPopupFor: (target: Page) => Promise<Page>;
}

/**
 * Answer the test pages from e2e/pages/ and keep everything else off the network
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
  console.warn(`[e2e] Aborted a request outside ${PAGE_HOST_SUFFIX}: ${url.href}`);
  return route.abort();
};

export const test = base.extend<ExtensionFixtures & ExtensionOptions>({
  distDir: ['dist/prod', { option: true }],

  context: async ({ distDir }, use, testInfo) => {
    const extensionDir = path.resolve(REPO_DIR, distDir);
    if (!existsSync(path.join(extensionDir, 'manifest.json'))) throw new Error(`Build ${distDir} first (pnpm build / pnpm start)`);

    /* A fresh profile per test, so no storage or tab carries over */
    const userDataDir = mkdtempSync(path.join(tmpdir(), 'ai-summarizer-e2e-'));
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

    /* Playwright does not capture pages of a persistent context on failure, so attach them here */
    if (testInfo.status !== testInfo.expectedStatus) {
      for (const [index, page] of context.pages().entries()) {
        const screenshot = await page.screenshot().catch(() => null);
        if (screenshot) await testInfo.attach(`page-${index}.png`, { body: screenshot, contentType: 'image/png' });
      }
    }
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
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
    await use(async (name: string) => {
      const page = await context.newPage();
      await page.goto(`${PAGE_ORIGIN}/${name}`);
      /* The content script appends its root to the body once it runs */
      await page.locator('#free-ai-summarizer-root').waitFor({ state: 'attached' });
      return page;
    });
  },

  openPopupFor: async ({ context, serviceWorker, extensionId }, use) => {
    await use(async (target: Page) => {
      const targetUrl = target.url();
      const tabId = await serviceWorker.evaluate(async url => (await chrome.tabs.query({ url }))[0]?.id, targetUrl);
      if (tabId === undefined) throw new Error(`No tab found for ${targetUrl}`);

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
});
```

- [ ] **Step 5: Write the config**

`e2e/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

import type { ExtensionOptions } from './fixtures';

/*
 * Runs the built extension, so build it first: pnpm build (dist/prod) and pnpm start (dist/dev).
 * A build left over from another branch tests that branch's code.
 */
export default defineConfig<ExtensionOptions>({
  testDir: '.',
  testMatch: '*.spec.ts',
  /* One browser at a time: the clipboard may be shared between browser instances */
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  outputDir: '../test-results',
  projects: [
    { name: 'prod', use: { distDir: 'dist/prod' } },
    { name: 'dev', use: { distDir: 'dist/dev' } },
  ],
});
```

- [ ] **Step 6: Write the routing, popup and options specs**

`e2e/routing.spec.ts`:

```ts
import { expect, PAGE_ORIGIN, test } from './fixtures';

test('never reaches a site outside the test pages', async ({ context }) => {
  const page = await context.newPage();
  await expect(page.goto('https://example.com/')).rejects.toThrow(/net::ERR_FAILED/);
});

test('answers a missing test page with 404', async ({ context }) => {
  const page = await context.newPage();
  const response = await page.goto(`${PAGE_ORIGIN}/no-such-page`);
  expect(response?.status()).toBe(404);
});
```

`e2e/popup.spec.ts`:

```ts
import { expect, test } from './fixtures';

/* Every AI service is on the menu by default */
const SERVICE_LABELS = ['ChatGPT', 'Gemini', 'AI Studio', 'Claude', 'Grok', 'Perplexity', 'DeepSeek', 'Kimi', 'Qwen'];

test('shows the full menu for an article page', async ({ openPage, openPopupFor }) => {
  const article = await openPage('article');
  const popup = await openPopupFor(article);

  for (const label of SERVICE_LABELS) {
    await expect(popup.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(popup.getByText('Copy to clipboard')).toBeVisible();
  await expect(popup.getByText('Settings', { exact: true })).toBeVisible();
});
```

`e2e/options.spec.ts`:

```ts
import { expect, test } from './fixtures';

test('renders the settings', async ({ context, extensionId }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(options).toHaveTitle('Free AI Summarizer Settings');
  for (const card of ['AI Service', 'Display on Menu', 'Open AI Service in']) {
    await expect(options.getByRole('heading', { name: card, exact: true })).toBeVisible();
  }
});
```

- [ ] **Step 7: Run the suite**

Run: `pnpm test:e2e`
Expected: 8 passed (4 tests × `prod` / `dev`)

If the TypeScript imports without extensions fail to resolve under `"type": "module"`, change the spec and config imports to `./fixtures.js` style only if Playwright's error says so, then rerun.

- [ ] **Step 8: See each spec fail on a wrong expectation (not committed)**

Temporarily change `'Copy to clipboard'` in `popup.spec.ts` to `'Copy to clipboard!'`, `'Free AI Summarizer Settings'` to `'Wrong title'`, and `404` to `200`.

Run: `pnpm test:e2e`
Expected: the popup, options and 404 tests fail in both projects with Playwright's assertion messages, and each failing test has `page-<n>.png` attachments listed in the output

Revert the three changes, then run `pnpm test:e2e` again. Expected: 8 passed.

- [ ] **Step 9: Check the missing-build error**

Run: `mv dist/dev dist/dev.bak`
Run: `pnpm test:e2e --project=dev`
Expected: every test fails with `Build dist/dev first (pnpm build / pnpm start)`
Run: `mv dist/dev.bak dist/dev`

- [ ] **Step 10: Document the directory**

`DIRECTORYSTRUCTURE.md` — in the tree, after the `scripts/` line:

```
├── e2e/                          # Playwright end-to-end tests of the built Chrome extension
```

and in the descriptions, after the `scripts/` line:

```
- `e2e/`: Playwright end-to-end tests that load `dist/prod` and `dist/dev` into headless Chromium (`pnpm test:e2e`, after `pnpm build` and `pnpm start`); `pages/` holds the hand-written pages they open
```

- [ ] **Step 11: Lint, format, type-check, unit tests**

Run: `pnpm prettier-fix`
Run: `pnpm eslint-check`
Expected: no errors
Run: `pnpm type-check`
Expected: no errors
Run: `pnpm test`
Expected: all Jest suites pass, and no `e2e/` file appears in the output

- [ ] **Step 12: Commit**

```bash
git add e2e/playwright.config.ts e2e/fixtures.ts e2e/pages/article.html e2e/routing.spec.ts e2e/popup.spec.ts e2e/options.spec.ts package.json tsconfig.json jest.config.js .gitignore DIRECTORYSTRUCTURE.md
git commit -m "test: run the built extension in headless Chromium with Playwright"
git show --stat HEAD
```

Expected: `git show --stat` lists only these files (no `.superpowers/`, no `dist/`)

---

### Task 2: Copy and toast

**Files:**
- Modify: `e2e/fixtures.ts` (add `waitForToast`, `readClipboard`, `writeClipboard`)
- Create: `e2e/copy.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect`, `PAGE_ORIGIN`, fixtures `openPage`, `openPopupFor` (Task 1)
- Produces:
  - `waitForToast(page: Page, text: string, timeout?: number): Promise<void>` — resolves once a node in the page's accessibility tree has a name containing `text`; fails after `timeout` (default 5000 ms)
  - `readClipboard(page: Page): Promise<string>`
  - `writeClipboard(page: Page, text: string): Promise<void>`

- [ ] **Step 1: Write the copy spec**

`e2e/copy.spec.ts`:

```ts
import { expect, PAGE_ORIGIN, readClipboard, test, waitForToast } from './fixtures';

test('copies the article with the prompt and shows a toast', async ({ openPage, openPopupFor }) => {
  const article = await openPage('article');
  const popup = await openPopupFor(article);

  await popup.getByText('Copy to clipboard').click();

  /* Checked right after the click: the success toast disappears after 3 s */
  await waitForToast(article, 'Article copied to clipboard');
  const text = await readClipboard(article);
  expect(text).toContain("# Title\nThe Lighthouse Keeper's Log");
  expect(text).toContain(`# URL\n${PAGE_ORIGIN}/article`);
  expect(text).toContain('a page that described a ship nobody else had seen');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:e2e copy`
Expected: FAIL — `waitForToast` / `readClipboard` are not exported from `./fixtures`

- [ ] **Step 3: Add the helpers**

Append to `e2e/fixtures.ts`:

```ts
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
    await cdp.detach();
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
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm test:e2e copy`
Expected: 2 passed (`prod`, `dev`)

- [ ] **Step 5: See it fail on a wrong toast text (not committed)**

Temporarily change `'Article copied to clipboard'` to `'Article copied!'`.
Run: `pnpm test:e2e copy`
Expected: FAIL with `toast containing "Article copied!"` after about 5 s, in both projects
Revert the change.

- [ ] **Step 6: Lint, format, type-check**

Run: `pnpm prettier-fix`
Run: `pnpm eslint-check`
Run: `pnpm type-check`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add e2e/fixtures.ts e2e/copy.spec.ts
git commit -m "test: check copying an article and its toast end to end"
git show --stat HEAD
```

---

### Task 3: Extraction failure

**Files:**
- Create: `e2e/pages/empty.html`, `e2e/extraction-failure.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect`, `openPage`, `openPopupFor` (Task 1); `waitForToast`, `readClipboard`, `writeClipboard` (Task 2)
- Produces: nothing new

- [ ] **Step 1: Write the empty page**

`e2e/pages/empty.html` (no title and no text, so Readability finds no article):

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
  </head>
  <body></body>
</html>
```

- [ ] **Step 2: Write the spec**

`e2e/extraction-failure.spec.ts`:

```ts
import { expect, readClipboard, test, waitForToast, writeClipboard } from './fixtures';

const SENTINEL = 'clipboard before the copy';

test('shows the failure toast and leaves the clipboard alone on a page without an article', async ({ openPage, openPopupFor }) => {
  const page = await openPage('empty');
  await writeClipboard(page, SENTINEL);
  const popup = await openPopupFor(page);

  await popup.getByText('Copy to clipboard').click();

  await waitForToast(page, "Couldn't extract this article");
  expect(await readClipboard(page)).toBe(SENTINEL);
});
```

- [ ] **Step 3: Run it**

Run: `pnpm test:e2e extraction-failure`
Expected: 2 passed

If it fails because the copy succeeded (the toast says "Article copied to clipboard"), Readability found content in the page: check that `empty.html` has no `<title>` and an empty `<body>`, then rerun.

- [ ] **Step 4: See it fail on a wrong expectation (not committed)**

Temporarily change `toBe(SENTINEL)` to `toBe('something else')`.
Run: `pnpm test:e2e extraction-failure`
Expected: FAIL showing the received sentinel, in both projects
Revert the change.

- [ ] **Step 5: Run the whole suite, then lint and format**

Run: `pnpm test:e2e`
Expected: 12 passed (6 tests × 2 projects)
Run: `pnpm prettier-fix`
Run: `pnpm eslint-check`
Run: `pnpm type-check`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add e2e/pages/empty.html e2e/extraction-failure.spec.ts
git commit -m "test: check the extraction failure toast end to end"
git show --stat HEAD
```

---

### Task 4: CI job

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm test:e2e` (Task 1), the `playwright-report/` output folder set in `e2e/playwright.config.ts` when `CI` is set (Task 1)
- Produces: the `e2e` job

- [ ] **Step 1: Add the job**

Append to `jobs:` in `.github/workflows/ci.yml`, after the `check` job (same indentation as `check:`):

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        uses: pnpm/action-setup@v2

      - name: Get pnpm store directory
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ env.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install

      - name: Get Playwright version
        id: playwright
        run: echo "version=$(node -p "require('@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ steps.playwright.outputs.version }}

      - name: Install Chromium
        run: pnpm exec playwright install --with-deps chromium

      - name: Build
        run: pnpm build

      - name: Build (development)
        run: pnpm start

      - name: E2E
        run: pnpm test:e2e

      # Hand-written test pages and the extension's own UI only: no account data or secrets
      - name: Upload report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Check the workflow still has no secrets and read-only permissions**

Run: `grep -nE "secrets\.|pull_request_target|permissions" .github/workflows/ci.yml`
Expected: only the existing `permissions:` line (with `contents: read` below it); no `secrets.` and no `pull_request_target`

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run the Chrome E2E tests on every push and pull request"
git show --stat HEAD
git push -u origin feat/fut-191-chrome-e2e-foundation
```

- [ ] **Step 4: Watch the run**

Run: `gh run list --branch feat/fut-191-chrome-e2e-foundation --limit 2`
Run: `gh run watch <run id of the CI workflow> --exit-status`
Expected: both `check` and `e2e` jobs succeed; the `e2e` log shows 12 passed

If `e2e` fails only on Linux (passes locally), download the report with `gh run download <run id> -n playwright-report`, read the failure and its `page-<n>.png` attachments, and fix in a new commit. Do not add retries to hide it.

- [ ] **Step 5: Open the pull request**

PR into `develop`, English, body ending with `Fixes FUT-191` and no AI attribution. Title: `test: add the Chrome E2E foundation with Playwright`.
