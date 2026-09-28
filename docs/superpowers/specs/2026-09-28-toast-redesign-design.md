# Toast Redesign and Progress Stages Design

Date: 2026-09-28
Status: Approved (2026-09-28)
Issue: FUT-150

## Purpose

Make the toasts noticeable, and show the progress of the automatic injection on the AI service page.

- The current toast is a small white pill (`py-2`, 20px icon, unset font size, about 36px tall) 16px from the top. On white pages it blends into the page, and it is easy to miss
- Its sizes are Tailwind `rem` values. Inside the shadow DOM, `rem` still follows the page's `html` font size, so pages with a small root font size shrink the toast further
- On the AI service page, the injection (model selection, pasting, sending) shows nothing. When it stops, the user cannot tell where or why

## Decisions

| Item | Decision | Reason |
|---|---|---|
| Toast library | None; rewrite the in-house `Toaster` | sonner (the de facto standard) inserts its CSS into `document.head` at import time: the styles do not reach our closed shadow root, and the content script would put a `<style>` into every page, where it can restyle the site's own sonner toasts. react-hot-toast was removed in `d4748a5` (2025-06) |
| Look | sonner `richColors`, one size larger: 15px text, 18px padding, 20px icon, 356px wide | Colored backgrounds stand out on white pages; the user picked it from mockups |
| Units | px only (Tailwind arbitrary values such as `text-[15px]`) | Independent of the page root font size and of the 12px Chromium injects into extension pages |
| Position | top-center, 24px from the top (sonner default) | User choice |
| Stacking | Newest on top; toasts in the same group replace the previous one, which fades out | Shows that the work moves through stages |
| Minimum stage display | 0.6 s per toast in a group before the next one enters | Without it, an injection that finishes in a few ms flickers and only "Article has been sent!" stays readable |
| Durations | loading: until replaced or dismissed; success / info / warning: 3 s; error: stays until closed with × | A missed failure leaves the user wondering why nothing was summarized |
| Extraction messages | Per kind: web page, YouTube, PDF, X post | Tells the user what was being extracted |
| Injection stages | "Selecting model…" (only when the injector selects a model), "Pasting article…", "Sending article…", then "Article has been sent!" | "Preparing" was vague; prompt building is instant and model selection never fails the injection |
| Service name in messages | Not shown | User choice |
| Message length | 15–29 characters: "Sending article…", "Article has been sent!", shorter extraction failures | The card is 356px wide at top-center, so a 4-character "Sent" next to a 43-character failure left a wide empty right side (seen on the production build, 2026-09-28) |
| Stage reporting | Injectors take an `onStage` callback | Explicit dependency, testable per injector |

## Design

### Toaster

Rewrite `src/features/content/components/main/Toaster.tsx`. It stays shared by the content script and the options page / side panel.

Look (light / dark follows the OS, as today with `darkMode: 'media'`):

- Card: width 356px, `max-width: calc(100vw - 32px)`, padding 18px, border radius 8px, 1px border, shadow `0 4px 12px rgba(0,0,0,.1)`, font 15px / weight 500 / line height 1.5, system font stack, gap 10px between icon and text
- Colors (sonner `richColors` values):

| Type | Light bg / border / text | Dark bg / border / text |
|---|---|---|
| success | hsl(143,85%,96%) / hsl(145,92%,87%) / hsl(140,100%,27%) | hsl(150,100%,6%) / hsl(147,100%,12%) / hsl(150,86%,65%) |
| info, loading | hsl(208,100%,97%) / hsl(221,91%,93%) / hsl(210,92%,45%) | hsl(215,100%,6%) / hsl(223,43%,17%) / hsl(216,87%,65%) |
| warning | hsl(49,100%,97%) / hsl(49,91%,84%) / hsl(31,92%,45%) | hsl(64,100%,6%) / hsl(60,100%,9%) / hsl(46,87%,65%) |
| error | hsl(359,100%,97%) / hsl(359,100%,94%) / hsl(360,100%,45%) | hsl(358,76%,10%) / hsl(357,89%,16%) / hsl(358,100%,81%) |

- Icons: 20px, in the text color. `loading` shows a spinner instead of an icon
- Error toasts get a 20px round × button on the top-left corner, as in sonner
- Motion: enter from `translateY(-100%)` with opacity 0 to rest in 400 ms; exit to opacity 0 with a slight downward shift and scale in 400 ms. The gap between stacked toasts is 14px
- Accessibility: the container has `aria-live="polite"`; error toasts have `role="alert"`

API:

```ts
type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading';
interface ToastOptions { group?: string }

toast.success(message, options?) / toast.error(...) / toast.info(...) / toast.warning(...) / toast.loading(...): string /* id */
toast.dismiss(id)
```

- `ToastOptions.persistent` is removed; `loading` replaces it
- `Toaster` takes no props: `duration` gives way to per-type durations, and `position` goes because both call sites use top-center

Behavior:

