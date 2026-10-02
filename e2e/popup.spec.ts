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
