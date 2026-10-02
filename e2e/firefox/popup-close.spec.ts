import { CHATGPT_SELECTORS } from '../../src/constants/Selectors';
import { clickText, expect, EXTENSION_ORIGIN, type Page, poll, readClipboard, readComposer, test, waitForToast } from './fixtures';

/*
 * Firefox answers the popup's sendMessage only once the service worker's listener settles, and the popup
 * closes after that answer (FUT-147). The YouTube fixture's transcript takes 4 s or more to read, so a
 * listener that awaited the extraction would keep the popup open that long. CLOSE_TIMEOUT must stay at 3 s
 * or less, or such a listener could close the popup in time and pass
 */
const CLOSE_TIMEOUT = 1000;
const EXTRACTION_TIMEOUT = 20_000;

const waitForPopupToClose = (extensionPage: Page): Promise<void> =>
  poll(
    () => extensionPage.evaluate(async url => !(await chrome.tabs.query({})).some(tab => tab.url === url), `${EXTENSION_ORIGIN}/popup.html`),
    'the popup to close',
    CLOSE_TIMEOUT
  );

test('closes the popup without waiting for the transcript to be copied', async ({ extensionPage, openFixturePage, openPopupFor }) => {
  const video = await openFixturePage('youtube-watch');
  const popup = await openPopupFor(video);

  await clickText(popup, 'Copy to clipboard');

  await waitForPopupToClose(extensionPage);
  await waitForToast(video, 'Article copied to clipboard', EXTRACTION_TIMEOUT);
  expect(await readClipboard(video)).toContain('# Title\nMe at the zoo');
});

test('closes the popup without waiting for the transcript to open ChatGPT', async ({ extensionPage, openFixturePage, openPopupFor, waitForServicePage }) => {
  const video = await openFixturePage('youtube-watch');
  const popup = await openPopupFor(video);

  await clickText(popup, 'ChatGPT');

  await waitForPopupToClose(extensionPage);
  const chatgpt = await waitForServicePage('chatgpt.com', EXTRACTION_TIMEOUT);
  await waitForToast(chatgpt, 'Article has been sent!', EXTRACTION_TIMEOUT);
  expect(await readComposer(chatgpt, CHATGPT_SELECTORS.editor)).toContain('Me at the zoo');
});
