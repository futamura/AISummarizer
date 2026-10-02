import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test as base, type BrowserContext, chromium, expect, type Page, type Worker } from '@playwright/test';

import { fixtureForUrl, type FixtureServer, PAGE_ORIGIN, readFixture, startFixtureServer, withSubmitGuard } from './fixture-server';
import { ARTICLE_SENTENCE, ARTICLE_TITLE } from './scenarios';

export { expect, PAGE_ORIGIN, readFixture, withSubmitGuard };
export { ARTICLE_SENTENCE, ARTICLE_TITLE };

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.dirname(E2E_DIR);

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
           * does not catch, goes to the fixture server or fails to resolve. Nothing reaches a live site.
           * One exception lies below these rules: when the system DNS server is a known DNS-over-HTTPS
           * provider, Secure DNS may check that provider for an upgrade. It carries no test data
           */
          `--host-resolver-rules=${fixtureServer.resolverRules}`,
          /*
           * ignoreHTTPSErrors reaches a tab the extension opens only once Playwright attaches to it, which
           * may be after its first load: without this flag, that load sometimes stops at the certificate
           * error page
           */
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
      if (fixtureForUrl(new URL(source)) !== name)
        throw new Error(`${source} is not answered with ${name}: add its host to FIXTURE_HOSTS in e2e/fixture-server.ts`);
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
 * Check that the article of e2e/pages/article.html was injected. The fixture has no site script and
 * the fixture server cancels form submission, so the send click changes nothing and the composer
 * keeps the prompt
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
