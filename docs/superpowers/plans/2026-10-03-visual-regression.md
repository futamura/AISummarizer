# Visual Regression of the Toasts and the Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compare screenshots of the toasts and the popup of a production-mode build with baselines made in the Playwright container, locally (`pnpm test:visual`) and in CI.

**Architecture:** `E2E_HOOKS=1 pnpm build:e2e` builds `dist/prod-e2e`: the production build plus the test hook, which gains `showToast` to put a toast that never times out on a tab. The specs in `e2e/visual/` run as two extra Playwright projects that exist only with `E2E_VISUAL=1`, set by `scripts/visual.sh` (Docker) and by a new CI job running in the same container image.

**Tech Stack:** `@playwright/test` 1.63.0 (`toHaveScreenshot`), Docker image `mcr.microsoft.com/playwright:v1.63.0-noble` (linux/amd64), webpack `DefinePlugin`, Jest, GitHub Actions container jobs.

**Spec:** `docs/superpowers/specs/2026-10-03-visual-regression-design.md`

## Global Constraints

- Public repository: code comments, commit messages and PR text in English; block comments (`/* */`) only in source, even for one line (shell scripts use `#`)
- No `Co-Authored-By` and no AI attribution in commits or PRs
- pnpm only; no new dependency, no version change
- No change to the look of the toasts or the popup. If the spinner does not hold still under `animations: 'disabled'` (Task 3, Step 7), stop and ask: `motion-reduce:animate-none` on the spinner is a UI change
- The shipped `dist/prod` must not contain the hook: `e2e/prod-build.spec.ts` keeps passing
- Baselines come from the Playwright container only; never commit a PNG made on macOS
- Never reach a live site: the `visual` project depends on `visual-offline` (routing.spec.ts)
- Work on branch `chore/fut-161-visual-regression`; never commit to `develop` or `main`
- Before each push: `git show --stat` must not list `.superpowers/`
- `workers: 1` stays

## Review Focus

1. `dist/prod-e2e` missing, or a plain `pnpm build` output put there: the run must name `pnpm build:e2e`, not time out — Task 3 (`showToast` fixture error), checked in Step 6
2. Someone runs the visual project directly on macOS (`E2E_VISUAL=1 pnpm exec playwright test --project visual`): it must refuse with a message naming `pnpm test:visual`, not write `-darwin` baselines — Task 3, Step 5
3. `pnpm test:e2e` on macOS or in the `e2e` CI job must not list any visual test — Task 3, Step 4
4. The hook message reaches the content script before its listener is registered (the root div is attached before React renders): `showToast` must retry instead of failing on "Receiving end does not exist" — Task 3 fixture (`toPass`)
5. Docker not running: `pnpm test:visual` must say so, not print Docker's socket error — Task 3, Step 6

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/features/content/services/ToastQueue.ts` | Modify | `hold` option: a held toast never times out |
| `src/features/content/services/__tests__/ToastQueue.test.ts` | Modify | Test for `hold` |
| `src/types/Global.d.ts` | Modify | Declare `__E2E_HOOKS__` |
| `jest.config.js` | Modify | `__E2E_HOOKS__: false` |
| `webpack.config.ts` | Modify | `E2E_HOOKS=1` → `dist/prod-e2e`, `__E2E_HOOKS__` |
| `package.json` | Modify | `build:e2e`, `test:visual`, `test:visual:update` |
| `src/types/Message.ts` | Modify | `MessageAction.E2E_SHOW_TOAST` |
| `src/pages/ServiceWorker.ts` | Modify | Hook condition; `showToast` |
| `src/features/content/hooks/useContentMessage.ts` | Modify | Handle `E2E_SHOW_TOAST` in hook builds |
| `e2e/pages/root-10px.html` | Create | Article page with a 10px root font size |
| `e2e/visual/fixtures.ts` | Create | Linux guard, `showToast`, `preparePage` |
| `e2e/visual/toast.spec.ts`, `e2e/visual/popup.spec.ts` | Create | The screenshots |
| `e2e/visual/__screenshots__/**` | Create | Baselines, from the container |
| `e2e/playwright.config.ts` | Modify | Visual projects behind `E2E_VISUAL`; snapshot path; prod/dev ignore `visual/` |
| `scripts/visual.sh` | Create | Run the visual tests in the container |
| `.github/workflows/ci.yml` | Modify | Jobs `playwright-version` and `visual` |
| `README.md`, `CLAUDE.md`, `DIRECTORYSTRUCTURE.md` | Modify | Document the visual tests |

---

### Task 1: Toasts that do not time out

**Files:**
- Modify: `src/features/content/services/ToastQueue.ts:6-17,60-61,154`
- Test: `src/features/content/services/__tests__/ToastQueue.test.ts`

**Interfaces:**
- Produces: `ToastOptions.hold?: boolean`, `ToastItem.hold?: boolean`. `toast.success(text, { hold: true })` etc. (the `toast` object in `Toaster.tsx` passes options through unchanged)

- [ ] **Step 1: Write the failing test** — add after the test "times out a success toast 3 s after it became visible, then removes it":

```ts
  it('keeps a held toast until it is dismissed', () => {
    const id = queue.show('success', 'Done', { hold: true });

    jest.advanceTimersByTime(TOAST_ANIMATION_MS + TIMED_TOAST_MS * 10);
    expect(screen(queue)).toEqual(['Done:visible']);

    queue.dismiss(id);
    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(screen(queue)).toEqual([]);
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test src/features/content/services/__tests__/ToastQueue.test.ts -t "held toast"`
Expected: FAIL — type error on `hold` (ts-jest), or `[]` received instead of `['Done:visible']`

- [ ] **Step 3: Implement**

In `ToastOptions`:

```ts
export interface ToastOptions {
  /* Toasts of one group replace each other, and each stays at least MIN_GROUP_DISPLAY_MS */
  group?: string;
  /* Never time out; set only by the test hook of e2e/visual/, so that a screenshot cannot catch the toast leaving */
  hold?: boolean;
}
```

In `ToastItem`, after `group?: string;`:

```ts
  hold?: boolean;
