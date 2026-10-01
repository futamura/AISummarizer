import { CLAUDE_SELECTORS } from '../src/constants/Selectors';
import { expect, expectArticleInjected, PAGE_ORIGIN, readClipboard, test, waitForToast } from './fixtures';

test.skip(({ distDir }) => distDir !== 'dist/dev', 'The context menu hook exists in development builds only');

/**
 * Click a context menu item through the hook. Runs in the service worker
 * @param args - The menu item ID (src/models/ContextMenuItems.ts) and the tab it is clicked on
 */
const clickMenuItem = async ({ menuItemId, tabId }: { menuItemId: string; tabId: number }): Promise<void> => {
  if (!globalThis.__aiSummarizerE2E) throw new Error('No context menu hook: is this a development build?');
  await globalThis.__aiSummarizerE2E.clickContextMenu(menuItemId, tabId);
};

test('copies the article from the context menu', async ({ openPage, serviceWorker, tabIdFor }) => {
  const article = await openPage('article');
  const tabId = await tabIdFor(article);

  await serviceWorker.evaluate(clickMenuItem, { menuItemId: 'copy', tabId });

  /* Checked right after the click: the success toast disappears after 3 s */
  await waitForToast(article, 'Article copied to clipboard');
  const text = await readClipboard(article);
  expect(text).toContain("# Title\nThe Lighthouse Keeper's Log");
  expect(text).toContain(`# URL\n${PAGE_ORIGIN}/article`);
});

test('opens Claude with the article from the context menu', async ({ openPage, serviceWorker, tabIdFor, waitForServicePage }) => {
  const article = await openPage('article');
  const tabId = await tabIdFor(article);

  await serviceWorker.evaluate(clickMenuItem, { menuItemId: 'claude', tabId });

  const claude = await waitForServicePage('claude.ai');
  await expectArticleInjected(claude, CLAUDE_SELECTORS.editor);
});
