import { defineConfig } from '@playwright/test';

import type { ExtensionOptions } from './fixtures';

/*
 * Runs the built extension, so build it first: pnpm build (dist/prod), pnpm start (dist/dev),
 * pnpm build:firefox (dist/firefox-prod) and pnpm start:firefox (dist/firefox-dev).
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
    { name: 'prod-offline', testMatch: 'routing.spec.ts', testIgnore: /e2e\/firefox\//, use: { distDir: 'dist/prod' } },
    { name: 'dev-offline', testMatch: 'routing.spec.ts', testIgnore: /e2e\/firefox\//, use: { distDir: 'dist/dev' } },
    { name: 'prod', testIgnore: ['routing.spec.ts', /e2e\/firefox\//], dependencies: ['prod-offline'], use: { distDir: 'dist/prod' } },
    { name: 'dev', testIgnore: ['routing.spec.ts', /e2e\/firefox\//], dependencies: ['dev-offline'], use: { distDir: 'dist/dev' } },
    /* Firefox: the specs in e2e/firefox/, through Puppeteer over WebDriver BiDi. Starting Firefox and installing the add-on takes a few seconds per test */
    { name: 'firefox-prod-offline', testMatch: /e2e\/firefox\/routing\.spec\.ts$/, timeout: 60_000, use: { distDir: 'dist/firefox-prod' } },
    { name: 'firefox-dev-offline', testMatch: /e2e\/firefox\/routing\.spec\.ts$/, timeout: 60_000, use: { distDir: 'dist/firefox-dev' } },
    {
      name: 'firefox-prod',
      /* prod-build.spec.ts reads the build's files without a browser, so it checks dist/firefox-prod as is */
      testMatch: [/e2e\/firefox\/.+\.spec\.ts$/, /e2e\/prod-build\.spec\.ts$/],
      testIgnore: /e2e\/firefox\/routing\.spec\.ts$/,
      dependencies: ['firefox-prod-offline'],
      timeout: 60_000,
      use: { distDir: 'dist/firefox-prod' },
    },
    {
      name: 'firefox-dev',
      testMatch: /e2e\/firefox\/.+\.spec\.ts$/,
      testIgnore: /e2e\/firefox\/routing\.spec\.ts$/,
      dependencies: ['firefox-dev-offline'],
      timeout: 60_000,
      use: { distDir: 'dist/firefox-dev' },
    },
  ],
});
