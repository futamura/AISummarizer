import { clickText, expect, readClipboard, test, waitForToast, writeClipboard } from './fixtures';

const SENTINEL = 'clipboard before the copy';

test('shows the failure toast and leaves the clipboard alone on a page without an article', async ({ openPage, openPopupFor }) => {
  const page = await openPage('empty');
  await writeClipboard(page, SENTINEL);
  const popup = await openPopupFor(page);

  await clickText(popup, 'Copy to clipboard');

  await waitForToast(page, "Couldn't extract this article");
  expect(await readClipboard(page)).toBe(SENTINEL);
});
