import { CHATGPT_SELECTORS } from '../src/constants/Selectors';
import { expect, PAGE_ORIGIN, readFixture, test, withSubmitGuard } from './fixtures';

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

test('keeps a fixture page in place when its form is submitted', async ({ context, fixtureServer }) => {
  const page = await context.newPage();
  await page.goto('https://chatgpt.com/');

  /* What a click on the send button does in a fixture without the site's script */
  const navigated = page.waitForEvent('framenavigated', { timeout: 2000 }).then(
    () => true,
    () => false
  );
  await page.evaluate(() => document.querySelector('form')?.requestSubmit());

  expect(await navigated).toBe(false);
  expect(page.url()).toBe('https://chatgpt.com/');
  expect(fixtureServer.requests.filter(request => request.endsWith(' document'))).toEqual(['chatgpt.com/ document']);
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

test('puts the submit guard in the head, not in a header', () => {
  const html = withSubmitGuard('<header>Site</header><head lang="en"><title>Page</title></head>');
  expect(html).toMatch(/^<header>Site<\/header><head lang="en"><script>.+<\/script><title>Page<\/title><\/head>$/);
});
