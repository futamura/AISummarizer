# On-demand Extraction Design

Date: 2026-09-27
Status: Awaiting review

## Purpose

Extract the page content only when the user asks for it (summarize with an AI service, or copy to clipboard), instead of on every page load.

Today the service worker extracts every page when `tabs.onUpdated` reports `status: 'complete'`, stores the result in IndexedDB, and the summarize action reuses that stored result. This breaks on pages that render their content after the load event:

- `https://jp.wsj.com/articles/iran-has-a-secret-weapon-in-its-war-with-america-help-from-china-6ca13c80` (2026-09-27): the server HTML holds only the dek and a print-only `div.print-header` (Dow Jones copyright notice); the article body is rendered by JS after an entitlement check. Readability 0.6.0 on the server HTML returns 391 characters starting with the copyright notice; on the rendered DOM it returns the 6,076-character article. The 391-character result is stored as `is_success: true`, so every later summarize reuses it.

Extracting at action time also stops storing every visited page, and removes the reason for the extraction denylist.

## Decisions

| Item | Decision | Reason |
|---|---|---|
| Extraction trigger | Only user actions: AI service and "Copy to clipboard" in the popup and the context menu | Content is complete by the time the user acts |
| Automatic extraction on page load | Removed, except for the mobile YouTube pending flow | See above |
| Repeated action on the same URL | Extract again every time; no cache reuse | Always current content; simple. Slower only for repeated YouTube summaries |
| Extraction timing setting (`contentExtractionTiming`) | Removed | Only one timing remains. The "By User Action" option was already ignored: `handleTabUpdated` passes `forcibly: true` since `cad26d2` |
| Extraction denylist (`extractionDenylist`) | Removed | Its purpose was to avoid needless automatic extraction; blocking an explicit user request is not wanted |
| Badge (`isShowBadge`) | Removed | No longer signals anything useful |
| Copy on extraction (`saveArticleOnClipboard`) | Removed | Extraction now only happens on an action; the explicit "Copy to clipboard" stays |
| Extraction toast setting (`isShowMessage`) | Removed; replaced by always-on progress and failure toasts | Failure is currently silent |
| "Extract article again" | Removed from the popup and the context menu | Every action extracts again |
| Stored values of removed settings | Left in `chrome.storage` untouched, no migration | Project policy: stored settings belong to the user and are not rewritten |

## Design

### Extraction flow

Triggers:

- Popup: AI service item, "Copy to clipboard"
- Context menu: AI service item, "Copy to clipboard"
- `handleTabUpdated`: only when a mobile YouTube pending entry exists for that tab and its URL matches the loaded URL

A new service worker method `extractAndStore(tabId, tabUrl): Promise<string | null>`:

1. Sends `EXTRACT_ARTICLE` to the content script of the tab
2. On success, saves the result with `db.addArticle` and returns the article id it resolves to (`addArticle` upserts by URL)
3. Returns `null` on failure. A rejected `sendMessage` (no content script, e.g. the page was open before the extension was updated) also counts as failure and is only logged, since no toast can be shown there

`openAIService(service, tabId, tabUrl)`:

1. Mobile YouTube: unchanged. Records the pending entry in `storage.session` and reloads the video in the desktop layout
2. Calls `extractAndStore`. Stops on `null`; the content script has already shown the failure toast
3. Builds the AI service URL from the returned id and opens it according to the tab behavior setting (current tab, new tab, private tab)

The lookup of the stored article by URL in `openAIService` is replaced by the returned id.

`readArticleForClipboard(tabId, tabUrl)`: calls `extractAndStore`; on success formats the stored article with the clipboard prompt and sends `WRITE_ARTICLE_TO_CLIPBOARD`.

Mobile YouTube: `handleTabUpdated` checks for a pending entry whose URL equals the loaded URL. If found, it removes the entry and calls `openAIService` for it, which now extracts on the desktop layout. This replaces `openPendingAIService`'s dependency on automatic extraction.

Unchanged: the extractors (Readability, YouTube, PDF, X), the injectors and `executeInjection` (reads the article by id), the 200-record cap and the 24-hour cleanup.

Accepted edge case: two actions on the same URL in quick succession share one article id, so the first AI tab may read the second extraction. Both come from the same page.

### Removals

Options page cards:

- Content Extraction (timing tabs and denylist textarea)
- Copy Article to Clipboard When Extraction Completes
- Show Message When Extraction Completes
- Show Badge When Extraction Completes

