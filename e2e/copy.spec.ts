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
