# Visual Regression of the Toasts and the Popup Design

Date: 2026-10-03
Status: Approved (2026-10-03)
Issue: FUT-161 (part of FUT-153)

## Purpose

Guard the look of the production build with screenshot comparison. The look of the toasts is checked by hand today, and up to 0.3.3 the production build alone showed the toasts without their CSS, which nobody noticed. The E2E tests read the toast text from the accessibility tree, so they pass whether the CSS is there or not.

## Decisions

| Item | Decision | Reason |
|---|---|---|
| Browser | Chrome only, through Playwright's `toHaveScreenshot` | The Firefox E2E tests run through Puppeteer, which has no screenshot comparison |
| Build | A production-mode build with the test hook kept, `dist/prod-e2e`, made by `pnpm build:e2e` (`E2E_HOOKS=1`) | The shipped `dist/prod` has no hook, and must not get one. Driving the shipped build through real flows cannot hold the timed toasts ("Sending article…" lasts 1.5–2 s, success 3 s). Besides the hook, `dist/prod-e2e` goes through the same minification, CSS loading and closed shadow root as `dist/prod` |
| Showing a toast | `__aiSummarizerE2E.showToast(tabId, type, text)` in the service worker sends a hook-only message to the content script, which calls `toast.*` | No 500 ms extraction delay, no injector timing: each toast is shown in a known state |
| Timed toasts | A toast shown by the hook does not time out (`hold` option of `ToastQueue`, passed by the hook only) | success and warning leave after 3 s, which a slow CI run can reach while the screenshot is being taken |
| Shots | One per toast type (loading, success, error, warning) and the popup, in light and dark; loading and error again on a page with a 10px root font size. 12 images | The look depends on the type, not on the text, which Jest already checks. The injection stages are represented by "Pasting article…" |
| Theme | `colorScheme: 'light'` / `'dark'` | Both UIs follow the OS (`darkMode: 'media'`) |
| Motion | `reducedMotion: 'reduce'` on the context and `animations: 'disabled'` on each screenshot | The toast transitions have `motion-reduce:` variants; `animations: 'disabled'` covers the rest, such as the spinner |
| Environment | `mcr.microsoft.com/playwright:v<version>-noble` with `--platform linux/amd64`, where `<version>` is the locked `@playwright/test` | Fonts and rasterization differ between macOS and Linux, and can differ between arm64 and x64; CI runs on x64 |
| Baselines | Created and updated in Docker only. The `visual` project refuses to run outside Linux | A baseline made on macOS would fail in CI, and must not be committed |
| Default run | `pnpm test:e2e` leaves the visual tests out: the config adds the `visual-offline` and `visual` projects only with `E2E_VISUAL=1`, which `scripts/visual.sh` and the CI job set | It runs on macOS, where the Linux baselines cannot match |
| CI | New `visual` job in `ci.yml`, running in the Playwright container | The image version comes from the lockfile, so updating Playwright updates the image; the `e2e` job stays as it is |
| Check of the check | Remove the CSS loading of the content script once by hand, see `pnpm test:visual` fail on the diff, and note it in the pull request | A permanent negative test would need a broken build in CI |

## Layout

```
e2e/
├── playwright.config.ts          # + visual-offline and visual projects; visual tests left out of prod / dev
├── pages/
│   └── root-10px.html            # article page whose html font size is 10px, as on YouTube
└── visual/
    ├── toast.spec.ts
    ├── popup.spec.ts
    └── __screenshots__/          # baselines, from Docker only
scripts/
└── visual.sh                     # runs the visual tests in the Playwright container
```

## Build and hook

- `webpack.config.ts`: `E2E_HOOKS=1` in a Chrome production build writes to `dist/prod-e2e` and defines the constant `__E2E_HOOKS__` as `true` (declared next to `__TARGET__`; `false` in every other build and in Jest), so elsewhere the hook code is dropped as dead code. `E2E_HOOKS=1` with a development or Firefox build stops with an error
- `package.json`: `build:e2e` (`E2E_HOOKS=1 NODE_ENV=production … --mode=production`)
- The hook condition in `src/pages/ServiceWorker.ts` widens from `NODE_ENV === 'development'` to development or `__E2E_HOOKS__`. `e2e/prod-build.spec.ts` keeps checking that `dist/prod` and `dist/firefox-prod` contain no hook
- New `MessageAction.E2E_SHOW_TOAST` with payload `{ tabId, tabUrl, type, text }` (no group: every shot shows one toast). `useContentMessage` handles it inside the same condition, so the production content script has no branch for it
- `ToastOptions` gains `hold?: boolean`; `ToastQueue` skips the timeout of a held toast. Only the hook passes it

## Tests

Common setup in `e2e/visual/`: the existing `test` fixture with `distDir: 'dist/prod-e2e'`, viewport 800×600, `locale: 'en-US'`, `reducedMotion: 'reduce'`, and `colorScheme` per test.

`toast.spec.ts`, for each of light and dark:

- On `article.html`, show one toast through the hook, wait for its text in the accessibility tree (`waitForToast`), then compare the top of the viewport (800×160) with `toHaveScreenshot({ animations: 'disabled', clip })`. Types: loading "Pasting article…", success "Article has been sent!", error "Couldn't paste the article", warning (the model-unavailable message)
- On `root-10px.html`: loading and error

`popup.spec.ts`, for each of light and dark: open the popup for `article.html` with `openPopupFor` and compare its root element.

The shadow root is closed, so a toast cannot be located; it is captured by clipping the viewport. Whether `animations: 'disabled'` reaches the spinner inside the closed shadow root is checked during implementation. If it does not, adding `motion-reduce:animate-none` to the spinner is a UI change and goes back for approval.

## Running

- `pnpm test:visual`: `scripts/visual.sh` reads the locked Playwright version, runs the container with the repository mounted and `node_modules` on a named Docker volume (so the macOS `node_modules` stays intact), then inside it: `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm build:e2e`, `playwright test --project visual`
- `pnpm test:visual:update`: the same with `--update-snapshots`
- Snapshot path: `e2e/visual/__screenshots__/{testFileName}/{arg}{ext}`, without the platform suffix, since only Linux makes them

## CI (`.github/workflows/ci.yml`)

- Job `playwright-version` reads the locked `@playwright/test` version (the same `node -p` as the `e2e` job) and outputs it
- Job `visual` needs it and runs in `container: mcr.microsoft.com/playwright:v${{ needs.playwright-version.outputs.version }}-noble`: checkout, pnpm install, `pnpm build:e2e`, `playwright test --project visual`, and on failure uploads the report with the diff images
- Same trigger and `permissions: contents: read`, no secrets

## Documentation

- README: the visual tests, `pnpm test:visual` / `pnpm test:visual:update`, Docker (OrbStack or Docker Desktop) as a requirement, baselines from Docker only, never from macOS
- CLAUDE.md Commands: `pnpm build:e2e`, `pnpm test:visual`, `pnpm test:visual:update`

## Error handling

- The `visual` project outside Linux: the config throws with a message pointing to `pnpm test:visual`
- `dist/prod-e2e` missing: the existing fixture error ("Build … first") names the build
- `scripts/visual.sh` without a running Docker daemon: stops with a message to start it

## Out of scope

- Firefox, the options page and the side panel
- Every message text, and stacked toasts
- Changing the toast or popup design

## Testing the tests

- The first baselines are made with `pnpm test:visual:update` and looked at by eye before committing
- With the CSS loading removed from `src/pages/Content.tsx`, `pnpm test:visual` fails on every toast shot (checked once, not committed)
- Existing Jest, E2E, ESLint, Prettier and type-check pass
