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
