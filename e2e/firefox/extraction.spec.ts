import { clickText, expect, readClipboard, test, waitForToast } from './fixtures';

/* A YouTube transcript is read 4 s after the request, then once its segment count settles */
const EXTRACTION_TIMEOUT = 20_000;

test('copies the transcript of a YouTube video', async ({ openFixturePage, openPopupFor }) => {
  const video = await openFixturePage('youtube-watch');
  const popup = await openPopupFor(video);

  await clickText(popup, 'Copy to clipboard');

  /* Shown after 500 ms, well before the transcript is read */
  await waitForToast(video, 'Extracting transcript…');
  await waitForToast(video, 'Article copied to clipboard', EXTRACTION_TIMEOUT);
  const text = await readClipboard(video);
  expect(text).toContain('# Title\nMe at the zoo');
  expect(text).toContain('# URL\nhttps://www.youtube.com/watch?v=jNQXAC9IVRw');
  expect(text).toContain('[0:01](https://youtu.be/jNQXAC9IVRw?t=1s) All right, so here we are, in front of the elephants');
});

test('copies an X post with its self reply', async ({ openFixturePage, openPopupFor }) => {
  const post = await openFixturePage('x-post');
  const popup = await openPopupFor(post);

  await clickText(popup, 'Copy to clipboard');

  await waitForToast(post, 'Article copied to clipboard', EXTRACTION_TIMEOUT);
  const text = await readClipboard(post);
  expect(text).toContain('# Title\nDevelopers (@XDevelopers): X Livestream API has been rebuilt from the ground up.');
  expect(text).toContain('Check out our official docs here:');
  /* X shows a machine translation under the post for the signed-in user's language */
  expect(text).not.toContain('ゼロから');
});

test('copies an X article with its title and paragraphs', async ({ openFixturePage, openPopupFor }) => {
  const article = await openFixturePage('x-article');
  const popup = await openPopupFor(article);

  await clickText(popup, 'Copy to clipboard');

  await waitForToast(article, 'Article copied to clipboard', EXTRACTION_TIMEOUT);
  const text = await readClipboard(article);
  expect(text).toContain('# Title\nX achieves TAG Brand Safety Certification');
  expect(text).toContain('For our customers, we have deployed every single brand control');
});