Settings: `contentExtractionTiming`, `extractionDenylist`, `saveArticleOnClipboard`, `isShowMessage`, `isShowBadge` — from `SettingsState`, `DEFAULT_SETTINGS`, the store getters and setters, `GlobalContext`, and the options page save and reset handlers.

Code:

- `src/types/ContentExtractionTiming.ts`
- `isExtractionDenylistUrl` and its call in `isInvalidUrl`. AI service URLs, browser-specific URLs and non-http URLs stay invalid
- `executeExtraction` and its automatic extraction decision
- The badge handling in `toggleUIState`
- `notifyCurrentTabState` and `MessageAction.TAB_UPDATED`
- The content script's `currentTabId` / `currentTabUrl` / `currentArticle` state and their pass-through in `ContentContext` (unused since the float button was removed)
- "Extract article again": the popup item, `MENU_ITEMS.EXTRACT`, and the `'extract'` branch of `handleContextMenuClicked`. Separators are adjusted to the remaining items
- The service worker's `EXTRACT_ARTICLE` message handler (only the removed popup item used it)

Context menu: "Copy to clipboard" is always shown on valid pages. `createMenu` drops its `isExtracted` parameter. The menu is still rebuilt on tab activation and load, because the basic and full menus depend on the URL.

### Toasts

Shown by the content script while handling `EXTRACT_ARTICLE`, since it knows when extraction starts and ends:

| Situation | Toast | Type |
|---|---|---|
| Extraction takes longer than 500 ms | `Extracting…`, kept until extraction ends | info |
| Extraction fails | `Couldn't extract the content of this page` | error |
| Extraction succeeds | None; the AI service tab opening is the feedback | — |
| Copy succeeds | `Article copied to clipboard` (unchanged) | success |

The delay avoids a flicker for Readability, which usually finishes well under 500 ms.

The extraction-with-progress logic is a small function that takes the extraction call, the toast functions and the delay as arguments, so it can be tested without React. It dismisses the progress toast in `finally`. `ArticleExtractionService.execute` already turns extractor exceptions into `isSuccess: false`.

Toaster changes (no visual change; shape, colors, position and animation stay):

- `toast.info(message, { persistent: true })` shows a toast that does not auto-dismiss and returns its id
- `toast.dismiss(id)` fades that toast out and removes it

### Documentation

- README: replace "Extract articles automatically from webpages" with on-demand wording
- CLAUDE.md: update "Core data flow" to the on-demand flow
- Chrome Web Store and AMO listing texts live outside the repo; updating them is a manual follow-up noted in the issue

## Testing

Unit tests (Jest, node environment, no new dependencies):

- `ServiceWorker.test.ts`
  - Loading an ordinary page does not send `EXTRACT_ARTICLE` (inverts the current test)
  - Summarizing extracts, stores, and opens the AI service URL with the returned id
  - Extraction failure does not open the AI service
  - A rejected `sendMessage` does not open the AI service and does not throw
  - Summarizing the same URL twice extracts twice, and the second result is the one stored (WSJ regression)
  - "Copy to clipboard" extracts and then sends `WRITE_ARTICLE_TO_CLIPBOARD`; nothing is sent on failure
  - The existing mobile YouTube tests (5) and private tab tests (2) are adapted to the new flow
- `ContextMenuService.test.ts`: "Copy to clipboard" is always present; "Extract article again" is absent
- `regex.test.ts`, `SettingsStore.test.ts`: tests for removed items are deleted
- New test for the extraction-with-progress function with fake timers: no progress toast under 500 ms; shown after 500 ms and dismissed at the end; error toast on failure; progress toast dismissed on exception

Toaster's persistent and dismiss behavior is checked manually.

Manual checks on the dev builds (the extraction trigger changes, so every route is checked):

- Chrome: the WSJ article above (about 6,000 characters injected), an ordinary article, YouTube (progress toast), PDF, an X post, copy to clipboard, the failure toast, the context menu
- Firefox desktop: summarize from the popup and the context menu, YouTube
- Firefox for Android: summarize from the popup, the mobile YouTube pending flow

`pnpm type-check`, `pnpm eslint-check`, `pnpm prettier-check` and `pnpm test` pass.

## Out of scope

- Injecting the content script into tabs that were open before the extension was installed or updated
- Changing the extractors themselves (for example, stripping print-only elements before Readability)
- Updating the store listing texts
