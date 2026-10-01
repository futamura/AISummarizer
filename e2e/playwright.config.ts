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
  projects: [
    { name: 'prod', use: { distDir: 'dist/prod' } },
    { name: 'dev', use: { distDir: 'dist/dev' } },
  ],
});