```

In `show()`:

```ts
    const item: ToastItem = { id: String(++this.lastId), type, message, group: options.group, hold: options.hold, phase: 'entering' };
```

In `settle()`:

```ts
    if (TIMED_TYPES.has(item.type) && !item.hold) setTimeout(() => this.exit(id), TIMED_TOAST_MS);
```

Update the `@param options` line of `show()` to `@param options - The group to show it in, and whether it is held`.

- [ ] **Step 4: Run the file**

Run: `pnpm test src/features/content/services/__tests__/ToastQueue.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/content/services/ToastQueue.ts src/features/content/services/__tests__/ToastQueue.test.ts
git commit -m "feat: let a toast stay until it is dismissed"
```

---

### Task 2: `dist/prod-e2e` and the toast hook

**Files:**
- Modify: `src/types/Global.d.ts`, `jest.config.js:7-9`, `webpack.config.ts:14-24,79-87`, `package.json` (scripts), `src/types/Message.ts:4-14`, `src/pages/ServiceWorker.ts:31-34,64-74`, `src/features/content/hooks/useContentMessage.ts` (start of `handleMessage`, before `switch`)

**Interfaces:**
- Consumes: `ToastOptions.hold` (Task 1)
- Produces: `globalThis.__aiSummarizerE2E.showToast(tabId: number, type: ToastType, text: string): Promise<void>` in the service worker of `dist/dev` and `dist/prod-e2e`; `pnpm build:e2e` → `dist/prod-e2e`; `MessageAction.E2E_SHOW_TOAST` with payload `{ tabId: number; tabUrl: string; type: ToastType; text: string }`

- [ ] **Step 1: Declare the constant** — `src/types/Global.d.ts`, below `__TARGET__`:

```ts
/* True only in dist/prod-e2e (E2E_HOOKS=1 pnpm build:e2e): a production build that keeps the test hooks */
declare const __E2E_HOOKS__: boolean;
```

`jest.config.js` globals:

```js
  globals: {
    __TARGET__: 'chrome',
    __E2E_HOOKS__: false,
  },
