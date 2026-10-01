import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

import { type BrowserContext, chromium } from '@playwright/test';

import { PROFILE_DIR } from './config';

/*
 * Playwright starts Chromium with these, and they decide how the cookies in the profile are
 * encrypted: with a fixed key instead of the macOS keychain. A browser started by hand must use
 * them too, or the probe cannot read the sessions signed in there
 */
const COOKIE_STORE_ARGS = ['--use-mock-keychain', '--password-store=basic'];

/**
 * Open the canary's own Chromium profile under Playwright's control, for probing
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

/**
 * Open the canary's profile in the same Chromium, started as a plain browser rather than under
 * Playwright's control. Google refuses to sign in to a browser under automation ("This browser or
 * app may not be secure"), and Cloudflare challenges it, so signing in happens here by hand.
 * @param urls - The pages to open, one tab each
 * @returns Resolves when the browser is quit
 */
export const openProfileForSignIn = async (urls: string[]): Promise<void> => {
  await mkdir(PROFILE_DIR, { recursive: true, mode: 0o700 });
  const args = [`--user-data-dir=${PROFILE_DIR}`, ...COOKIE_STORE_ARGS, '--no-first-run', '--no-default-browser-check', ...urls];
  const browser = spawn(chromium.executablePath(), args, { stdio: 'ignore' });
  await new Promise<void>((resolve, reject) => {
    browser.on('error', reject);
    browser.on('exit', () => resolve());
  });
};
