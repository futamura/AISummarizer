import { connect } from 'node:net';

import { CHATGPT_SELECTORS } from '../../src/constants/Selectors';
import { expect, PAGE_ORIGIN, poll, sleep, test } from './fixtures';

/*
 * Runs first in each Firefox build, as a dependency of every other Firefox spec: it proves that no request
 * leaves the machine, so no other spec can send a test article to a live site
 */

/* Without its host permissions the content script would not run, and every other spec would fail for that reason */
test('holds the host permissions of the manifest', async ({ extensionPage }) => {
  const granted = await extensionPage.evaluate(() => chrome.permissions.contains({ origins: ['<all_urls>'] }));
  expect(granted).toBe(true);
});

test('never reaches a site outside the test pages', async ({ firefox, fixtureServer }) => {
  const page = await firefox.newPage();
  await expect(page.goto('https://example.com/')).rejects.toThrow(/NS_ERROR_PROXY_FORBIDDEN/);
  /* Firefox's own background requests are refused too, so the list is never expected to hold only this host */
  expect(fixtureServer.refused).toContain('example.com');
});

test('answers a missing test page with 404', async ({ firefox }) => {
  const page = await firefox.newPage();
  const response = await page.goto(`${PAGE_ORIGIN}/no-such-page`);
  expect(response?.status()).toBe(404);
});

test('serves a fixture host its fixture and nothing else', async ({ firefox, fixtureServer }) => {
  const page = await firefox.newPage();
  await page.goto('https://chatgpt.com/');
  expect(fixtureServer.requests).toContain('chatgpt.com/ document');
  expect(await page.evaluate(selector => document.querySelector(selector) !== null, CHATGPT_SELECTORS.editor)).toBe(true);

  /* A fixture keeps the site's own URLs for images, scripts and API calls */
  const status = await page.evaluate(() => fetch('https://chatgpt.com/backend-api/me').then(answer => answer.status));
  expect(status).toBe(404);
});

test('keeps a fixture page in place when its form is submitted', async ({ firefox, fixtureServer }) => {
  const page = await firefox.newPage();
  await page.goto('https://chatgpt.com/');

  /* What a click on the send button does in a fixture without the site's script */
  await page.evaluate(() => document.querySelector('form')?.requestSubmit());
  /* A native submission would load the page again well within this time */
  await sleep(2000);

  expect(await page.evaluate(() => location.href)).toBe('https://chatgpt.com/');
  expect(fixtureServer.requests.filter(request => request.endsWith(' document'))).toEqual(['chatgpt.com/ document']);
});

test('answers a tab the extension opens from the local server', async ({ extensionPage, fixtureServer, waitForServicePage }) => {
  await extensionPage.evaluate(() => chrome.tabs.create({ url: 'https://chatgpt.com/?opened-by=extension' }).then(() => undefined));

  const page = await waitForServicePage('chatgpt.com');
  await poll(() => page.evaluate(selector => document.querySelector(selector) !== null, CHATGPT_SELECTORS.editor), 'the ChatGPT editor');
  expect(fixtureServer.requests).toContain('chatgpt.com/?opened-by=extension document');
});

test('keeps requests of the extension off the network', async ({ extensionPage }) => {
  const result = await extensionPage.evaluate(async () => {
    /* The background page, where the service worker code runs on Firefox */
    const getBackgroundPage = chrome.runtime.getBackgroundPage as unknown as () => Promise<Window | null>;
    const background = await getBackgroundPage();
    if (!background) throw new Error('No background page');
    return background.fetch('https://example.com/').then(
      () => 'answered',
      () => 'failed'
    );
  });
  expect(result).toBe('failed');
});

/* Firefox resets connections when it closes, background requests to refused hosts included; the proxy must survive that */
test('keeps the proxy running when a refused connection is reset', async ({ fixtureServer }) => {
  const connectThrough = (host: string): Promise<{ answer: string; reset: () => void }> =>
    new Promise((resolve, reject) => {
      const socket = connect(fixtureServer.proxyPort, '127.0.0.1', () => socket.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`));
      socket.once('data', data => resolve({ answer: data.toString().split('\r\n')[0], reset: () => socket.resetAndDestroy() }));
      socket.once('error', reject);
    });

  const first = await connectThrough('example.com');
  expect(first.answer).toBe('HTTP/1.1 403 Forbidden');
  first.reset();
  await sleep(300);

  const second = await connectThrough('example.org');
  expect(second.answer).toBe('HTTP/1.1 403 Forbidden');
  second.reset();
});
