import { expect, test } from './fixtures';
import { SERVICE_LABELS } from './scenarios';

test('shows the full menu for an article page', async ({ openPage, openPopupFor }) => {
  const article = await openPage('article');
  const popup = await openPopupFor(article);

  for (const label of SERVICE_LABELS) {
    await expect(popup.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(popup.getByText('Copy to clipboard')).toBeVisible();
  await expect(popup.getByText('Settings', { exact: true })).toBeVisible();
});

test('moves between the menu items with the arrow keys', async ({ openPage, openPopupFor }) => {
  const article = await openPage('article');
  const popup = await openPopupFor(article);
  const focused = () => popup.evaluate(() => document.activeElement?.textContent?.trim());

  await popup.keyboard.press('ArrowDown');
  expect(await focused()).toBe('ChatGPT');
  await popup.keyboard.press('ArrowDown');
  expect(await focused()).toBe('Claude');
  await popup.keyboard.press('End');
  expect(await focused()).toBe('Settings');
  await popup.keyboard.press('ArrowDown');
  expect(await focused()).toBe('ChatGPT');
  await popup.keyboard.press('ArrowUp');
  expect(await focused()).toBe('Settings');
});
