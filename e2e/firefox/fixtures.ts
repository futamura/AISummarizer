import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser, type Page } from 'puppeteer';

import { test as base, expect } from '@playwright/test';

import { FIREFOX_ADDON_ID } from '../../build/manifest';
import { fixtureForUrl, type FixtureServer, PAGE_ORIGIN, readFixture, startFixtureServer } from '../fixture-server';

export { expect, PAGE_ORIGIN };
export type { Page };

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* Fixed through extensions.webextensions.uuids, so the extension's URLs are known before any page opens */
const EXTENSION_UUID = '0e2e0e2e-0000-4000-8000-000000000001';
export const EXTENSION_ORIGIN = `moz-extension://${EXTENSION_UUID}`;

export interface ExtensionOptions {
  /* The unpacked build to load, relative to the repository root */
  distDir: string;
}

interface FirefoxFixtures {
  /* Named firefox, since Playwright's own browser fixture would launch Chromium */
  firefox: Browser;
  /* options.html in a tab, where chrome.* reaches the extension's privileged APIs */
  extensionPage: Page;
  openExtensionPage: (file: string) => Promise<Page>;
  openPage: (name: string) => Promise<Page>;
  openFixturePage: (name: string) => Promise<Page>;
  tabIdFor: (page: Page) => Promise<number>;
  waitForServicePage: (host: string, timeout?: number) => Promise<Page>;
}

interface WorkerFixtures {
  fixtureServer: FixtureServer;
}

/**
 * The prefs that keep Firefox offline and make the extension testable
 * @param proxyPort - The port of the fixture server's refusing proxy
 * @returns The prefs for puppeteer.launch
 */
const firefoxPrefs = (proxyPort: number): Record<string, unknown> => ({
  /* Every request goes to the refusing proxy, with no exception, not even localhost */
  'network.proxy.type': 1,
  'network.proxy.http': '127.0.0.1',
  'network.proxy.http_port': proxyPort,
  'network.proxy.ssl': '127.0.0.1',
  'network.proxy.ssl_port': proxyPort,
  'network.proxy.no_proxies_on': '',
  'network.proxy.allow_hijacking_localhost': true,
  /* No DNS over HTTPS, no QUIC (a proxy does not carry it), and a lookup that escapes the proxy still resolves to localhost */
  'network.trr.mode': 5,
  'network.http.http3.enable': false,
  'network.dns.native-is-localhost': true,
  'extensions.webextensions.uuids': JSON.stringify({ [FIREFOX_ADDON_ID]: EXTENSION_UUID }),
  /* Lets a page read the clipboard without a user gesture */
  'dom.events.testing.asyncClipboard': true,
});

export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wait until a check passes. Evaluation in Firefox fails for a moment while a document is replaced
 * ("right-hand side of 'in' should be an object, got null"), which stops Puppeteer's waitForFunction,
 * so errors are retried until the timeout and the last one is reported
 * @param check - Resolves truthy once the condition holds
 * @param message - What is awaited, for the timeout error; a function is read at the time of the error
 * @param timeout - How long to wait in ms
 */
export const poll = async (check: () => Promise<unknown>, message: string | (() => string), timeout = 10_000): Promise<void> => {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  const detail = lastError instanceof Error ? `; last error: ${lastError.message.split('\n')[0]}` : '';
  throw new Error(`Timed out after ${timeout} ms waiting for ${typeof message === 'function' ? message() : message}${detail}`);
};

/**
 * Open an extension page in a new tab
 * @param firefox - The browser
 * @param file - The page's file in the build, such as popup.html
 * @returns The page, loaded
 */
const openExtensionPageIn = async (firefox: Browser, file: string): Promise<Page> => {
  const page = await firefox.newPage();
  const url = `${EXTENSION_ORIGIN}/${file}`;
  /* Puppeteer never sees a moz-extension:// load finish, so goto would time out: start it and poll */
  page.goto(url).catch(() => undefined);
  await poll(() => page.evaluate(target => location.href === target && document.readyState === 'complete', url), `${file} to load`);
  return page;
};

/**
 * Open a URL in a new tab and wait for the content script
 * @param firefox - The browser
 * @param url - The URL to open
 * @param hint - What to do when the URL is not answered
 * @returns The page
 */
const openUrl = async (firefox: Browser, url: string, hint: string): Promise<Page> => {
  const page = await firefox.newPage();
  const response = await page.goto(url);
  /* A missing page would otherwise load the 404 text, which also fails to extract */
  if (!response?.ok()) throw new Error(`${url} answered ${response?.status()}: ${hint}`);
  /* The content script appends its root to the body once it runs */
  await poll(() => page.evaluate(() => document.querySelector('#free-ai-summarizer-root') !== null), `the content script on ${url}`);
  return page;
};

