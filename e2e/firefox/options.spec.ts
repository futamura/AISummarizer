import { expect, poll, test } from './fixtures';

const CARDS = ['AI Service', 'Display on Menu', 'Open AI Service in'];

test('renders the settings', async ({ openExtensionPage }) => {
  const options = await openExtensionPage('options.html');

  expect(await options.title()).toBe('Free AI Summarizer Settings');
  await poll(
    () =>
      options.evaluate(cards => {
        const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')].map(heading => heading.textContent?.trim());
        return cards.every(card => headings.includes(card));
      }, CARDS),
    `the headings ${CARDS.join(', ')}`
  );
});
