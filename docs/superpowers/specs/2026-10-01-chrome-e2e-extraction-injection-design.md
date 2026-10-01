# Chrome E2E Extraction, Injection and Context Menu Design

Date: 2026-10-01
Status: Approved (2026-10-01); routing revised after the network leak below, approved (2026-10-01)
Issue: FUT-192 (second half of FUT-158; the first half is FUT-191, see `2026-10-01-chrome-e2e-foundation-design.md`)

## Purpose

Extend the Chrome E2E suite from an ordinary article page to the rest of the user-facing paths: extraction of YouTube transcripts and X posts / articles, injection into all nine AI service composers, and the context menu. Everything still runs offline against captured fixtures, in CI on every push and pull request.

## Decisions

| Item | Decision | Reason |
|---|---|---|
| Pages | Reuse the captured fixtures in `src/features/content/__fixtures__/`, served at their real host names by a local HTTPS server | They are the sanitized live DOM the Jest tests already use; serving them at the real host makes the extension take its real code path (`isAIServiceUrl`, `getAIServiceForUrl`, extractor choice) |
| Network | None, enforced by Chromium's resolver: `--host-resolver-rules` maps every test host to the local server and every other host to `~NOTFOUND`. `context.route` is no longer used | `context.route` missed the first navigation of tabs opened by the service worker (see "Network leak" below); the resolver applies to every request of the browser, whoever starts it |
| Subresources | The server answers a request whose `Sec-Fetch-Dest` is `document` with the page, anything else with 404 | The fixtures keep the original image and asset URLs |
| Injection check | The composer contains the article title and body, and the toast "Article has been sent!" appears | A static fixture has no site script, so a click on its send button does nothing, except inside a `<form>`, where it submits the form natively and reloads the page with the composer emptied. The server adds a script to the fixture's `<head>` that cancels form submission, standing in for the site's submit handler. The click itself is covered by the injector Jest tests |
| Context menu | A hook on the service worker global, defined only when `process.env.NODE_ENV === 'development'`. Its tests run in the `dev` project only | No tool can click a native context menu or fire `chrome.contextMenus.onClicked`. Same guard as `Logger.ts` and `Browser.ts`; production mode removes it |
| Hook absence | A test greps every `.js` file of `dist/prod` for the hook name | Done-when of FUT-192 |
| Projects | Every new spec runs in `prod` and `dev`, except the context menu spec (`dev` only) and the build check (`prod` only) | Same rule as FUT-191 |
| Model selection, send click, Settings menu, `CURRENT_TAB` / private tabs | Out of scope | Default settings select no model; the send click is covered by Jest; the side panel is not observable from Playwright |

## Layout

```
e2e/
├── fixtures.ts              # extended: fixture server, serveFixture, openFixturePage, waitForServicePage
├── fixture-server.ts        # local HTTPS server: test pages, captured fixtures, self-signed certificate
├── routing.spec.ts          # extended: tabs opened by the extension stay local, unknown hosts do not resolve
├── extraction.spec.ts       # YouTube, X post, X article
├── injection.spec.ts        # nine services plus the ChatGPT guest and Grok textarea composers
├── context-menu.spec.ts     # dev only: Copy and Claude through the hook
└── prod-build.spec.ts       # prod only: the hook is absent from dist/prod
```

## Network leak (found 2026-10-01, during implementation)

The first version routed requests with `context.route`. The injection specs then reached the live sites: a tab the service worker opens with `chrome.tabs.create` starts loading before Playwright attaches its interception, so its first navigation went to the network. chatgpt.com and claude.ai answered 403 with a Cloudflare challenge, aistudio.google.com redirected to the Google sign-in, and the live guest page of grok.com very likely received and sent the test article (four runs: two Grok composers, two builds). Only the hand-written test article was involved; every run used a fresh, signed-out profile.