```

- [ ] **Step 2: webpack** — after `const isFirefox = …;`:

```ts
/* E2E_HOOKS=1 keeps the test hooks in a production build, for the visual tests (e2e/visual/) */
const withE2EHooks = process.env.E2E_HOOKS === '1';
if (withE2EHooks && (isDev || isFirefox)) {
  throw new Error('E2E_HOOKS=1 is for the Chrome production build: development builds always have the hooks');
}
```

Replace the `outputDir` line and its comment:

```ts
/* Chrome keeps dist/dev and dist/prod; Firefox builds go to dist/firefox-dev and dist/firefox-prod; the hook build to dist/prod-e2e */
const outputDir = withE2EHooks ? 'prod-e2e' : `${isFirefox ? 'firefox-' : ''}${isDev ? 'dev' : 'prod'}`;
```

In `DefinePlugin`, after `__TARGET__`:

```ts
      __E2E_HOOKS__: JSON.stringify(withE2EHooks),
```

`package.json` scripts, after `start`:

```json
    "build:e2e": "E2E_HOOKS=1 NODE_ENV=production node --loader ts-node/esm node_modules/webpack/bin/webpack.js --config webpack.config.ts --mode=production",
```

- [ ] **Step 3: Message action** — `src/types/Message.ts`, last member of `MessageAction`:

```ts
  /* Test hook of development builds and dist/prod-e2e: show a toast that stays (e2e/visual/) */
  E2E_SHOW_TOAST = 'E2E_SHOW_TOAST',
```

- [ ] **Step 4: Service worker hook** — `src/pages/ServiceWorker.ts`. Add `import type { ToastType } from '@/features/content/services/ToastQueue';` with the other imports, and `MessageAction` to the `@/types` import if it is not there. Replace the global declaration:

```ts
declare global {
  /* Test hook of development builds and of dist/prod-e2e, defined in ServiceWorker.initialize() */
  var __aiSummarizerE2E:
    | {
        clickContextMenu: (menuItemId: string, tabId: number) => Promise<void>;
        showToast: (tabId: number, type: ToastType, text: string) => Promise<void>;
      }
    | undefined;
}
```

Replace the hook block in `initialize()`:

```ts
    /*
     * Test hooks: no test tool can click a native context menu (e2e/context-menu.spec.ts), and the visual
     * tests need toasts that hold still (e2e/visual/). Kept inline: other production builds drop this
     * whole block, while a method would stay in the bundle
     */
    if (process.env.NODE_ENV === 'development' || __E2E_HOOKS__) {
      globalThis.__aiSummarizerE2E = {
        clickContextMenu: async (menuItemId: string, tabId: number) =>
          this.handleContextMenuClicked({ menuItemId, editable: false }, await chrome.tabs.get(tabId)),
        showToast: async (tabId: number, type: ToastType, text: string) => {
          const tab = await chrome.tabs.get(tabId);
          await chrome.tabs.sendMessage(tabId, { action: MessageAction.E2E_SHOW_TOAST, payload: { tabId, tabUrl: tab.url, type, text } });
        },
      };
    }
