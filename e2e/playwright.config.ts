import { defineConfig } from '@playwright/test';

import type { ExtensionOptions } from './fixtures';

/*
 * Runs the built extension, so build it first: pnpm build (dist/prod) and pnpm start (dist/dev).
 * A build left over from another branch tests that branch's code.
 */
export default defineConfig<ExtensionOptions>({
  testDir: '.',
  testMatch: '*.spec.ts',
  /* One browser at a time: the clipboard may be shared between browser instances */
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  outputDir: '../test-results',
  /*
   * routing.spec.ts proves that no request leaves the machine, so it runs first, as a dependency: when it
   * fails, no other spec runs, and none can send a test article to a live site
   */
  projects: [
    /* Chrome: the specs in e2e/, through Playwright's Chromium */
    { name: 'prod-offline', testMatch: 'routing.spec.ts', testIgnore: /firefox\//, use: { distDir: 'dist/prod' } },
    { name: 'dev-offline', testMatch: 'routing.spec.ts', testIgnore: /firefox\//, use: { distDir: 'dist/dev' } },
    { name: 'prod', testIgnore: ['routing.spec.ts', /firefox\//], dependencies: ['prod-offline'], use: { distDir: 'dist/prod' } },
    { name: 'dev', testIgnore: ['routing.spec.ts', /firefox\//], dependencies: ['dev-offline'], use: { distDir: 'dist/dev' } },
    /* Firefox: the specs in e2e/firefox/, through Puppeteer over WebDriver BiDi. Starting Firefox and installing the add-on takes a few seconds per test */
    { name: 'firefox-prod-offline', testMatch: /firefox\/routing\.spec\.ts$/, timeout: 60_000, use: { distDir: 'dist/firefox-prod' } },
    { name: 'firefox-dev-offline', testMatch: /firefox\/routing\.spec\.ts$/, timeout: 60_000, use: { distDir: 'dist/firefox-dev' } },
  ],
});