export const test = base.extend<FirefoxFixtures & ExtensionOptions, WorkerFixtures>({
  distDir: ['dist/firefox-prod', { option: true }],

  fixtureServer: [
    /* eslint-disable-next-line no-empty-pattern */
    async ({}, use) => {
      const server = await startFixtureServer();
      await use(server);
      await server.close();
    },
    { scope: 'worker' },
  ],

  firefox: async ({ distDir, fixtureServer }, use, testInfo) => {
    const extensionDir = path.resolve(REPO_DIR, distDir);
    if (!existsSync(path.join(extensionDir, 'manifest.json'))) throw new Error(`Build ${distDir} first (pnpm build:firefox / pnpm start:firefox)`);

    /* Puppeteer gives every launch a fresh temporary profile and removes it on close */
    const firefox = await puppeteer
      .launch({ browser: 'firefox', headless: true, acceptInsecureCerts: true, extraPrefsFirefox: firefoxPrefs(fixtureServer.proxyPort) })
      .catch((error: unknown) => {
        throw new Error(
          `Firefox did not start; install it with pnpm exec puppeteer browsers install firefox: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    try {
      await firefox.installExtension(extensionDir);
      await use(firefox);

      /* Saved as files in test-results/, as the Chrome fixtures do */
      if (testInfo.status !== testInfo.expectedStatus) {
        for (const [index, page] of (await firefox.pages()).entries()) {
          const file = testInfo.outputPath(`page-${index}.png`);
          const saved = await page.screenshot({ path: file }).then(
            () => true,
            () => false
          );
          if (saved) await testInfo.attach(`page-${index}.png`, { path: file, contentType: 'image/png' });
        }
      }
    } finally {
      await firefox.close();
      fixtureServer.reset();
    }
  },

  extensionPage: async ({ firefox }, use) => {
    await use(await openExtensionPageIn(firefox, 'options.html'));
  },

  openExtensionPage: async ({ firefox }, use) => {
    await use((file: string) => openExtensionPageIn(firefox, file));
  },

  openPage: async ({ firefox }, use) => {
    await use((name: string) => openUrl(firefox, `${PAGE_ORIGIN}/${name}`, `add e2e/pages/${name}.html`));
  },

  openFixturePage: async ({ firefox }, use) => {
    await use(async (name: string) => {
      const { source } = readFixture(name);
      if (fixtureForUrl(new URL(source)) !== name)
        throw new Error(`${source} is not answered with ${name}: add its host to FIXTURE_HOSTS in e2e/fixture-server.ts`);
      return openUrl(firefox, source, `check the fixture server's answer for ${name}`);
    });
  },

  tabIdFor: async ({ extensionPage }, use) => {
    await use(async (page: Page) => {
      const url = await page.evaluate(() => location.href);
      const tabId = await extensionPage.evaluate(async target => (await chrome.tabs.query({})).find(tab => tab.url === target)?.id, url);
      if (tabId === undefined) throw new Error(`No tab found for ${url}`);
      return tabId;
    });
  },

  waitForServicePage: async ({ firefox, fixtureServer }, use) => {
    await use(async (host: string, timeout = 10_000) => {
      const refusedHosts = (): string => `hosts the proxy refused: ${[...new Set(fixtureServer.refused)].join(', ') || 'none'}`;
      let found: Page | undefined;
      let errorPage: string | undefined;
      const find = async (): Promise<void> => {
        for (const page of await firefox.pages()) {
          /* page.url() stays about:blank for a tab the extension opens, so ask the page itself */
          const { hostname, documentURI } = await page
            .evaluate(() => ({ hostname: location.hostname, documentURI: document.documentURI }))
            .catch(() => ({ hostname: '', documentURI: '' }));
          if (hostname !== host) continue;
          /* A load the proxy refused shows Firefox's error page (about:neterror) under the requested URL */
          if (documentURI.startsWith('about:')) errorPage = documentURI.split('?')[0];
          else found = page;
          return;
        }
      };
      await poll(
        async () => {
          await find();
          return found !== undefined || errorPage !== undefined;
        },
        () => `a tab on ${host} opened by the extension (${refusedHosts()})`,
        timeout
      );
      if (!found) throw new Error(`The tab on ${host} shows ${errorPage} (${refusedHosts()})`);
      return found;
    });
  },
});