```

- [ ] **Step 5: Content script** — `src/features/content/hooks/useContentMessage.ts`, inside `handleMessage`, right before `switch (message.action) {` (after the `tabId` / `tabUrl` checks):

```ts
      /* Test hook of development builds and dist/prod-e2e (e2e/visual/); other production builds drop it */
      if ((process.env.NODE_ENV === 'development' || __E2E_HOOKS__) && message.action === MessageAction.E2E_SHOW_TOAST) {
        const { type, text } = message.payload;
        toast[type as ToastType](text, { hold: true });
        sendResponse({ success: true });
        return true;
      }
```

Import `ToastType` as a type: `import { toast, type ToastType } from '@/features/content/components/main';` if the barrel re-exports it (`Toaster.tsx` does `export type { ToastOptions, ToastType }`; check `src/features/content/components/main/index.ts`), otherwise from `@/features/content/services/ToastQueue`.

- [ ] **Step 6: Check types and unit tests**

Run: `pnpm type-check` → no errors. Run: `pnpm test` → all pass.

- [ ] **Step 7: Build and check where the hook ends up**

Run: `pnpm build:e2e`, then `pnpm build`, then `pnpm start`
Then: `grep -l __aiSummarizerE2E dist/prod-e2e/*.js` → lists `service-worker.js`
Then: `grep -c __aiSummarizerE2E dist/prod/*.js` → every count 0
Then: `pnpm exec playwright test --config e2e/playwright.config.ts --project prod --project dev` → PASS (includes `prod-build.spec.ts` and the context menu hook in `dist/dev`)
Also: `TARGET=firefox E2E_HOOKS=1 NODE_ENV=production node --loader ts-node/esm node_modules/webpack/bin/webpack.js --config webpack.config.ts --mode=production` → fails with "E2E_HOOKS=1 is for the Chrome production build"

- [ ] **Step 8: Commit**

```bash
git add src/types/Global.d.ts jest.config.js webpack.config.ts package.json src/types/Message.ts src/pages/ServiceWorker.ts src/features/content/hooks/useContentMessage.ts
git commit -m "feat: build dist/prod-e2e with a hook that shows a held toast"
```

---

### Task 3: Visual specs, Docker runner and baselines

**Files:**
- Create: `e2e/pages/root-10px.html`, `e2e/visual/fixtures.ts`, `e2e/visual/toast.spec.ts`, `e2e/visual/popup.spec.ts`, `scripts/visual.sh`, `e2e/visual/__screenshots__/**`
- Modify: `e2e/playwright.config.ts`, `package.json` (scripts)

**Interfaces:**
- Consumes: `showToast` hook and `pnpm build:e2e` (Task 2); `test`, `expect`, `waitForToast`, `openPage`, `openPopupFor`, `tabIdFor`, `serviceWorker` from `e2e/fixtures.ts`; `INJECTION_STAGE_MESSAGES`, `INJECTION_SUCCESS_MESSAGE`, `getInjectionFailureMessage`, `getModelUnavailableMessage` from `src/features/content/services/InjectionProgress.ts`
- Produces: `pnpm test:visual`, `pnpm test:visual:update`; projects `visual-offline` / `visual` when `E2E_VISUAL=1`

- [ ] **Step 1: The 10px page** — `e2e/pages/root-10px.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>The Lighthouse Keeper's Log, Small Root</title>
    <!-- YouTube sets html { font-size: 10px }: toast sizes in rem would shrink here -->
    <style>
      html {
        font-size: 10px;
      }
    </style>
  </head>
  <body>
    <main>
      <article>
        <h1>The Lighthouse Keeper's Log</h1>
        <p>The lighthouse keeper recorded every passing ship in a leather-bound log, noting the hour, the weather and the flag each vessel flew.</p>
        <p>For forty years the entries followed the same pattern, until a winter storm in 1911 left a page that described a ship nobody else had seen.</p>
      </article>
    </main>
  </body>
</html>
```

- [ ] **Step 2: Fixtures** — `e2e/visual/fixtures.ts`:

```ts
import type { Page } from '@playwright/test';

import type { ToastType } from '../../src/features/content/services/ToastQueue';
import { expect, test as base, waitForToast } from '../fixtures';

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
};
```

Note: a missing hook throws inside `toPass` and is retried until the timeout; the final error still carries "No toast hook: build dist/prod-e2e with pnpm build:e2e" (Review Focus 1).

- [ ] **Step 3: Specs** — `e2e/visual/toast.spec.ts`:

```ts
import {
  getInjectionFailureMessage,
  getModelUnavailableMessage,
  INJECTION_STAGE_MESSAGES,
  INJECTION_SUCCESS_MESSAGE,
} from '../../src/features/content/services/InjectionProgress';
import type { ToastType } from '../../src/features/content/services/ToastQueue';
import { COLOR_SCHEMES, expect, preparePage, test } from './fixtures';

/* The top of the viewport: the toast sits 24px below it, with its shadow */
const TOAST_CLIP = { x: 0, y: 0, width: 800, height: 160 };

/* One toast per type: the look depends on the type, and Jest checks the texts */
const TOASTS: { type: ToastType; text: string }[] = [
  { type: 'loading', text: INJECTION_STAGE_MESSAGES.pasting },
  { type: 'success', text: INJECTION_SUCCESS_MESSAGE },
  { type: 'error', text: getInjectionFailureMessage('pasting') },
  { type: 'warning', text: getModelUnavailableMessage('Gemini 3 Pro') },
];

for (const colorScheme of COLOR_SCHEMES) {
  for (const { type, text } of TOASTS) {
    test(`${type} toast, ${colorScheme}`, async ({ openPage, showToast }) => {
      const page = await openPage('article');
      await preparePage(page, colorScheme);
      await showToast(page, type, text);
      await expect(page).toHaveScreenshot(`${type}-${colorScheme}.png`, { clip: TOAST_CLIP, animations: 'disabled' });
    });
  }
}

/* Sizes in rem would follow the 10px root font size of the page, as on YouTube */
for (const { type, text } of TOASTS.filter(toast => toast.type === 'loading' || toast.type === 'error')) {
  test(`${type} toast on a page with a 10px root font size`, async ({ openPage, showToast }) => {
    const page = await openPage('root-10px');
    await preparePage(page, 'light');
    await showToast(page, type, text);
    await expect(page).toHaveScreenshot(`${type}-root-10px.png`, { clip: TOAST_CLIP, animations: 'disabled' });
  });
}
```

`e2e/visual/popup.spec.ts`:

```ts
import { COLOR_SCHEMES, expect, preparePage, test } from './fixtures';

for (const colorScheme of COLOR_SCHEMES) {
  test(`popup, ${colorScheme}`, async ({ openPage, openPopupFor }) => {
    const article = await openPage('article');
    const popup = await openPopupFor(article);
    await preparePage(popup, colorScheme);
    await expect(popup.locator('#root')).toHaveScreenshot(`popup-${colorScheme}.png`, { animations: 'disabled' });
  });
}
```

- [ ] **Step 4: Config** — `e2e/playwright.config.ts`. Add at top level, after `outputDir`:

```ts
  /* One set of baselines, made in the Playwright container only (scripts/visual.sh), so no platform suffix */
  snapshotPathTemplate: '{testDir}/visual/__screenshots__/{testFileName}/{arg}{ext}',
```

In the `prod` and `dev` projects, `testIgnore: ['routing.spec.ts', /e2e\/firefox\//, /e2e\/visual\//]`.

At the end of `projects`:

```ts
    /*
     * Visual: screenshots of dist/prod-e2e compared with baselines made in the Playwright container, so they
     * exist only with E2E_VISUAL=1, which scripts/visual.sh (pnpm test:visual) and the visual CI job set
     */
    ...(process.env.E2E_VISUAL === '1'
      ? [
          { name: 'visual-offline', testMatch: 'routing.spec.ts', testIgnore: /e2e\/firefox\//, use: { distDir: 'dist/prod-e2e' } },
          { name: 'visual', testMatch: /e2e\/visual\/.+\.spec\.ts$/, dependencies: ['visual-offline'], use: { distDir: 'dist/prod-e2e' } },
        ]
      : []),
```

Check (Review Focus 3): `pnpm exec playwright test --config e2e/playwright.config.ts --list | grep -c visual/` → `0`.

- [ ] **Step 5: Guard on macOS** (Review Focus 2)

Run: `pnpm build:e2e`, then `E2E_VISUAL=1 pnpm exec playwright test --config e2e/playwright.config.ts --project visual`
Expected: `visual-offline` passes; every `visual` test fails with "The visual baselines come from the Playwright container: run pnpm test:visual"; `git status --short e2e/visual` shows no PNG.

- [ ] **Step 6: Docker runner** — `scripts/visual.sh` (`chmod +x`):

```bash
#!/usr/bin/env bash
# Run the visual regression tests (e2e/visual/) in the Playwright container, where their baselines come from.
# Arguments go to playwright test: pnpm test:visual:update passes --update-snapshots.
# node_modules and the pnpm store live in Docker volumes, so the macOS node_modules stays as it is.
# linux/amd64 matches the CI runners; Apple Silicon runs it through Rosetta.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running: start OrbStack or Docker Desktop first" >&2
  exit 1
fi

PLAYWRIGHT_VERSION="$(node -p "require('@playwright/test/package.json').version")"
PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@')[1].split('+')[0]")"

docker run --rm --platform linux/amd64 --ipc=host \
  -v "$REPO_DIR":/work \
  -v ai-summarizer-visual-node-modules:/work/node_modules \
  -v ai-summarizer-visual-pnpm-store:/pnpm-store \
  -w /work \
  -e E2E_VISUAL=1 \
  "mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble" \
  bash -c 'set -e
    npm install --global --silent "pnpm@$0"
    pnpm install --frozen-lockfile --store-dir /pnpm-store
    pnpm build:e2e
    pnpm exec playwright test --config e2e/playwright.config.ts --project visual "$@"' "$PNPM_VERSION" "$@"
```

`package.json` scripts, after `test:e2e`:

```json
    "test:visual": "scripts/visual.sh",
    "test:visual:update": "scripts/visual.sh --update-snapshots",
```

Check (Review Focus 5) while Docker is stopped: `pnpm test:visual` → "Docker is not running: start OrbStack or Docker Desktop first", exit 1. Then start it: `orb start`.

Check (Review Focus 1): `pnpm test:visual` with a temporary edit of `scripts/visual.sh` replacing `pnpm build:e2e` with `pnpm build && rm -rf dist/prod-e2e && cp -r dist/prod dist/prod-e2e` → every visual test fails naming `pnpm build:e2e`. Undo the edit by hand before going on: the file is not committed yet, so `git checkout` cannot restore it.

- [ ] **Step 7: Make the baselines**

Run: `pnpm test:visual:update`
Expected: 12 PNGs under `e2e/visual/__screenshots__/` (`toast.spec.ts/` 10, `popup.spec.ts/` 2). If a toast test fails with "Timeout … waiting for stable screenshot" on the loading shots, the spinner keeps turning inside the closed shadow root: stop and ask for approval of `motion-reduce:animate-none` on the spinner (Global Constraints).

Look at every PNG (Read tool): toast colors match type and theme, the error toast has its × button, the popup is dark in `popup-dark.png`, the toasts on `root-10px` are the same size as on `article`.

- [ ] **Step 8: Run against the baselines**

Run: `pnpm test:visual` → 12 visual tests pass (plus `visual-offline`). Run it a second time → pass again (no flakiness).

- [ ] **Step 9: Check that a missing CSS fails** (not committed)

In `src/pages/Content.tsx`, temporarily replace `.then(globalsCss => appendContentStyles(shadowRoot, globalsCss));` with `.then(() => undefined);`
Run: `pnpm test:visual` → the 10 toast tests fail on the diff; the popup tests pass.
Revert: `git checkout src/pages/Content.tsx`. Record the result (failed count) for the PR description.

- [ ] **Step 10: Lint and commit**

Run: `pnpm prettier-check`, `pnpm eslint-check`, `pnpm type-check` → clean.

```bash
git add e2e/pages/root-10px.html e2e/visual e2e/playwright.config.ts scripts/visual.sh package.json
git status --short
git commit -m "test: compare screenshots of the toasts and the popup in the Playwright container"
```

`git status --short` must show no `.superpowers/` staged and no `test-results/`.

---

### Task 4: CI job

**Files:**
- Modify: `.github/workflows/ci.yml` (append two jobs)

**Interfaces:**
- Consumes: `pnpm build:e2e`, `E2E_VISUAL=1`, the `visual` project (Tasks 2–3)

- [ ] **Step 1: Add the jobs** — append to `jobs:`:

```yaml
  # The locked Playwright version, which names the container image of the visual job
  playwright-version:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.version }}
    steps:
      - uses: actions/checkout@v7

      - name: Read the locked Playwright version
        id: version
        run: |
          version="$(grep -m1 -oP "^  '@playwright/test@\K[0-9.]+" pnpm-lock.yaml)"
          test -n "$version"
          echo "version=$version" >> "$GITHUB_OUTPUT"

  # Screenshots compared with baselines made in the same image (scripts/visual.sh)
  visual:
    needs: playwright-version
    runs-on: ubuntu-latest
    container:
      image: mcr.microsoft.com/playwright:v${{ needs.playwright-version.outputs.version }}-noble
      options: --ipc=host
    env:
      E2E_VISUAL: '1'
    steps:
      - uses: actions/checkout@v7

      - name: Install pnpm
        uses: pnpm/action-setup@v5

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build (E2E hooks)
        run: pnpm build:e2e

      - name: Visual regression
        run: pnpm exec playwright test --config e2e/playwright.config.ts --project visual

      # The diff images of the extension's own UI over hand-written test pages: no account data or secrets
      - name: Upload report
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: playwright-report-visual
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Check the grep locally**

Run: `grep -m1 -oE "^  '@playwright/test@[0-9.]+" pnpm-lock.yaml` → `  '@playwright/test@1.63.0` (macOS grep has no `-P`; CI's GNU grep runs the `\K` form)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run the visual regression tests in the Playwright container"
```

The job is proven by the CI run of the pushed branch (final checkpoint below).

---

### Task 5: Documentation

**Files:**
- Modify: `README.md` (new `### Visual regression tests` before `### Firefox`), `CLAUDE.md` (Commands), `DIRECTORYSTRUCTURE.md:33,99`

- [ ] **Step 1: README** — insert before `### Firefox`:

````markdown
### Visual regression tests

Screenshots of the toasts and the popup of a production build with the test hook (`dist/prod-e2e`) are compared with the baselines in `e2e/visual/__screenshots__/`. They run in the Playwright Docker image, as in CI, because fonts and rendering differ between macOS and Linux. Docker (OrbStack or Docker Desktop) must be running.

```bash
# Build dist/prod-e2e and compare with the baselines
pnpm test:visual

# Update the baselines after an intended change to the look, then review the PNGs before committing
pnpm test:visual:update
```

Only commit baselines made by `pnpm test:visual:update`; never ones made on macOS. On a failure in CI, the `playwright-report-visual` artifact shows the diffs.
````

- [ ] **Step 2: CLAUDE.md** — in `## Commands`, after the `pnpm test:e2e` item:

```markdown
- `pnpm test:visual` — visual regression tests (`e2e/visual/`): builds `dist/prod-e2e` (`pnpm build:e2e`, a production build that keeps the test hook) and compares screenshots of the toasts and the popup with the baselines in `e2e/visual/__screenshots__/`, inside the Playwright Docker image (`scripts/visual.sh`, linux/amd64; Docker must be running). `pnpm test:visual:update` rewrites the baselines; never commit ones made on macOS. `pnpm test:e2e` leaves these tests out: the config adds them only with `E2E_VISUAL=1`
```

- [ ] **Step 3: DIRECTORYSTRUCTURE.md** — line 99 (`e2e/` description): append `; visual/ holds the screenshot tests of dist/prod-e2e and their baselines, run in Docker by pnpm test:visual`. Line 98 (`scripts/`): add `` `visual.sh`: running the visual tests in the Playwright container `` to the list in parentheses.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md DIRECTORYSTRUCTURE.md
git commit -m "docs: describe the visual regression tests"
```

---

### Final verification

- [ ] `pnpm prettier-check`, `pnpm eslint-check`, `pnpm type-check`, `pnpm test` → clean
- [ ] `pnpm build`, `pnpm start`, `pnpm build:firefox`, `pnpm start:firefox`, then `pnpm test:e2e` → all pass, no visual test listed
- [ ] `pnpm test:visual` → pass
- [ ] `git show --stat HEAD~4..HEAD` (or `git log --stat develop..HEAD`) → no `.superpowers/`, no `test-results/`
- [ ] **Checkpoint (ask the user):** push the branch and open the PR into `develop` with `Fixes FUT-161`; then the `visual` job of the CI run must pass
