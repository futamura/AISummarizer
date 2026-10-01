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
