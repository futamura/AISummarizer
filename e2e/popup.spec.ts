import { expect, test } from './fixtures';

/* Every AI service is on the menu by default */
const SERVICE_LABELS = ['ChatGPT', 'Gemini', 'AI Studio', 'Claude', 'Grok', 'Perplexity', 'DeepSeek', 'Kimi', 'Qwen'];

test('shows the full menu for an article page', async ({ openPage, openPopupFor }) => {
  const article = await openPage('article');
  const popup = await openPopupFor(article);

  for (const label of SERVICE_LABELS) {
    await expect(popup.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(popup.getByText('Copy to clipboard')).toBeVisible();
  await expect(popup.getByText('Settings', { exact: true })).toBeVisible();
});
