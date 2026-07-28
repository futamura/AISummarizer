# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Free AI Summarizer — a Chrome Extension (Manifest V3) that summarizes web articles, YouTube transcripts, and PDFs by opening an AI service (ChatGPT, Gemini, Google AI Studio, Claude, Grok, Perplexity, Deepseek) in a tab and injecting the extracted article text into its chat UI. No API keys, no backend — all data stays local.

## Commands

Package manager is pnpm (required; version pinned in `packageManager` field and `mise.toml`).

- `pnpm dev` — development build with watch; load `dist/dev` via chrome://extensions → "Load unpacked"
- `pnpm build` — production build to `dist/prod`
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
- `Content.tsx` — content script injected into all pages (floating panel UI, article extraction, injection)

Feature code lives in `src/features/<context>/` matching those contexts. Cross-context communication uses `chrome.runtime` messaging with the `MessageAction` enum and `Message` / `MessageResponse` types in `src/types/Message.ts`.

### Core data flow

1. Content script extracts the article via `src/features/content/extractors/` — `Readability.ts` (web pages), `Youtube.ts` (transcripts), `PDF.ts` (pdfjs-dist; the worker file is copied to `pdf.worker.min.mjs` by webpack)
2. `ArticleExtractionService` stores results in IndexedDB (`src/db/Database.ts`, `idb` wrapper, capped at 200 records, cleaned up by the service worker)
3. When the user picks an AI service, a tab opens for it and the matching injector in `src/features/content/injectors/` (one file per AI service) pastes the article plus summarize prompt into that service's chat UI

Adding a new AI service = new injector file there + entry in `src/types/AIService.ts` + icon assets in `src/styles/images/`.

### State & storage

- `src/stores/` — Zustand stores (settings, articles, theme), persisted via `@plasmohq/storage` (chrome.storage)
- `src/db/` — IndexedDB cache of extracted articles
- Path alias `@/*` → `src/*` (configured in webpack, tsconfig, and jest)
- `src/utils/Logger.ts` — consola-based logger; use it instead of `console.log`

## Project rules

From `.cursor/rules/global.mdc` (binding for this repo):

- Use pnpm for all package operations
- Source comments in English; use block comments (`/* */`) instead of line comments, even for single lines
- Do not change dependency/tool versions (see TECHNOLOGSTACK.md) without approval
- Do not change UI/UX design (layout, colors, fonts, spacing) without presenting reasons and getting approval
- Do not make changes beyond what was explicitly instructed; propose first, implement after approval
- Follow the layout in DIRECTORYSTRUCTURE.md when adding files

## Branches

`main` = production, `develop` = default working branch. Features: `feature/<name>`, fixes: `fix/<description>`.
