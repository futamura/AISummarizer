import type { Page } from '@playwright/test';

import type { ToastType } from '../../src/features/content/services/ToastQueue';
import { test as base, expect, waitForToast } from '../fixtures';

export { expect };

export type ColorScheme = 'light' | 'dark';

export const COLOR_SCHEMES: ColorScheme[] = ['light', 'dark'];

interface VisualFixtures {
  linuxOnly: void;
  showToast: (page: Page, type: ToastType, text: string) => Promise<void>;
}

export const test = base.extend<VisualFixtures>({
  /* Runs before the browser starts: fonts and rasterization differ outside the container the baselines come from */
  linuxOnly: [
    /* eslint-disable-next-line no-empty-pattern */
    async ({}, use) => {
      if (process.platform !== 'linux') throw new Error('The visual baselines come from the Playwright container: run pnpm test:visual');
      await use();
    },
    { auto: true },
  ],

  showToast: async ({ serviceWorker, tabIdFor }, use) => {
    await use(async (page: Page, type: ToastType, text: string) => {
      const tabId = await tabIdFor(page);
      /* The content script registers its listener after its first render, a moment after its root appears */
      await expect(async () => {
        await serviceWorker.evaluate(
          async args => {
            if (!globalThis.__aiSummarizerE2E?.showToast) throw new Error('No toast hook: build dist/prod-e2e with pnpm build:e2e');
            await globalThis.__aiSummarizerE2E.showToast(args.tabId, args.type, args.text);
          },
          { tabId, type, text }
        );
      }).toPass({ timeout: 5000 });
      await waitForToast(page, text);
    });
  },
});

/**
 * Fix what a screenshot depends on besides the extension
 * @param page - The page to capture
 * @param colorScheme - The OS theme both UIs follow
 */
export const preparePage = async (page: Page, colorScheme: ColorScheme): Promise<void> => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
  /*
   * animations: 'disabled' does not reach the closed shadow root of the content script, where the loading
   * spinner turns. The Animation domain sees it: each animation is paused at its first frame as it starts.
   * The session stays attached to keep receiving the events
   */
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Animation.animationStarted', ({ animation }) => {
    const animations = [animation.id];
    void cdp
      .send('Animation.setPaused', { animations, paused: true })
      .then(() => cdp.send('Animation.seekAnimations', { animations, currentTime: 0 }))
      .catch(() => undefined);
  });
  await cdp.send('Animation.enable');
};