- Toasts without a group stack newest on top; at most 3 are visible, and the oldest leaves when a fourth arrives
- A toast with a group waits until the visible toast of that group has been shown for 0.6 s, then enters; the previous one exits at the same time. Several pending toasts in a group enter one after another, each shown at least 0.6 s
- `dismiss(id)` on a queued toast drops it; on a toast still entering, it exits once the enter animation is over (this fixes the toast that vanished without fading when dismissed during its fade-in); on a visible toast, it exits
- Timed toasts (success / info / warning) start their 3 s when they become visible

Structure:

- `src/features/content/services/ToastQueue.ts`: the queue, groups, durations and timers, without React. It exposes the list of toasts with their phase (`entering`, `visible`, `exiting`) and notifies subscribers on change
- `Toaster` subscribes to a module-level `ToastQueue` and renders; `toast.*` call into the same queue. The current `CustomEvent` transport goes away

### Extraction (the page being summarized or copied)

- New pure function `getExtractionKind(url): ExtractionKind` with `ExtractionKind = 'youtube' | 'pdf' | 'x' | 'webpage'`, moved out of the URL checks in `ArticleExtractionService`. `execute()` branches on it, so the two cannot drift
  - Mobile YouTube URLs are `'youtube'`. Summarize never extracts there (the service worker reloads the desktop layout first), but copy does
  - An X post that falls back to Readability stays `'x'`
- Messages:

| Kind | Progress | Failure |
|---|---|---|
| webpage | Extracting article… | Couldn't extract this article |
| youtube | Extracting transcript… | Couldn't get this transcript |
| pdf | Extracting PDF… | Couldn't read this PDF |
| x | Extracting post… | Couldn't extract this post |

- `ExtractionProgress` is unchanged: `useContentMessage` picks the messages by kind and passes closures that show them
- `useContentMessage` shows both with `group: 'extract'`, so a failure replaces a visible progress toast. A success dismisses the progress toast and shows nothing
- "Article copied to clipboard" is unchanged apart from the new look

### Injection (the AI service page)

- New types in `src/types/`: `InjectionStage = 'selectingModel' | 'pasting' | 'sending'`, `StageReporter = (stage: InjectionStage) => void`
- Every injector takes an options object `InjectOptions = { model?: string; onStage?: StageReporter }` (`onStage` defaults to a no-op) and reports:

| Injector | `selectingModel` | `pasting` | `sending` |
|---|---|---|---|
| Gemini, DeepSeek, Kimi, Qwen | At the start, when a model is given (the initial 2–3 s wait of DeepSeek, Kimi and Qwen falls in the first stage) | After model selection, or at the start when no model is given | Right after the text is inserted |
| ChatGPT, Claude, Grok, Perplexity | — | At the start | Right after the text is inserted |
| AI Studio | — (thinking level and URL context are not model selection) | At the start, covering those settings | Right after the text is inserted |

- `ArticleInjectionService.execute(serviceUrl, prompt, model, onStage)` passes it through
- New `src/features/content/services/InjectionProgress.ts`, pure like `ExtractionProgress`: `injectWithProgress(inject, toasts)`
  - Each reported stage shows a `loading` toast with `group: 'inject'`: "Selecting model…", "Pasting article…", "Sending article…"
  - Success shows "Article has been sent!" (success, same group)
  - Failure or exception shows an error in the same group, chosen by the last reported stage: `sending` → "Couldn't send the message"; anything else, including no stage yet → "Couldn't paste the article"
- `useContentMessage` runs prompt building (`createPrompt`) and the model lookup (`getModelFor`) inside `injectWithProgress`, so their failures show "Couldn't paste the article". The duplicate-delivery guard and the aismid mismatch check stay before it and show no toast, as today

## Testing

Unit tests (jest, `node` environment, fake timers):

- New `ToastQueue` tests: 0.6 s minimum within a group, several pending toasts in a group, durations (3 s timed, error and loading stay), dismiss while queued / entering / visible, at most 3 ungrouped
- New `InjectionProgress` tests: stage to message, failure message by last stage, exception as failure, success
- New `getExtractionKind` tests: the four kinds and mobile YouTube
- `ExtractionProgress` tests stay as they are
- Assert the order of `onStage` calls for all nine injectors (new jsdom tests for DeepSeek, Qwen and AI Studio)

Checks: `pnpm test`, `pnpm type-check`, `pnpm eslint-check`, `pnpm prettier-check`, `pnpm build`, `pnpm build:firefox`.

Manual checks (the rendering changes everywhere):

- Chrome dev build: "Extracting transcript…" on a YouTube summary; stages then "Article has been sent!" on ChatGPT (no model selection) and on Gemini or Kimi (model selection); failure toast with × on a video without a transcript; dark mode; options page export result
- Firefox desktop: one injection; options page
- Firefox for Android: one injection; the width on a narrow screen

Injection failures are hard to cause on the live services and are covered by the unit tests.

## Out of scope

- A "Copy prompt" action on the injection failure toast
- A success toast after extraction
- Changes to the clipboard toast wording
