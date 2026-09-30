import { mkdir } from 'node:fs/promises';

import { type BrowserContext, chromium } from '@playwright/test';

import { PROFILE_DIR } from './config';

/**
 * Open the canary's own Chromium profile. The same launch options are used for signing in and for
 * probing, so that the profile written by one can be read by the other.
 * @param headless - Whether to run without a window
 * @returns The persistent browser context
 */
export const launchProfile = async (headless: boolean): Promise<BrowserContext> => {
  /* Owner-only, since the profile holds the session cookies of every signed-in service */
  await mkdir(PROFILE_DIR, { recursive: true, mode: 0o700 });
  return chromium.launchPersistentContext(PROFILE_DIR, {
    /* The full Chromium in both modes, rather than the headless shell */
    channel: 'chromium',
    headless,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
};
