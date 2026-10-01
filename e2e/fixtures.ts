import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test as base, chromium, expect, type Page, type Route, type Worker } from '@playwright/test';

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
      const response = await page.goto(`${PAGE_ORIGIN}/${name}`);
      /* A missing page would otherwise load the 404 text, which also fails to extract */
      if (!response?.ok()) throw new Error(`${PAGE_ORIGIN}/${name} answered ${response?.status()}: add e2e/pages/${name}.html`);
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
