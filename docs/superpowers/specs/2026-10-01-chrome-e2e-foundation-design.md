# Chrome E2E Foundation Design

Date: 2026-10-01
Status: Draft
Issue: FUT-191 (first half of FUT-158; the second half is FUT-192)

## Purpose

Move the manual pre-release checks on Chrome (popup, copy, toasts) into CI. This first step builds the foundation and covers an ordinary article page. Once it runs green in CI, FUT-192 adds YouTube / X extraction, injection into the AI service pages and the context menu hook.

## Decisions

| Item | Decision | Reason |
|---|---|---|
| Runner | `@playwright/test` (already a dev dependency), run by `pnpm test:e2e`, separate from Jest | Built-in projects, fixtures, traces and failure screenshots; mixing jsdom and a real browser in ts-jest would complicate its config |
| Browser | Bundled Chromium, `channel: 'chromium'`, headless, `launchPersistentContext` with `--load-extension` | Branded Chrome dropped `--load-extension` in 137. The new headless mode runs extensions (spike, 2026-10-01) |
| Builds | Two projects, `prod` (`dist/prod`) and `dev` (`dist/dev`). The config does not build; a missing build stops the run with a clear error | Builds are explicit in CI and locally; a stale build is the user's choice, not a hidden step |
| Network | None. `context.route` answers each host with a local HTML page | Fixtures only, so no bot checks, no flakiness from live sites, no terms-of-service issue |
| Article page | Hand-written `e2e/pages/article.html` and `e2e/pages/empty.html` | `src/features/content/__fixtures__/` holds captured pages only, and `Fixtures.test.ts` checks their capture header |
| Popup | Open `popup.html` in a tab, make the target tab active, reload the popup, click its real buttons | The popup reads the target with `tabs.query({active, currentWindow})`. `chrome.action.openPopup()` returns but its page is invisible to Playwright (spike) |
| Toasts | Read the text from the CDP accessibility tree (`Accessibility.getFullAXTree`) in both builds | The content script's shadow root is closed in every build (FUT-173), so Playwright locators find nothing there; the accessibility tree includes it (spike) |
| Screenshots | Only Playwright's automatic failure screenshot | Baseline comparison is FUT-161 (visual regression in Docker) |
| Clipboard | Grant `clipboard-read` / `clipboard-write`, read with `navigator.clipboard.readText()` in the page | Works headless (spike); the extension writes with `execCommand('copy')` from the content script |
| Locale | `en-US` | The default clipboard prompt names the browser language |
| CI | New `e2e` job in `ci.yml`, parallel to `check` | Same trigger, `contents: read`, no secrets, so fork pull requests stay safe |
| Release lane | Unchanged | Not in FUT-191's scope; CI already runs on every push to `develop` |

## Layout

```
e2e/
├── playwright.config.ts   # projects prod / dev, testDir, reporter, failure screenshots
├── fixtures.ts            # extended test: extension context, extension ID, service worker, helpers
├── pages/
│   ├── article.html       # readable article with a known title and paragraphs
│   └── empty.html         # page without readable content
├── popup.spec.ts
├── options.spec.ts
├── copy.spec.ts
└── extraction-failure.spec.ts
```

`DIRECTORYSTRUCTURE.md` gains an `e2e/` entry. Jest ignores `e2e/`; `tsconfig.json`, ESLint and Prettier include it.

## Fixtures and helpers (`e2e/fixtures.ts`)

- `distDir` (option, set per project): the unpacked build to load
- `context` (worker-independent, per test): `chromium.launchPersistentContext` on a fresh temporary profile with `--disable-extensions-except` / `--load-extension`, `channel: 'chromium'`, headless, `locale: 'en-US'`, clipboard permissions. Every request to `https://*.e2e.test/` is routed: the path picks a file in `e2e/pages/`. Any other request is aborted, so a test can never reach the network
- `serviceWorker`: the extension's service worker (waits for it on a cold start)
- `extensionId`: the host of the service worker URL
- `openPage(path)`: opens `https://news.e2e.test/<path>` and waits until the content script root `#free-ai-summarizer-root` exists
- `openPopupFor(page)`: finds the tab ID of `page` through the service worker (`chrome.tabs.query({ url })`), opens `popup.html` in a new tab, activates the target tab with `chrome.tabs.update`, reloads the popup, waits for "Summarize this page", and returns the popup page
- `waitForToast(page, text)`: polls the page's accessibility tree through a CDP session until a node's name contains `text`, or fails after a timeout. Must poll from right after the click: success toasts disappear after 3 s

`.e2e.test` is reserved for testing (RFC 6761 `.test`), so a routing mistake cannot hit a real site.

## Scenarios

Each spec runs in both projects.

1. `popup.spec.ts`: with the article page as the target, the popup shows "Summarize this page", every AI service enabled by default (all nine), "Copy to clipboard" and "Settings"
2. `options.spec.ts`: `options.html` has the title "Free AI Summarizer Settings" and the "AI Service", "Display on Menu" and "Open AI Service in" cards
3. `copy.spec.ts`: on the article page, "Copy to clipboard" in the popup puts the article on the clipboard (`# Title` followed by the article title, the URL, and the paragraph text), and the toast "Article copied to clipboard" appears
4. `extraction-failure.spec.ts`: on the empty page, "Copy to clipboard" shows "Couldn't extract this article" and leaves the clipboard unchanged (a sentinel written before the click)

The progress toast ("Extracting article…", shown after 500 ms) is not checked: extraction of a local page finishes before it appears, so the check would be timing-dependent.

## CI (`.github/workflows/ci.yml`)

New job `e2e` on `ubuntu-latest`, alongside `check`:

1. Checkout, Node 20, pnpm, pnpm store cache, `pnpm install` (same steps as `check`)
2. Cache `~/.cache/ms-playwright`, keyed by the installed `@playwright/test` version
3. `pnpm exec playwright install --with-deps chromium`
4. `pnpm build` and `pnpm start` (development build without watch)
5. `pnpm test:e2e`
6. On failure only, upload `playwright-report/` as an artifact kept for 7 days. It contains the hand-written pages and the extension's own UI, no account data or secrets

## Error handling

- Missing `dist/prod` or `dist/dev`: the `context` fixture throws `Build <dir> first (pnpm build / pnpm start)` before launching
- Service worker not started within 10 s: the fixture fails with the build directory in the message
- Unrouted request: aborted and logged in the test output, so a missing page shows up as a test failure rather than a hang

## Out of scope

- YouTube / X extraction, injection into the AI service pages, the context menu hook (FUT-192)
- Firefox (FUT-160), visual regression baselines (FUT-161)
- Running E2E in the fastlane release lane

## Testing the tests

- Each scenario is first seen failing with a deliberately wrong expectation (for example, `waitForToast` with a different text), to confirm it can detect a failure; the wrong expectation is not committed
- `pnpm test:e2e` passes locally on macOS and in the CI job on the pull request
