import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from './fixtures';

const REPO_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/* Defined in src/pages/ServiceWorker.ts for development builds only */
const HOOK_NAME = '__aiSummarizerE2E';

test.skip(({ distDir }) => distDir !== 'dist/prod', 'Only the production build must leave the hook out');

/* Uses no browser: the context fixture is never requested, so Chromium is not launched */
test('leaves the context menu hook out of the production build', ({ distDir }) => {
  const dir = path.resolve(REPO_DIR, distDir);
  const scripts = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.js'));
  expect(scripts.length).toBeGreaterThan(0);

  const withHook = scripts.filter(file => readFileSync(path.join(dir, file), 'utf8').includes(HOOK_NAME));
  expect(withHook).toEqual([]);
});