A spike (2026-10-01) confirmed the replacement: with `--host-resolver-rules="MAP chatgpt.com 127.0.0.1:<port>, MAP * ~NOTFOUND"` and `--ignore-certificate-errors`, a tab opened by the service worker loads the local page, a page opened by Playwright does too, and an unmapped host fails with `ERR_NAME_NOT_RESOLVED`. The server sees `Sec-Fetch-Dest: document` for pages and `image` for the favicon.

## Fixture server (`e2e/fixture-server.ts`)

- One server per Playwright worker (worker-scoped fixture), on `127.0.0.1` at a free port, with a self-signed certificate made by `openssl req -x509` in a temporary directory at start-up (`openssl` is on macOS and on `ubuntu-latest`; no new dependency). The browser accepts it through `--ignore-certificate-errors` and Playwright's `ignoreHTTPSErrors`
- Chromium is launched with `--host-resolver-rules` mapping `news.e2e.test` and every fixture host below to `127.0.0.1:<port>`, then `MAP * ~NOTFOUND`
- Requests are answered by the `Host` header: `news.e2e.test` from `e2e/pages/<path>.html` (404 for a missing page), a fixture host from its fixture (see the table), anything else 404. Only `Sec-Fetch-Dest: document` gets HTML; every other request gets 404
- Per-test overrides (`serveFixture`) are kept in the server and cleared when the test's context closes

A table maps each fixture host to its default fixture:

| Host | Fixture |
|---|---|
| `www.youtube.com` | `youtube-watch` |
| `x.com` | by path: `/Safety/status/1801282137921871887` → `x-article`, any other path → `x-post` |
| `chatgpt.com` | `chatgpt-composer` |
| `gemini.google.com` | `gemini-composer` |
| `aistudio.google.com` | `aistudio-composer` |
| `claude.ai` | `claude-composer` |
| `grok.com` | `grok-tiptap-composer` |
| `www.perplexity.ai` | `perplexity-composer` |
| `chat.deepseek.com` | `deepseek-composer` |
| `www.kimi.ai` | `kimi-composer` |
| `chat.qwen.ai` | `qwen-composer` |

The AI service hosts are the ones `getSummarizeUrl` opens. Fixture files are read with `fs` from `src/features/content/__fixtures__/<name>.html`; `__fixtures__/index.ts` is not imported, since it relies on `__dirname`, which the ESM test files do not have. The capture header is an HTML comment and is served as is; the only change to a fixture is the submit-cancelling script at the start of its `<head>`.

## Helpers (`e2e/fixtures.ts`)

- `serveFixture(host, name)`: makes the server answer one fixture host with another fixture for the rest of the test. Used for `chatgpt-guest-composer` and `grok-textarea-composer`
- `openFixturePage(name)`: opens the `source:` URL from the fixture's capture header and waits for `#free-ai-summarizer-root`, like `openPage`
- `openPopupFor(page)`: now finds the tab with `chrome.tabs.query({})` and an exact URL match, since a `url` query does not match URLs with a query string such as `?v=`
- `waitForServicePage(host)`: waits up to 10 s for a new page on `host` (the AI service tab opened by the service worker) and returns it
- `waitForToast`: unchanged default timeout (5 s); the injection specs pass 20 s, since the success toast appears only when the injector finishes

Two minor issues left from FUT-191 are fixed while `fixtures.ts` is open: a failing `cdp.detach()` no longer hides the original failure (its error is ignored), and the temporary profile is removed in a `finally` block even when closing the context throws. The 30 s wait when the popup does not appear and the duplicated CI install steps stay as they are.

## Context menu hook (`src/pages/ServiceWorker.ts`)

```ts
if (process.env.NODE_ENV === 'development') {
  /* E2E hook: tests cannot click a native context menu (e2e/context-menu.spec.ts) */
  globalThis.__aiSummarizerE2E = {
    clickContextMenu: async (menuItemId: string, tabId: number) => this.handleContextMenuClicked({ menuItemId, editable: false }, await chrome.tabs.get(tabId)),
  };
}
```

