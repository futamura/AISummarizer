import { SERVICE_LABELS } from '../scenarios';
import { expect, isTextVisible, test } from './fixtures';

test('shows the full menu for an article page', async ({ openPage, openPopupFor }) => {
  const article = await openPage('article');
  const popup = await openPopupFor(article);

  for (const label of [...SERVICE_LABELS, 'Copy to clipboard', 'Settings']) {
    expect(await isTextVisible(popup, label), label).toBe(true);
  }
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
