import { expect, test } from './fixtures';

test('renders the settings', async ({ context, extensionId }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(options).toHaveTitle('Free AI Summarizer Settings');
  for (const card of ['AI Service', 'Display on Menu', 'Open AI Service in']) {
    await expect(options.getByRole('heading', { name: card, exact: true })).toBeVisible();
  }
});
