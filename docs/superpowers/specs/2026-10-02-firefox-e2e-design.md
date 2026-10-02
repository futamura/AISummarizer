# Firefox Desktop E2E Design

Date: 2026-10-02
Status: Draft
Issue: FUT-160 (under FUT-153). Depends on FUT-208 (merged in PR #45)

## Purpose

Run the E2E scenarios of the Chrome version against the Firefox version too, so that Firefox-only regressions (the popup that does not close while the service worker extracts, the injection that `insertHTML` performs on Gecko, a message sent before the content script listens) show up in CI instead of in manual checks. Playwright cannot load extensions into Firefox, so Firefox is driven by Puppeteer over WebDriver BiDi, while the Playwright test runner keeps running every spec.

## Decisions

| Item | Decision | Reason |
|---|---|---|
| Runner | `@playwright/test`, the same `pnpm test:e2e` and config as Chrome; Firefox runs in its own projects | Projects, the routing-first dependency, retries, reporters and failure attachments already exist. Puppeteer is a library and has no runner |
| Driver | `puppeteer` `^24.43.1` (dev dependency, locked by `pnpm-lock.yaml`), `browser: 'firefox'`, WebDriver BiDi, headless | Only Puppeteer's BiDi `browser.installExtension()` loads a temporary add-on in an automated Firefox (spike, 2026-10-01) |
| Firefox | The build pinned by that Puppeteer version (stable_150.0.2), installed with `pnpm exec puppeteer browsers install firefox` into `~/.cache/puppeteer` | A fixed browser version, like Playwright's bundled Chromium. pnpm 10 does not run Puppeteer's install script, so no Chrome is downloaded |
| Specs | Separate Firefox specs in `e2e/firefox/`; data shared with the Chrome specs moves to `e2e/scenarios.ts` | The Chrome specs use Playwright's page API (`getByText`, `toBeVisible`, `getByRole`), which Puppeteer pages do not have. A driver layer shared by both would rewrite every Chrome spec |
| Builds | `dist/firefox-prod` and `dist/firefox-dev`; a new `pnpm start:firefox` builds the development version without watch | Same policy as Chrome: production-only problems such as the missing CSS of FUT-173 surface, and the context menu hook exists in development builds only |
| Network | A refusing proxy next to the fixture server, plus prefs (below) | Firefox has no `--host-resolver-rules`. The proxy routes the served hosts to the fixture server and refuses every other host |
| Certificate | `acceptInsecureCerts: true` at launch | Browser-wide, so it covers the tabs the extension opens (10 of 10 in the spike) |
| Extension UUID | Fixed with the pref `extensions.webextensions.uuids` | `moz-extension://<uuid>/` URLs are known before the first page opens |
| Privileged calls | An extension page (`options.html`) opened in a tab calls `browser.tabs.*`; `runtime.getBackgroundPage()` reaches the background page | Firefox's background is a page, not a service worker, and Puppeteer exposes no handle to it |
| Toasts | BiDi `browsingContext.locateNodes` with `serializationOptions.includeShadowTree: 'all'`, polled | The shadow root is closed; the CDP accessibility tree the Chrome specs read does not exist in Firefox |
| Clipboard | Pref `dom.events.testing.asyncClipboard: true`, read with `navigator.clipboard.readText()` in the page | Lets a page read the clipboard without a user gesture (spike) |
| CI | Added to the existing `e2e` job, not a new job | One `pnpm test:e2e` runs all eight projects; split later only if the job gets too slow |

## Layout

```
e2e/
├── playwright.config.ts   # + four Firefox projects; Chrome projects ignore firefox/
├── fixture-server.ts      # + the refusing proxy
├── scenarios.ts           # new: COMPOSERS and SERVICE_LABELS, moved from injection.spec.ts and popup.spec.ts
├── fixtures.ts            # Chrome, unchanged apart from imports
├── firefox/
│   ├── fixtures.ts        # Firefox test fixtures and helpers
│   ├── routing.spec.ts
│   ├── popup.spec.ts
│   ├── options.spec.ts
│   ├── copy.spec.ts
│   ├── extraction.spec.ts
│   ├── extraction-failure.spec.ts
│   ├── injection.spec.ts
│   ├── context-menu.spec.ts
│   └── popup-close.spec.ts
└── ... (Chrome specs, unchanged apart from imports)
```

## Projects (`e2e/playwright.config.ts`)

| Project | testMatch | Depends on | distDir |
|---|---|---|---|
| `prod-offline`, `dev-offline`, `prod`, `dev` | as today, plus `testIgnore: 'firefox/**'` | as today | `dist/prod`, `dist/dev` |
| `firefox-prod-offline` | `firefox/routing.spec.ts` | none | `dist/firefox-prod` |
| `firefox-dev-offline` | `firefox/routing.spec.ts` | none | `dist/firefox-dev` |
| `firefox-prod` | `firefox/*.spec.ts` except routing, and `prod-build.spec.ts` | `firefox-prod-offline` | `dist/firefox-prod` |
| `firefox-dev` | `firefox/*.spec.ts` except routing | `firefox-dev-offline` | `dist/firefox-dev` |

`prod-build.spec.ts` reads the build's files without a browser, so it can check `dist/firefox-prod` too; its skip condition changes from `distDir !== 'dist/prod'` to "not one of `dist/prod` and `dist/firefox-prod`". `workers: 1` stays: the clipboard may be shared between browser instances.

## Offline guarantee

### Refusing proxy (`e2e/fixture-server.ts`)

`startFixtureServer()` also starts an HTTP proxy on `127.0.0.1` and returns its port as `proxyPort` and a `refused` list:

- `CONNECT <host>:443` to a host in `SERVED_HOSTS` (the same list the Chrome resolver rules use) is tunnelled to the fixture server
- Any other `CONNECT`, and any plain `http://` request, is answered `403` and its host is appended to `refused`
- `reset()` also clears `refused`; `close()` closes the proxy

The Chrome fixtures ignore both fields.

### Firefox prefs

| Pref | Value | Why |
|---|---|---|
| `network.proxy.type` | `1` | Manual proxy |
| `network.proxy.http`, `network.proxy.ssl` | `127.0.0.1` | The refusing proxy |
| `network.proxy.http_port`, `network.proxy.ssl_port` | `proxyPort` | |
| `network.proxy.no_proxies_on` | `''` | No exception, not even localhost |
| `network.proxy.allow_hijacking_localhost` | `true` | Sends localhost through the proxy too |
| `network.trr.mode` | `5` | No DNS over HTTPS |
| `network.http.http3.enable` | `false` | No QUIC, which a proxy does not carry |
| `network.dns.native-is-localhost` | `true` | A lookup that escapes the proxy still resolves to localhost |
| `extensions.webextensions.uuids` | `{"free-ai-summarizer@futamura.dev":"<fixed uuid>"}` | Fixed extension origin |
| `dom.events.testing.asyncClipboard` | `true` | Clipboard reads from the page |

In the spike these kept every request local: `example.com` failed with `NS_ERROR_PROXY_FORBIDDEN`, the extension's `fetch` failed, Firefox's own background requests (remote settings, captive portal check) were refused, and `lsof` showed no external socket of the Firefox processes.

### `e2e/firefox/routing.spec.ts`

Runs first in each Firefox build; when it fails, no other Firefox spec runs.

1. The extension holds its host permissions: `permissions.contains({ origins: ['<all_urls>'] })` is `true`
2. Opening `https://example.com/` fails with `NS_ERROR_PROXY_FORBIDDEN`, and `refused` contains `example.com`
3. A missing test page answers `404`
4. A fixture host answers its fixture, and a `fetch` from it to the site's API answers `404`
5. Submitting a fixture's form keeps the page in place (the submit guard works on Firefox)
6. A tab the extension opens with `tabs.create` is answered by the fixture server (seen in `requests`)
7. A `fetch('https://example.com/')` from the background page fails

The two browser-free checks of the Chrome routing spec (unknown fixture name, submit guard position) are not repeated.

## Fixtures and helpers (`e2e/firefox/fixtures.ts`)

Built with `test.extend` from `@playwright/test`; names match the Chrome fixtures where the meaning is the same.

- `distDir` (option, set per project)
- `fixtureServer` (worker scope): `startFixtureServer()`, shared with Chrome
- `browser` (per test): `puppeteer.launch({ browser: 'firefox', headless: true, acceptInsecureCerts: true, extraPrefsFirefox })` on a fresh profile, then `browser.installExtension(<distDir>)`. Throws `Build <distDir> first (pnpm build:firefox / pnpm start:firefox)` when the manifest is missing. On failure, a screenshot of every page is attached as in the Chrome fixtures
- `extensionPage`: `options.html` opened in a tab; `background.evaluate(fn, arg)` runs `fn` in it, where `browser.*` is available
- `openPage(name)`, `openFixturePage(name)`: open the URL and wait for `#free-ai-summarizer-root`
- `tabIdFor(page)`: finds the tab through `browser.tabs.query` by the page's `location.href`
- `openPopupFor(target)`: opens `popup.html` in a tab, makes the target tab active, reloads the popup, waits for "Summarize this page"
- `waitForServicePage(host)`: finds the page whose `location.href` has that host
- `poll(page, fn, arg, timeout)`: evaluates until truthy, ignoring the transient BiDi errors raised while a document is replaced
- `clickText(page, text)`: clicks the element whose text is exactly `text` with a DOM `click()`
- `waitForToast(page, text, timeout)`, `readClipboard(page)`, `writeClipboard(page, text)`, `readComposer(page, selector)`, `expectArticleInjected(page, selector)`

### Puppeteer on Firefox, handled inside the fixtures

| Behaviour (spike) | Handling |
|---|---|
| `goto` / `reload` of a `moz-extension://` page never resolves | Start the load without awaiting it, then `poll` for the URL and `readyState === 'complete'` |
| Evaluation fails while a document is replaced (`right-hand side of 'in' should be an object, got null`) | `poll` catches errors until its timeout, reporting the last one |
| `page.url()` stays `about:blank` for a tab the extension opens | Pages are found by evaluating `location.href` |
| `locator().click()` in a background tab takes about 21 s | `clickText` uses a DOM `click()` |
| `locateNodes` needs the BiDi connection and the frame's context ID, which Puppeteer does not expose publicly | Used in `waitForToast` only, so a Puppeteer update that breaks it has one place to fix |

## Scenarios (`e2e/firefox/`)

Each spec runs in both Firefox builds unless noted.

1. `popup.spec.ts`: the popup shows the nine services of `SERVICE_LABELS`, "Copy to clipboard" and "Settings". Visible means the element exists and its bounding box is not empty
2. `options.spec.ts`: title "Free AI Summarizer Settings" and the "AI Service", "Display on Menu" and "Open AI Service in" headings
3. `copy.spec.ts`: "Copy to clipboard" on the article page shows "Article copied to clipboard" and puts the title, URL and paragraph on the clipboard
4. `extraction.spec.ts`: the YouTube transcript, the X post with its self reply and the X article, as in the Chrome spec
5. `extraction-failure.spec.ts`: the empty page shows "Couldn't extract this article" and leaves the clipboard sentinel in place
6. `injection.spec.ts`: every entry of `COMPOSERS` (eleven): the "Article has been sent!" toast appears, the composer contains the title and the paragraph, and the line breaks survive: the editor's `innerText` has the title and the paragraph on different lines. Firefox injects with `insertHTML`, which is where line breaks were lost before. The exact assertion is settled in the implementation plan
7. `context-menu.spec.ts` (`firefox-dev` only): calls `__aiSummarizerE2E.clickContextMenu` on the background page from `runtime.getBackgroundPage()`, for the copy item and for Claude
8. `popup-close.spec.ts` (Firefox only, FUT-147 regression): on the YouTube fixture, whose transcript takes more than 4 s, the popup tab closes within 1 s of clicking "Copy to clipboard", and the copy toast still follows; the same for ChatGPT, followed by the injection

## CI (`.github/workflows/ci.yml`, job `e2e`)

Added steps:

1. Cache `~/.cache/puppeteer`, keyed by the installed `puppeteer` version
2. `pnpm exec puppeteer browsers install firefox` (a no-op when the cache holds it)
3. `pnpm build:firefox` and `pnpm start:firefox` after the Chrome builds

`pnpm test:e2e` then runs all eight projects. Headless Firefox needs no display; if the runner lacks a library, the job is adjusted during implementation. The job stays `contents: read` without secrets, so fork pull requests remain safe. The job is expected to grow from about 4 to 8–9 minutes.

## Documentation

- `CLAUDE.md`, the `pnpm test:e2e` entry: Firefox runs through Puppeteer over BiDi, offline through the refusing proxy; the four builds it needs; the one-time `pnpm exec puppeteer browsers install firefox`
- `DIRECTORYSTRUCTURE.md`: `e2e/firefox/` and `e2e/scenarios.ts`
- `TECHNOLOGSTACK.md`: `puppeteer`
- `package.json`: `start:firefox`

## Error handling

- Missing build: the `browser` fixture throws before launching, naming the build commands
- Firefox not installed: the launch error is rethrown with `pnpm exec puppeteer browsers install firefox`
- A request to an unserved host: refused by the proxy and listed in `refused`, so a missing fixture host shows up as a failure that names the host

## Out of scope

- Firefox for Android (FUT-156)
- The native popup and context menu UI, including the popup's real height: no tool drives them
- Live sites (the canary, FUT-159)
- Splitting the CI job per browser

## Done when

- [ ] `dist/firefox-dev` and `dist/firefox-prod` load through `installExtension`
- [ ] The extension UUID is fixed through `extensions.webextensions.uuids`
- [ ] The scenarios above pass in CI on `ubuntu-latest` and locally on macOS
- [ ] `popup-close.spec.ts` checks that the popup closes without waiting for the extraction
- [ ] `firefox/routing.spec.ts` checks `permissions.contains` first
- [ ] The Chrome E2E still passes unchanged

## Testing the tests

- Each new Firefox spec is first seen failing with a deliberately wrong expectation, which is not committed
- The routing spec is also seen failing with the proxy prefs removed, to confirm it detects a request that leaves the machine
- `popup-close.spec.ts` is seen failing with FUT-147's fix reverted locally (the clipboard extraction awaited in the service worker)
