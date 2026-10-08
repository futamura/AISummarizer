# Page fixtures

Injector and extractor tests run against sanitized snapshots of the live pages they target, stored in `src/features/content/__fixtures__/`. When a site changes its DOM, recapturing the fixture makes the affected tests fail (or pass again after the fix), instead of the tests checking hand-written markup that no longer matches the site.

## What a fixture contains

`capture.js` sanitizes the page inside the browser, so the raw HTML never leaves it:

- `<head>`, scripts, styles, media, iframes, hidden inputs, comments and SVG paths are removed
- Outside the fixture's "keep" regions (the composer, the post, the transcript panel, …), all text is removed and only structural attributes (`id`, `class`, `role`, `data-testid`, …) remain. This drops account names, avatars and conversation history
- Inside the keep regions, text and most attributes remain, except URLs (other than the X post links a fixture keeps through `keepHref`) and inline styles. Texts longer than 200 characters are cut to a 120-character excerpt
- Emails, UUIDs, JWTs, long token-like strings and site-specific account identifiers (such as X's `UserAvatar-Container-<handle>`) are replaced with `REDACTED`. A token keeps its leading plain words, so Gemini's `bard-mode-option-<hash>` becomes `bard-mode-option-REDACTED` and still matches the injector's prefix selector
- Elements and attributes that other extensions add to every page (DeepL, Proton Pass, Dark Reader, …) are removed: they are not the site's markup and they reveal which extensions the capturing browser has

The first line records the fixture name, the source URL and the capture date:

```html
<!-- fixture: claude-composer | source: https://claude.ai/new | captured: 2026-09-28 | sanitized by scripts/fixtures/capture.js -->
```

## Capturing

Use a browser profile that is signed in where the page requires it. Nothing is sent: composers are filled with a placeholder so their send buttons render, then cleared.

1. Open the page listed for the fixture in `FIXTURES` in `capture.js`. For `youtube-watch`, the transcript panel is opened automatically. For `x-post`, scroll down once so the replies load. The Gemini, Kimi and Qwen fixtures open the model menu themselves, so that its options are captured
2. Paste the whole of `capture.js` into the DevTools console (or run it through the Claude in Chrome javascript tool)
3. Run `await captureFixture('<name>')`. It returns how many elements each keep region matched and the size; a keep region with no match throws
4. Copy the result: in DevTools, `copy(lastFixture)`. When the page is driven remotely, run `armFixtureCopy()` and click an empty spot of the page, then check that `lastFixtureCopy` is `'copied'` (the first click after a navigation is sometimes not delivered; click again)
5. Save it: `pbpaste > src/features/content/__fixtures__/<name>.html`

The signed-out composers need a private window, which the Claude in Chrome tools cannot reach, so they are captured in DevTools: `chatgpt-guest-composer`, and `grok-textarea-composer` (grok.com serves either a textarea or a Tiptap editor; while signed in it has only served Tiptap, so capture `grok-tiptap-composer` signed in and reload the private window until the textarea appears).

### From a saved snapshot

Signed out, X serves other markup (a bare `<article>` per post, without `data-testid`), and the Claude in Chrome profile is signed in to X. The `x-signed-out-post` and `x-signed-out-article` fixtures are therefore captured from a DOM snapshot: `capture-snapshot.ts` runs `capture.js` on it in jsdom and writes the fixture, dated by the snapshot's modification time. The canary saves such snapshots when a probe fails (`runs/<time>/x-post.html` and `x-article.html` under `~/Library/Application Support/ai-summarizer-canary/`, see `scripts/canary/README.md`); one saved from a private window's DevTools (`copy(document.documentElement.outerHTML)`) also works.

```sh
node --loader ts-node/esm scripts/fixtures/capture-snapshot.ts <snapshot.html> https://x.com/XDevelopers/status/2102535041532186709 x-signed-out-post
node --loader ts-node/esm scripts/fixtures/capture-snapshot.ts <snapshot.html> https://x.com/Safety/status/1801282137921871887 x-signed-out-article
```

These two fixtures keep the relative `/<handle>/status/<id>` links of the posts (`keepHref` in `capture.js`): the extractor tells the main post apart by the status id it links to. All other URLs are dropped as usual.

To add a fixture, add an entry to `FIXTURES` in `capture.js` and its name to `FixtureName` in `src/features/content/__fixtures__/index.ts`.

## Checking for leaks

`src/features/content/__tests__/Fixtures.test.ts` runs with `pnpm test` (and in CI) and fails on emails, UUIDs, JWTs, token-like strings, scripts, inline styles, URL attributes (other than relative X post links), unredacted X avatar handles, markup injected by browser extensions and texts longer than 200 characters.

Account names cannot be listed in the repository, so check them locally before committing a new or updated fixture:

```sh
FIXTURE_DENYLIST="display name,handle,email local part" pnpm test src/features/content/__tests__/Fixtures.test.ts
```

Also read the texts that remain, since only the keep regions carry any:

```sh
grep -oE '>[^<]+<' src/features/content/__fixtures__/<name>.html
```
