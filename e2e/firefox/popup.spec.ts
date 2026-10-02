import { SERVICE_LABELS } from '../scenarios';
import { expect, isTextVisible, test } from './fixtures';

test('shows the full menu for an article page', async ({ openPage, openPopupFor }) => {
  const article = await openPage('article');
  const popup = await openPopupFor(article);

  for (const label of [...SERVICE_LABELS, 'Copy to clipboard', 'Settings']) {
    expect(await isTextVisible(popup, label), label).toBe(true);
  }
});