The block is written inline in `initialize()`, not as a method: a method would stay in the production bundle with the hook name in it, while a dead `if` block is removed whole. The type of `__aiSummarizerE2E` is declared with `declare global`. The tests call it with `serviceWorker.evaluate`.

## Scenarios

### `extraction.spec.ts`

For `youtube-watch`, `x-post` and `x-article`: open the fixture page, press "Copy to clipboard" in the popup, then check the success toast "Article copied to clipboard" and the clipboard:

- YouTube: the video title and the transcript line `[0:01](https://youtu.be/jNQXAC9IVRw?t=1s) All right, so here we are, …`, as the Jest test in `extractors/__tests__/Youtube.test.ts` expects from the same fixture. The progress toast "Extracting transcript…" is checked as well: extraction waits 4 s before reading the transcript, so the toast (shown after 500 ms) always appears
- X post and X article: the title and body text the Jest tests in `extractors/__tests__/X.test.ts` expect from the same fixtures

### `injection.spec.ts`

For each of the eleven composers (nine services, plus `chatgpt-guest-composer` and `grok-textarea-composer` through `serveFixture`): open the article page, press the service in the popup, wait for the service tab (the default tab behavior is `NEW_TAB`), then check that the composer holds the article title and body and that "Article has been sent!" appears. The composer is read from the page DOM (it is not in the extension's shadow root), with the editor selector from the service's Jest test.

### `context-menu.spec.ts` (dev only)

- Copy: on the article page, call the hook with the copy menu item; check the toast and the clipboard as in `copy.spec.ts`
- Claude: on the article page, call the hook with the Claude menu item; check the injection as above

### `prod-build.spec.ts` (prod only)

Read every `.js` file under `dist/prod` and expect no occurrence of `__aiSummarizerE2E`. It uses no browser: the test does not depend on the `context` fixture, so Chromium is not launched.

## Risk checked during implementation

A fixture page loads fast and `tabs.onUpdated` reports `complete` once, while a live AI service reports it several times during its boot. `INJECT_ARTICLE` may therefore arrive before the content script registers its message listener (the readiness note left by FUT-191). If the injection specs show this race, it is a product bug candidate for fast pages: it is reported and decided with the user, not worked around in the tests.

## CI

`.github/workflows/ci.yml` is unchanged: `testMatch: '*.spec.ts'` picks up the new specs. The e2e job is expected to take 2 to 4 minutes longer (about 2 to 6 s per injection; every composer fixture has an enabled send button, so ChatGPT does not spend its 10 s wait for one). The default Playwright timeout of 30 s per test stays.

## Error handling

- Unknown fixture name or a fixture without a valid capture header: the helper throws with the name
- AI service tab not opened within 10 s: `waitForServicePage` fails with the host in its message
- `openssl` missing or failing: the server fixture throws `openssl is needed to create the test certificate` with its error, before Chromium starts
- A host the server does not know: Chromium cannot resolve it (`ERR_NAME_NOT_RESOLVED`), so a test sees a failed load, never a live site

## Testing the tests

- `routing.spec.ts` pins the leak: a tab opened by the service worker with `chrome.tabs.create` on a fixture host shows the fixture (checked through the server's request log, not only the page), and a tab it opens on an unmapped host fails to resolve. The existing routing tests change from `ERR_FAILED` to `ERR_NAME_NOT_RESOLVED`
- No injection spec runs before these routing tests pass
- Each scenario is first seen failing with a deliberately wrong expectation; the wrong expectation is not committed
- The build check is first pointed at `dist/dev` to see it detect the hook
- `pnpm test:e2e` passes locally on macOS and in the CI job on the pull request; `pnpm test`, `pnpm type-check`, `pnpm eslint-check` and `pnpm prettier-check` pass

## Documentation

- `CLAUDE.md`: the `pnpm test:e2e` entry mentions the local fixture server, that no request leaves the machine, and the dev-only context menu hook
- Memory `test-automation-strategy.md`: `context.route` does not cover tabs opened by an extension; use the resolver rules
- The FUT-191 spec's out-of-scope line keeps pointing here; no change needed
