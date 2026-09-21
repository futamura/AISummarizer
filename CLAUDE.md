# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Free AI Summarizer — a browser extension (Manifest V3) that summarizes web articles, YouTube transcripts, and PDFs by opening an AI service (ChatGPT, Gemini, Google AI Studio, Claude, Grok, Perplexity, Deepseek, Kimi, Qwen) in a tab and injecting the extracted article text into its chat UI. No API keys, no backend — all data stays local. The same codebase builds the Chrome version (Chrome Web Store) and the Firefox version for both desktop and Android, distributed on addons.mozilla.org (AMO). PDF summarization is Chrome-only: Firefox opens PDFs in its built-in viewer, where content scripts cannot be injected.

## Commands

Package manager is pnpm (required; version pinned in `packageManager` field and `mise.toml`).

- `pnpm dev` — development build with watch; load `dist/dev` via chrome://extensions → "Load unpacked"
- `pnpm build` — production build to `dist/prod`
- `pnpm dev:firefox` / `pnpm build:firefox` — Firefox builds (`TARGET=firefox`) to `dist/firefox-dev` / `dist/firefox-prod`; load via `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" → `manifest.json`
- `pnpm test` — run all Jest tests
- `pnpm test src/utils/__tests__/Logger.test.ts` — run a single test file
- `pnpm test -- -t "name"` — run tests matching a name
- `pnpm type-check` — `tsc --noEmit`
- `pnpm eslint-check` / `pnpm eslint-fix`
- `pnpm prettier-check` / `pnpm prettier-fix`

Note: README mentions `pnpm lint` / `pnpm format`, but the actual script names are `eslint-check` / `prettier-fix` etc. as listed above.

Store release/publish uses Fastlane (`bundle exec fastlane`).

## Architecture

Five webpack entry points, all in `src/pages/`, one per extension context:

- `Popup.tsx` — toolbar popup (AI service list)
- `Options.tsx` — options page, also served as the side panel
- `ServiceWorker.ts` — MV3 background service worker (context menus, scheduled DB cleanup via alarms, theme relay)
- `Offscreen.ts` — offscreen document (detects OS color scheme, which a service worker cannot do)
- `Content.tsx` — content script injected into all pages (toast notifications, article extraction, injection)

Feature code lives in `src/features/<context>/` matching those contexts. Cross-context communication uses `chrome.runtime` messaging with the `MessageAction` enum and `Message` / `MessageResponse` types in `src/types/Message.ts`.

### Core data flow

1. Content script extracts the article via `src/features/content/extractors/` — `Readability.ts` (web pages), `Youtube.ts` (transcripts), `PDF.ts` (pdfjs-dist; the worker file is copied to `pdf.worker.min.mjs` by webpack), `X.ts` (single post pages of x.com/twitter.com, reading the post out of the DOM because Readability pulls in replies, trends and ads; falls back to Readability when the markup no longer matches)
2. `ArticleExtractionService` stores results in IndexedDB (`src/db/Database.ts`, `idb` wrapper, capped at 200 records, cleaned up by the service worker)
3. When the user picks an AI service, a tab opens for it and the matching injector in `src/features/content/injectors/` (one file per AI service) pastes the article plus summarize prompt into that service's chat UI

Adding a new AI service = new injector file there + entry in `src/types/AIService.ts` + icon assets in `src/styles/images/`.

### State & storage

- `src/stores/` — Zustand stores (settings, articles, theme), persisted via `@plasmohq/storage` (chrome.storage)
- `src/db/` — IndexedDB cache of extracted articles
- Path alias `@/*` → `src/*` (configured in webpack, tsconfig, and jest)
- `src/utils/Logger.ts` — consola-based logger; use it instead of `console.log`

### Browser targets

- `TARGET` (`chrome` by default, or `firefox`) selects the build; webpack injects it as the `__TARGET__` constant (jest sets it to `'chrome'`)
- `manifest.json` is the single source of truth; `build/manifest.ts` derives the dev and Firefox manifests at build time (Firefox: `background.scripts`, `sidebar_action`, gecko settings, shorter `name` and browser-neutral `description`)
- Browser-specific APIs live only in `src/platform/` (`openSettingsPanel` / `closeSettingsPanel` / `initThemeDetection`): Chrome uses `sidePanel` + the offscreen document, Firefox uses `sidebarAction` + `matchMedia` in the background page. Everything else uses `chrome.*`, which Firefox also provides
- Firefox's `sidebarAction.open()` must run synchronously inside a user gesture — call `openSettingsPanel()` before any `await` in click and context-menu handlers
- Firefox for Android is the same `TARGET=firefox` build; the difference is detected at runtime, not at build time, because several APIs are simply missing there: `sidebarAction` is undefined (`src/platform/firefox.ts` falls back to the options tab) and `contextMenus` is undefined (`ContextMenuService` skips menu creation). Guard any new API the same way instead of branching on `__TARGET__`

## Project rules

From `.cursor/rules/global.mdc` (binding for this repo):

- Use pnpm for all package operations
- Source comments in English; use block comments (`/* */`) instead of line comments, even for single lines
- Do not change dependency/tool versions (see TECHNOLOGSTACK.md) without approval
- Do not change UI/UX design (layout, colors, fonts, spacing) without presenting reasons and getting approval
- Do not make changes beyond what was explicitly instructed; propose first, implement after approval
- Follow the layout in DIRECTORYSTRUCTURE.md when adding files

## Repository workflow

### Branching

- Never commit directly to `main` or `develop`.
- For any change, create a working branch from `develop` and work there; merge back into `develop` when done.
- Branch names follow Conventional Commit types: `feat/<name>`, `fix/<name>`, `docs/<name>`, `refactor/<name>`, `chore/<name>`, etc.
- `main` is the production branch; it is only updated by merging `develop` as part of a release.

### Release

Two stages: local Fastlane, then CI triggered by the version tag.

1. `bundle exec fastlane release` (must run on `develop`; see `fastlane/Fastfile`):
   - Interactive version bump (patch / minor / major) — updates both `package.json` and `manifest.json`
   - Runs prettier / eslint / type-check / `pnpm audit --audit-level high`
   - Production build, then zips `dist/prod` into `free-ai-summarizer-<version>.zip`
   - Also builds and zips the Firefox version (`free-ai-summarizer-firefox-<version>.zip`) so Firefox-only build failures surface before tagging
   - Commits `feat: bump version to <version>`, tags `v<version>` (recreating the tag if it already exists), then pushes with tags
   - Merges `develop` into `main` and pushes
2. Pushing a `v*.*.*` tag triggers `.github/workflows/release.yml`:
   - Re-runs audit / prettier / eslint / type-check, builds, and creates a GitHub Release with the zip attached (auto-generated release notes)
   - Uploads to Chrome Web Store via `chrome-webstore-upload-cli` with `--auto-publish` (requires `CHROME_*` repository secrets)
   - The Store upload step is `continue-on-error` — a green workflow does not guarantee publication; check the "Upload to Chrome Web Store" step log
   - Then builds `dist/firefox-prod`, runs `web-ext lint`, and submits it to AMO (listed channel) with a source zip via `web-ext sign`. Skipped with a warning until the `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` secrets are set; all Firefox steps are `continue-on-error` and never block the Chrome release. AMO rejects re-uploading an existing version

The first AMO submission is manual; see README → "Releasing to Firefox Add-ons (AMO)".
