import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from './fixtures';

const REPO_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/* Defined in src/pages/ServiceWorker.ts for development builds and dist/prod-e2e only */
const HOOK_NAME = '__aiSummarizerE2E';
/*
 * The toast hook branch of src/features/content/hooks/useContentMessage.ts compares the action with
 * MessageAction.E2E_SHOW_TOAST. The enum itself stays in every build, so only a reference other than the
 * member's own definition (`.E2E_SHOW_TOAST="E2E_SHOW_TOAST"`) means the branch is there
 */
const TOAST_HOOK_REFERENCE = /\.E2E_SHOW_TOAST(?!=)/;

test.skip(({ distDir }) => !['dist/prod', 'dist/firefox-prod'].includes(distDir), 'Only the shipped production builds must leave the hooks out');

/**
 * List the scripts of a build
 * @param distDir - The build directory, relative to the repository
 * @returns The path and the content of each script
 */
const readScripts = (distDir: string): { file: string; content: string }[] => {
  const dir = path.resolve(REPO_DIR, distDir);
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.js'));
  return files.map(file => ({ file, content: readFileSync(path.join(dir, file), 'utf8') }));
};

/* Uses no browser: the context fixture is never requested, so Chromium is not launched */
test('leaves the context menu hook out of the production build', ({ distDir }) => {
  const scripts = readScripts(distDir);
  expect(scripts.length).toBeGreaterThan(0);

  const withHook = scripts.filter(({ content }) => content.includes(HOOK_NAME));
  expect(withHook.map(({ file }) => file)).toEqual([]);
});

test('leaves the toast hook out of the production build', ({ distDir }) => {
  const scripts = readScripts(distDir);
  expect(scripts.map(({ file }) => file)).toContain('content.js');

  const withHook = scripts.filter(({ content }) => TOAST_HOOK_REFERENCE.test(content));
  expect(withHook.map(({ file }) => file)).toEqual([]);
});
