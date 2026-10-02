import { CLAUDE_SELECTORS } from '../../src/constants/Selectors';
import { expect, expectArticleInjected, type Page, PAGE_ORIGIN, readClipboard, test, waitForToast } from './fixtures';

test.skip(({ distDir }) => distDir !== 'dist/firefox-dev', 'The context menu hook exists in development builds only');

/**
 * Click a context menu item through the hook, on the background page where the service worker code runs on Firefox
 * @param extensionPage - An extension page, which can reach the background page
 * @param menuItemId - The menu item ID (src/models/ContextMenuItems.ts)
 * @param tabId - The tab it is clicked on
 */
const clickMenuItem = (extensionPage: Page, menuItemId: string, tabId: number): Promise<void> =>
  extensionPage.evaluate(
    async ({ menuItemId, tabId }) => {
      const getBackgroundPage = chrome.runtime.getBackgroundPage as unknown as () => Promise<typeof globalThis | null>;
      const background = await getBackgroundPage();
      if (!background?.__aiSummarizerE2E) throw new Error('No context menu hook: is this a development build?');
      await background.__aiSummarizerE2E.clickContextMenu(menuItemId, tabId);
    },
    { menuItemId, tabId }
  );

test('copies the article from the context menu', async ({ extensionPage, openPage, tabIdFor }) => {
  const article = await openPage('article');

  await clickMenuItem(extensionPage, 'copy', await tabIdFor(article));

  /* Checked right after the click: the success toast disappears after 3 s */
  await waitForToast(article, 'Article copied to clipboard');
  const text = await readClipboard(article);
  expect(text).toContain("# Title\nThe Lighthouse Keeper's Log");
  expect(text).toContain(`# URL\n${PAGE_ORIGIN}/article`);
});

test('opens Claude with the article from the context menu', async ({ extensionPage, openPage, tabIdFor, waitForServicePage }) => {
  const article = await openPage('article');

  await clickMenuItem(extensionPage, 'claude', await tabIdFor(article));

  const claude = await waitForServicePage('claude.ai');
  await expectArticleInjected(claude, CLAUDE_SELECTORS.editor);
});
