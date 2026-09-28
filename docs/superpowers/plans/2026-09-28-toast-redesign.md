# Toast Redesign and Progress Stages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the small pill toast with a sonner-style toast that stacks per group, and show extraction and injection progress in stages.

**Architecture:** A React-free `ToastQueue` owns toasts, groups, timers and phases; `Toaster` renders its snapshot through `useSyncExternalStore`. Extraction picks its messages from a pure `getExtractionKind(url)`. Injectors report stages through an `onStage` callback, and a pure `injectWithProgress` turns the stages and the result into toasts.

**Tech Stack:** TypeScript, React 18, Tailwind CSS 3.4 (arbitrary values), react-icons (io5), Jest 29 with ts-jest (`node` environment by default, `jsdom` per file via docblock), pnpm.

**Spec:** `docs/superpowers/specs/2026-09-28-toast-redesign-design.md`

## Global Constraints

- Use pnpm; do not add, remove or change the version of any dependency
- Source comments in English, block comments (`/* */`) only, even for single lines
- Toast sizes in px only (Tailwind arbitrary values such as `text-[15px]`); no `rem` utilities in the toast
- Card: width 356px, `max-width: calc(100vw - 32px)`, padding 18px, radius 8px, 1px border, shadow `0 4px 12px rgba(0,0,0,.1)`, 15px / weight 500 / line height 1.5, icon 20px, gap 10px, 24px from the top, centered
- Timings: animation 400 ms, minimum group display 600 ms, timed toasts 3000 ms, at most 3 visible, 14px gap between stacked toasts
- loading and error toasts never time out; success, info and warning time out after 3000 ms
- Messages, verbatim:
  - Extraction: `Extracting article…` / `Couldn't extract the article from this page`; `Extracting transcript…` / `Couldn't get the transcript of this video`; `Extracting PDF…` / `Couldn't read this PDF`; `Extracting post…` / `Couldn't extract this post`
  - Injection: `Selecting model…`, `Pasting article…`, `Sending…`, `Sent`, `Couldn't paste the article`, `Couldn't send the message`
- Commit messages in English, Conventional Commits, no AI attribution or `Co-Authored-By`
- Stage only the files of the task (`git add <paths>`); never add `.superpowers/`

## Review Focus

- Extraction that ends just after its progress toast appeared: the dismiss arrives while the progress toast is still entering and the failure toast arrives in the same group; the progress toast must still fade out and the failure toast must still appear (ToastQueue test in Task 1)
- A group whose visible toast is closed with × while the next one is queued: the next one must enter without waiting out the rest of the 600 ms (Task 1)
- Many ungrouped toasts in a row, such as repeated clicks on Export in the options page: never more than 3 on screen (Task 1)
- An injector that reports the same stage twice, or throws after reporting `sending`: one toast per stage, and the failure says "Couldn't send the message" (Task 5)
- Kimi keeps "Sending…" on screen for about 6 s after the click while it clears the prompt residue; "Sent" appears only when `injectKimi` returns. This is expected; check it once in the manual check (Task 6)

## Spec amendments made by this plan

Task 2 updates the spec to match these decisions, taken while planning:

- `Toaster` takes no props: both `duration` and `position` go (both call sites use top-center)
- `ExtractionProgress` stays unchanged: `useContentMessage` picks the messages by kind and passes closures
- Injectors take an options object `{ model?, onStage? }` instead of positional `(prompt, model?)`, and report `sending` right after the text is inserted (before the pause and the wait for the send button)

## File structure

- Create `src/features/content/services/ToastQueue.ts`: queue, groups, phases, timers, `computeToastOffsets`
- Create `src/features/content/services/__tests__/ToastQueue.test.ts`
- Rewrite `src/features/content/components/main/Toaster.tsx`: rendering only, plus the `toast` API over a module-level `ToastQueue`
- Modify `tailwind.config.js`: `toast-enter` keyframes and animation
- Modify `src/features/content/components/main/ContentMain.tsx`, `src/features/options/components/main/OptionsMain.tsx`: drop the `Toaster` props
- Create `src/features/content/services/ExtractionKind.ts` (+ test): `getExtractionKind`, `EXTRACTION_MESSAGES`, `EXTRACTION_TOAST_GROUP`
- Modify `src/features/content/services/ArticleExtractionService.ts`: branch on `getExtractionKind`
- Create `src/types/Injection.ts`: `InjectionStage`, `StageReporter`, `InjectOptions`, `noopStageReporter`
- Modify the nine injectors in `src/features/content/injectors/` and their tests; create tests for DeepSeek, Qwen, AI Studio
- Create `src/features/content/services/InjectionProgress.ts` (+ test)
- Modify `src/features/content/services/ArticleInjectionService.ts`, `src/features/content/services/index.ts`, `src/features/content/hooks/useContentMessage.ts`

---

### Task 1: ToastQueue

**Files:**
- Create: `src/features/content/services/ToastQueue.ts`
- Test: `src/features/content/services/__tests__/ToastQueue.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading'`
  - `type ToastPhase = 'entering' | 'visible' | 'exiting'`
  - `interface ToastOptions { group?: string }`
  - `interface ToastItem { id: string; type: ToastType; message: string; group?: string; phase: ToastPhase }`
  - constants `TOAST_ANIMATION_MS = 400`, `MIN_GROUP_DISPLAY_MS = 600`, `TIMED_TOAST_MS = 3000`, `MAX_VISIBLE_TOASTS = 3`, `TOAST_GAP_PX = 14`
  - `class ToastQueue { getToasts(): ToastItem[]; subscribe(listener: () => void): () => void; show(type: ToastType, message: string, options?: ToastOptions): string; dismiss(id: string): void }` (`getToasts` and `subscribe` are arrow properties, safe to pass unbound)
  - `computeToastOffsets(toasts: ToastItem[], heights: Record<string, number>, previous: Record<string, number>): Record<string, number>`

- [ ] **Step 1: Write the failing test**

Create `src/features/content/services/__tests__/ToastQueue.test.ts`:

```ts
/* Import the module directly: the services barrel pulls in the extractors (pdfjs-dist, Readability) */
import {
  computeToastOffsets,
  MAX_VISIBLE_TOASTS,
  MIN_GROUP_DISPLAY_MS,
  TIMED_TOAST_MS,
  TOAST_ANIMATION_MS,
  TOAST_GAP_PX,
  ToastItem,
  ToastQueue,
} from '@/features/content/services/ToastQueue';

/* The toasts on screen as "message:phase", newest first */
const screen = (queue: ToastQueue) => queue.getToasts().map(item => `${item.message}:${item.phase}`);

describe('ToastQueue', () => {
  let queue: ToastQueue;

  beforeEach(() => {
    jest.useFakeTimers();
    queue = new ToastQueue();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('enters a toast and settles it after the animation', () => {
    queue.show('info', 'Hello');
    expect(screen(queue)).toEqual(['Hello:entering']);

    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(screen(queue)).toEqual(['Hello:visible']);
  });

  it('times out a success toast 3 s after it became visible, then removes it', () => {
    queue.show('success', 'Done');

    jest.advanceTimersByTime(TOAST_ANIMATION_MS + TIMED_TOAST_MS - 1);
    expect(screen(queue)).toEqual(['Done:visible']);

    jest.advanceTimersByTime(1);
    expect(screen(queue)).toEqual(['Done:exiting']);

    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(screen(queue)).toEqual([]);
  });

  it.each(['info', 'warning'] as const)('times out a %s toast', type => {
    queue.show(type, 'Note');
    jest.advanceTimersByTime(TOAST_ANIMATION_MS + TIMED_TOAST_MS + TOAST_ANIMATION_MS);
    expect(screen(queue)).toEqual([]);
  });

  it.each(['error', 'loading'] as const)('keeps a %s toast until it is dismissed', type => {
    const id = queue.show(type, 'Stay');

    jest.advanceTimersByTime(60000);
    expect(screen(queue)).toEqual(['Stay:visible']);

    queue.dismiss(id);
    expect(screen(queue)).toEqual(['Stay:exiting']);
    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(screen(queue)).toEqual([]);
  });

  it('stacks toasts without a group, newest first', () => {
    queue.show('error', 'First');
    queue.show('error', 'Second');
    expect(screen(queue)).toEqual(['Second:entering', 'First:entering']);
  });

  it('keeps at most three toasts without a group on screen', () => {
    queue.show('error', 'One');
    queue.show('error', 'Two');
    queue.show('error', 'Three');
    jest.advanceTimersByTime(TOAST_ANIMATION_MS);

    queue.show('error', 'Four');
    expect(screen(queue)).toEqual(['Four:entering', 'Three:visible', 'Two:visible', 'One:exiting']);

    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(screen(queue)).toEqual(['Four:visible', 'Three:visible', 'Two:visible']);
    expect(MAX_VISIBLE_TOASTS).toBe(3);
  });

  it('holds the next toast of a group until the current one has been shown for 600 ms', () => {
    queue.show('loading', 'Pasting', { group: 'inject' });
    queue.show('loading', 'Sending', { group: 'inject' });
    expect(screen(queue)).toEqual(['Pasting:entering']);

    jest.advanceTimersByTime(MIN_GROUP_DISPLAY_MS - 1);
    expect(screen(queue)).toEqual(['Pasting:visible']);

    jest.advanceTimersByTime(1);
    expect(screen(queue)).toEqual(['Sending:entering', 'Pasting:exiting']);

    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(screen(queue)).toEqual(['Sending:visible']);
  });

  it('plays several queued toasts of a group one after another', () => {
    queue.show('loading', 'Selecting', { group: 'inject' });
    queue.show('loading', 'Pasting', { group: 'inject' });
    queue.show('loading', 'Sending', { group: 'inject' });
    queue.show('success', 'Sent', { group: 'inject' });

    const front = () => screen(queue)[0];
    expect(front()).toBe('Selecting:entering');
    jest.advanceTimersByTime(MIN_GROUP_DISPLAY_MS);
    expect(front()).toBe('Pasting:entering');
    jest.advanceTimersByTime(MIN_GROUP_DISPLAY_MS);
    expect(front()).toBe('Sending:entering');
    jest.advanceTimersByTime(MIN_GROUP_DISPLAY_MS);
    expect(front()).toBe('Sent:entering');
  });

  it('enters a group toast at once when the current one has been shown long enough', () => {
    queue.show('loading', 'Pasting', { group: 'inject' });
    jest.advanceTimersByTime(1000);

    queue.show('loading', 'Sending', { group: 'inject' });
    expect(screen(queue)).toEqual(['Sending:entering', 'Pasting:exiting']);
  });

  it('keeps groups independent of each other and of ungrouped toasts', () => {
    queue.show('loading', 'Extracting', { group: 'extract' });
    queue.show('loading', 'Pasting', { group: 'inject' });
    queue.show('success', 'Copied');
    expect(screen(queue)).toEqual(['Copied:entering', 'Pasting:entering', 'Extracting:entering']);
  });

  it('drops a queued toast that is dismissed before it enters', () => {
    queue.show('loading', 'Pasting', { group: 'inject' });
    const queued = queue.show('loading', 'Sending', { group: 'inject' });

    queue.dismiss(queued);
    jest.advanceTimersByTime(5000);
    expect(screen(queue)).toEqual(['Pasting:visible']);
  });

  it('lets a toast dismissed while entering finish its enter animation before it exits', () => {
    const id = queue.show('loading', 'Extracting');
    jest.advanceTimersByTime(100);

    queue.dismiss(id);
    expect(screen(queue)).toEqual(['Extracting:entering']);

    jest.advanceTimersByTime(TOAST_ANIMATION_MS - 100);
    expect(screen(queue)).toEqual(['Extracting:exiting']);
  });

  it('still shows the failure when the progress toast is dismissed during its fade-in', () => {
    const progress = queue.show('loading', 'Extracting', { group: 'extract' });
    jest.advanceTimersByTime(10);
    queue.dismiss(progress);
    queue.show('error', 'Failed', { group: 'extract' });

    jest.advanceTimersByTime(MIN_GROUP_DISPLAY_MS + TOAST_ANIMATION_MS * 2);
    expect(screen(queue)).toEqual(['Failed:visible']);
  });

  it('enters the next toast of a group at once when the current one is closed', () => {
    const current = queue.show('error', 'Failed', { group: 'inject' });
    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    queue.show('loading', 'Pasting', { group: 'inject' });

    queue.dismiss(current);
    jest.advanceTimersByTime(0);
    expect(screen(queue)).toEqual(['Pasting:entering', 'Failed:exiting']);
  });

  it('notifies subscribers until they unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = queue.subscribe(listener);

    queue.show('info', 'Hello');
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    unsubscribe();
    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns the same snapshot until something changes', () => {
    queue.show('info', 'Hello');
    const snapshot = queue.getToasts();
    expect(queue.getToasts()).toBe(snapshot);

    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(queue.getToasts()).not.toBe(snapshot);
  });
});

describe('computeToastOffsets', () => {
  const item = (id: string, phase: ToastItem['phase']): ToastItem => ({ id, type: 'info', message: id, phase });

  it('stacks the toasts by their heights plus the gap', () => {
    const offsets = computeToastOffsets([item('c', 'visible'), item('b', 'visible'), item('a', 'visible')], { a: 50, b: 60, c: 70 }, {});
    expect(offsets).toEqual({ c: 0, b: 70 + TOAST_GAP_PX, a: 70 + 60 + TOAST_GAP_PX * 2 });
  });

  it('leaves an exiting toast where it was and closes the gap behind it', () => {
    const offsets = computeToastOffsets([item('c', 'entering'), item('b', 'exiting'), item('a', 'visible')], { a: 50, b: 60, c: 70 }, { b: 0 });
    expect(offsets).toEqual({ c: 0, b: 0, a: 70 + TOAST_GAP_PX });
  });

  it('treats a toast not measured yet as zero high', () => {
    expect(computeToastOffsets([item('b', 'entering'), item('a', 'visible')], { a: 50 }, {})).toEqual({ b: 0, a: TOAST_GAP_PX });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/features/content/services/__tests__/ToastQueue.test.ts`
Expected: FAIL with "Cannot find module '@/features/content/services/ToastQueue'"

- [ ] **Step 3: Write the implementation**

Create `src/features/content/services/ToastQueue.ts`:

```ts
export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading';

/* entering: the enter animation runs; visible: at rest; exiting: the exit animation runs, then the toast is removed */
export type ToastPhase = 'entering' | 'visible' | 'exiting';

export interface ToastOptions {
  /* Toasts of one group replace each other, and each stays at least MIN_GROUP_DISPLAY_MS */
  group?: string;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  group?: string;
  phase: ToastPhase;
}

export const TOAST_ANIMATION_MS = 400;
/* Long enough to read a stage even when the work behind it finishes at once */
export const MIN_GROUP_DISPLAY_MS = 600;
export const TIMED_TOAST_MS = 3000;
export const MAX_VISIBLE_TOASTS = 3;
export const TOAST_GAP_PX = 14;

/* loading waits for the next stage and error for the user, so neither times out */
const TIMED_TYPES: ReadonlySet<ToastType> = new Set<ToastType>(['success', 'info', 'warning']);

/**
 * The toasts on screen and the ones waiting for their group, without React,
 * so that the timing can be tested with fake timers
 */
export class ToastQueue {
  /* Newest first; replaced on every change so that it can serve as a useSyncExternalStore snapshot */
  private toasts: ToastItem[] = [];
  private readonly pending = new Map<string, ToastItem[]>();
  private readonly groupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly enteredAt = new Map<string, number>();
  private readonly exitAfterEnter = new Set<string>();
  private readonly listeners = new Set<() => void>();
  /* A counter rather than crypto.randomUUID(), which is missing on non-secure (http) pages */
  private lastId = 0;

  getToasts = (): ToastItem[] => this.toasts;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Show a toast, or queue it behind the current toast of its group
   * @param type - The kind of toast
   * @param message - The text to show
   * @param options - The group to show it in
   * @returns The id to pass to dismiss()
   */
  show(type: ToastType, message: string, options: ToastOptions = {}): string {
    const item: ToastItem = { id: String(++this.lastId), type, message, group: options.group, phase: 'entering' };
    if (item.group === undefined) {
      this.enter(item);
      return item.id;
    }

    const queue = this.pending.get(item.group) ?? [];
    if (queue.length === 0 && this.remainingGroupWait(item.group) === 0) {
      this.enter(item);
      return item.id;
    }
    queue.push(item);
    this.pending.set(item.group, queue);
    this.scheduleGroup(item.group);
    return item.id;
  }

  /**
   * Remove a toast: a queued one is dropped, one on screen fades out
   * @param id - The id show() returned
   */
  dismiss(id: string): void {
    for (const [group, queue] of this.pending) {
      const index = queue.findIndex(item => item.id === id);
      if (index < 0) continue;
      queue.splice(index, 1);
      if (queue.length === 0) this.pending.delete(group);
      return;
    }

    const item = this.toasts.find(toast => toast.id === id);
    this.exit(id);
    /* The next toast of the group need not wait out the rest of the minimum display */
    if (item?.group !== undefined && this.pending.has(item.group) && !this.exitAfterEnter.has(id)) {
      this.rescheduleGroup(item.group);
    }
  }

  /* How long the current toast of a group still has to stay before the next one may enter */
  private remainingGroupWait(group: string): number {
    const current = this.toasts.find(item => item.group === group && item.phase !== 'exiting');
    if (!current) return 0;
    return Math.max(0, MIN_GROUP_DISPLAY_MS - (Date.now() - (this.enteredAt.get(current.id) ?? 0)));
  }

  private scheduleGroup(group: string): void {
    if (this.groupTimers.has(group)) return;
    const timer = setTimeout(() => {
      this.groupTimers.delete(group);
      const queue = this.pending.get(group);
      const next = queue?.shift();
      if (queue && queue.length === 0) this.pending.delete(group);
      if (next) this.enter(next);
      if (this.pending.has(group)) this.scheduleGroup(group);
    }, this.remainingGroupWait(group));
    this.groupTimers.set(group, timer);
  }

  private rescheduleGroup(group: string): void {
    const timer = this.groupTimers.get(group);
    if (timer !== undefined) clearTimeout(timer);
    this.groupTimers.delete(group);
    this.scheduleGroup(group);
  }

  private enter(item: ToastItem): void {
    if (item.group !== undefined) {
      const previous = this.toasts.find(toast => toast.group === item.group && toast.phase !== 'exiting');
      if (previous) this.exit(previous.id);
    }

    this.toasts = [item, ...this.toasts];
    this.enteredAt.set(item.id, Date.now());
    this.toasts
      .filter(toast => toast.phase !== 'exiting')
      .slice(MAX_VISIBLE_TOASTS)
      .forEach(toast => this.exit(toast.id));
    this.emit();

    setTimeout(() => this.settle(item.id), TOAST_ANIMATION_MS);
  }

  /* End of the enter animation: run a dismiss that came in meanwhile, or start the timeout */
  private settle(id: string): void {
    const item = this.toasts.find(toast => toast.id === id);
    if (!item || item.phase !== 'entering') return;
    this.setPhase(id, 'visible');

    if (this.exitAfterEnter.delete(id)) {
      this.exit(id);
      if (item.group !== undefined && this.pending.has(item.group)) this.rescheduleGroup(item.group);
      return;
    }
    if (TIMED_TYPES.has(item.type)) setTimeout(() => this.exit(id), TIMED_TOAST_MS);
  }

  private exit(id: string): void {
    const item = this.toasts.find(toast => toast.id === id);
    if (!item || item.phase === 'exiting') return;
    /* Cutting the enter animation short made the toast vanish without fading */
    if (item.phase === 'entering') {
      this.exitAfterEnter.add(id);
      return;
    }

    this.setPhase(id, 'exiting');
    setTimeout(() => {
      this.toasts = this.toasts.filter(toast => toast.id !== id);
      this.enteredAt.delete(id);
      this.emit();
    }, TOAST_ANIMATION_MS);
  }

  private setPhase(id: string, phase: ToastPhase): void {
    this.toasts = this.toasts.map(toast => (toast.id === id ? { ...toast, phase } : toast));
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach(listener => listener());
  }
}

/**
 * Where each toast sits below the top of the stack
 * @param toasts - The toasts on screen, newest first
 * @param heights - The measured height of each toast
 * @param previous - The offsets of the last render, which exiting toasts keep
 * @returns The offset in px of each toast
 */
export function computeToastOffsets(toasts: ToastItem[], heights: Record<string, number>, previous: Record<string, number>): Record<string, number> {
  const offsets: Record<string, number> = {};
  let offset = 0;
  for (const item of toasts) {
    if (item.phase === 'exiting') {
      offsets[item.id] = previous[item.id] ?? offset;
      continue;
    }
    offsets[item.id] = offset;
    offset += (heights[item.id] ?? 0) + TOAST_GAP_PX;
  }
  return offsets;
}
```

Note on "still shows the failure when the progress toast is dismissed during its fade-in": the progress toast is entering when dismissed, so `exitAfterEnter` holds it; the failure is queued because the group's current toast is not exiting. At settle, the progress toast exits and the group is rescheduled, so the failure enters right away.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/features/content/services/__tests__/ToastQueue.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/content/services/ToastQueue.ts src/features/content/services/__tests__/ToastQueue.test.ts
git commit -m "feat: add a toast queue with groups and a minimum display per stage"
```

---

### Task 2: Toaster rendering

**Files:**
- Modify (rewrite): `src/features/content/components/main/Toaster.tsx`
- Modify: `tailwind.config.js`
- Modify: `src/features/content/components/main/ContentMain.tsx`
- Modify: `src/features/options/components/main/OptionsMain.tsx:229`
- Modify: `src/features/content/hooks/useContentMessage.ts:63` (the `persistent` option goes away)
- Modify: `docs/superpowers/specs/2026-09-28-toast-redesign-design.md` (the amendments listed at the top of this plan)

**Interfaces:**
- Consumes: `ToastQueue`, `ToastItem`, `ToastOptions`, `ToastType`, `computeToastOffsets` (Task 1)
- Produces: `Toaster: React.FC` (no props); `toast.success / error / info / warning / loading(message: string, options?: ToastOptions): string`; `toast.dismiss(id: string): void`; re-exports `type ToastOptions`, `type ToastType`

There is no React test setup (`node` environment, no testing-library), so this task is checked by type-check, lint and build here and by the manual check in Task 6.

- [ ] **Step 1: Add the enter animation to Tailwind**

In `tailwind.config.js`, inside `theme.extend` next to `fontSize`, add:

```js
      keyframes: {
        'toast-enter': {
          from: { opacity: '0', transform: 'translateY(-100%)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'toast-enter': 'toast-enter 400ms ease',
      },
```

A keyframe animation rather than a class flipped after the first frame: `requestAnimationFrame` does not run in background tabs, where the AI service tab often opens.

- [ ] **Step 2: Rewrite `Toaster.tsx`**

Replace the whole file with:

```tsx
import clsx from 'clsx';

import React, { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import { IoCheckmarkCircle, IoClose, IoCloseCircle, IoInformationCircle, IoWarning } from 'react-icons/io5';

import { computeToastOffsets, ToastItem, ToastOptions, ToastQueue, ToastType } from '@/features/content/services/ToastQueue';

export type { ToastOptions, ToastType };

/* One queue per extension context: the content script of a page, or the options page */
const toastQueue = new ToastQueue();

export const toast = {
  success: (message: string, options?: ToastOptions) => toastQueue.show('success', message, options),
  error: (message: string, options?: ToastOptions) => toastQueue.show('error', message, options),
  info: (message: string, options?: ToastOptions) => toastQueue.show('info', message, options),
  warning: (message: string, options?: ToastOptions) => toastQueue.show('warning', message, options),
  loading: (message: string, options?: ToastOptions) => toastQueue.show('loading', message, options),
  dismiss: (id: string) => toastQueue.dismiss(id),
};

/* sonner richColors; sizes in px so that neither the page root font size nor the 12px Chromium injects into extension pages scales them */
const TYPE_CLASSES: Record<ToastType, string> = {
  success:
    'bg-[hsl(143,85%,96%)] border-[hsl(145,92%,87%)] text-[hsl(140,100%,27%)] dark:bg-[hsl(150,100%,6%)] dark:border-[hsl(147,100%,12%)] dark:text-[hsl(150,86%,65%)]',
  info: 'bg-[hsl(208,100%,97%)] border-[hsl(221,91%,93%)] text-[hsl(210,92%,45%)] dark:bg-[hsl(215,100%,6%)] dark:border-[hsl(223,43%,17%)] dark:text-[hsl(216,87%,65%)]',
  loading:
    'bg-[hsl(208,100%,97%)] border-[hsl(221,91%,93%)] text-[hsl(210,92%,45%)] dark:bg-[hsl(215,100%,6%)] dark:border-[hsl(223,43%,17%)] dark:text-[hsl(216,87%,65%)]',
  warning:
    'bg-[hsl(49,100%,97%)] border-[hsl(49,91%,84%)] text-[hsl(31,92%,45%)] dark:bg-[hsl(64,100%,6%)] dark:border-[hsl(60,100%,9%)] dark:text-[hsl(46,87%,65%)]',
  error:
    'bg-[hsl(359,100%,97%)] border-[hsl(359,100%,94%)] text-[hsl(360,100%,45%)] dark:bg-[hsl(358,76%,10%)] dark:border-[hsl(357,89%,16%)] dark:text-[hsl(358,100%,81%)]',
};

const ToastIcon: React.FC<{ type: ToastType }> = ({ type }) => {
  switch (type) {
    case 'success':
      return <IoCheckmarkCircle className="w-[20px] h-[20px]" />;
    case 'error':
      return <IoCloseCircle className="w-[20px] h-[20px]" />;
    case 'info':
      return <IoInformationCircle className="w-[20px] h-[20px]" />;
    case 'warning':
      return <IoWarning className="w-[20px] h-[20px]" />;
    case 'loading':
      return <span className="block w-[16px] h-[16px] rounded-full border-[2px] border-solid border-current border-r-transparent opacity-60 animate-spin" />;
  }
};

interface ToastCardProps {
  item: ToastItem;
  offset: number;
  onMeasure: (id: string, height: number) => void;
}

const ToastCard: React.FC<ToastCardProps> = ({ item, offset, onMeasure }) => {
  const ref = useRef<HTMLDivElement>(null);

  /* The text never changes, so one measurement before the first paint is enough */
  useLayoutEffect(() => {
    if (ref.current) onMeasure(item.id, ref.current.offsetHeight);
  }, [item.id, onMeasure]);

  return (
    <div
      className="absolute inset-x-0 top-0 transition-transform duration-[400ms] ease-out motion-reduce:transition-none"
      style={{ transform: `translateY(${offset}px)` }}
    >
      <div
        ref={ref}
        role={item.type === 'error' ? 'alert' : 'status'}
        className={clsx(
          'relative flex items-center gap-[10px] box-border w-full p-[18px] rounded-[8px] border border-solid',
          'shadow-[0_4px_12px_rgba(0,0,0,0.1)] text-[15px] font-medium leading-[1.5] font-[system-ui,-apple-system,sans-serif] break-words',
          'pointer-events-auto transition-[opacity,transform] duration-[400ms] motion-reduce:transition-none motion-reduce:animate-none',
          TYPE_CLASSES[item.type],
          item.phase === 'exiting' ? 'opacity-0 translate-y-[14px] scale-[0.96]' : 'opacity-100 animate-toast-enter'
        )}
      >
        {item.type === 'error' && (
          <button
            type="button"
            aria-label="Close"
            onClick={() => toast.dismiss(item.id)}
            className={clsx(
              'absolute -left-[7px] -top-[7px] flex items-center justify-center w-[20px] h-[20px] p-0 rounded-full border border-solid cursor-pointer',
              TYPE_CLASSES[item.type]
            )}
          >
            <IoClose className="w-[12px] h-[12px]" />
          </button>
        )}
        <span className="flex items-center justify-center shrink-0 w-[20px] h-[20px]">
          <ToastIcon type={item.type} />
        </span>
        <span>{item.message}</span>
      </div>
    </div>
  );
};

export const Toaster: React.FC = () => {
  const toasts = useSyncExternalStore(toastQueue.subscribe, toastQueue.getToasts);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const previousOffsets = useRef<Record<string, number>>({});

  const handleMeasure = useCallback((id: string, height: number) => {
    setHeights(prev => (prev[id] === height ? prev : { ...prev, [id]: height }));
  }, []);

  const offsets = computeToastOffsets(toasts, heights, previousOffsets.current);
  previousOffsets.current = offsets;

  return (
    <div
      aria-live="polite"
      className="fixed top-[24px] left-1/2 -translate-x-1/2 w-[356px] max-w-[calc(100vw-32px)] z-[777777777777] pointer-events-none"
    >
      {toasts.map(item => (
        <ToastCard key={item.id} item={item} offset={offsets[item.id] ?? 0} onMeasure={handleMeasure} />
      ))}
    </div>
  );
};
```

- [ ] **Step 3: Drop the props at the call sites**

`src/features/content/components/main/ContentMain.tsx`: replace `return <Toaster position="top-center" duration={2000} />;` with:

```tsx
  return <Toaster />;
```

`src/features/options/components/main/OptionsMain.tsx`: replace `<Toaster position="top-center" duration={3000} />` with:

```tsx
      <Toaster />
```

`src/features/content/hooks/useContentMessage.ts`: replace the `showProgress` line with:

```ts
            showProgress: () => toast.loading('Extracting…'),
```

(Task 3 replaces this line again with the per-kind message.)

- [ ] **Step 4: Update the spec**

In `docs/superpowers/specs/2026-09-28-toast-redesign-design.md`:

- Set the status line to `Status: Approved (2026-09-28)`
- In "Design → Toaster → API", replace the bullet "The `duration` prop of `Toaster` is removed; durations are per type. `position` stays" with "`Toaster` takes no props: `duration` gives way to per-type durations, and `position` goes because both call sites use top-center"
- In "Design → Extraction", replace the `ExtractionProgress` bullet with "`ExtractionProgress` is unchanged: `useContentMessage` picks the messages by kind and passes closures that show them"
- In "Design → Injection", replace "Every injector takes an optional `onStage: StageReporter` (default: no-op) and reports:" with "Every injector takes an options object `InjectOptions = { model?: string; onStage?: StageReporter }` (`onStage` defaults to a no-op) and reports:"
- In the injector stage table right below it, replace every "Before waiting for the send button" with "Right after the text is inserted"
- In "Testing", replace "Update `ExtractionProgress` tests for the kind argument" with "`ExtractionProgress` tests stay as they are", and replace "Extend the six existing injector tests to assert the order of `onStage` calls" with "Assert the order of `onStage` calls for all nine injectors (new jsdom tests for DeepSeek, Qwen and AI Studio)"

- [ ] **Step 5: Type-check, lint and build**

Run: `pnpm type-check`
Expected: no errors

Run: `pnpm eslint-check`
Expected: no errors

Run: `pnpm prettier-fix`
Then: `pnpm prettier-check`
Expected: all files pass

Run: `pnpm build`
Expected: webpack finishes without errors. Then confirm the arbitrary classes were generated:

Run: `grep -c "hsl(143,85%,96%)" dist/prod/globals.css`
Expected: `1` or more (if the CSS file has another name, `grep -rl "toast-enter" dist/prod` finds it)

Run: `pnpm test`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/features/content/components/main/Toaster.tsx tailwind.config.js src/features/content/components/main/ContentMain.tsx src/features/options/components/main/OptionsMain.tsx src/features/content/hooks/useContentMessage.ts docs/superpowers/specs/2026-09-28-toast-redesign-design.md
git commit -m "feat: redesign the toast after sonner and stack it per group"
```

---

### Task 3: Extraction messages per kind

**Files:**
- Create: `src/features/content/services/ExtractionKind.ts`
- Test: `src/features/content/services/__tests__/ExtractionKind.test.ts`
- Modify: `src/features/content/services/ArticleExtractionService.ts`
- Modify: `src/features/content/services/index.ts`
- Modify: `src/features/content/hooks/useContentMessage.ts` (EXTRACT_ARTICLE case)

**Interfaces:**
- Consumes: `toast.loading`, `toast.error`, `toast.dismiss` (Task 2); `isXStatusUrl` from `@/features/content/extractors/X`; `getDesktopYoutubeUrl` from `@/utils`
- Produces:
  - `type ExtractionKind = 'youtube' | 'pdf' | 'x' | 'webpage'`
  - `getExtractionKind(url: string): ExtractionKind`
  - `EXTRACTION_MESSAGES: Record<ExtractionKind, { progress: string; failure: string }>`
  - `EXTRACTION_TOAST_GROUP = 'extract'`

- [ ] **Step 1: Write the failing test**

Create `src/features/content/services/__tests__/ExtractionKind.test.ts`:

```ts
/* Import the module directly: the services barrel pulls in the extractors (pdfjs-dist, Readability) */
import { EXTRACTION_MESSAGES, getExtractionKind } from '@/features/content/services/ExtractionKind';

describe('getExtractionKind', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'youtube'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
    /* Copy reaches the mobile layout; summarize reloads the desktop layout first */
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://example.com/paper.pdf', 'pdf'],
    ['https://x.com/jack/status/20', 'x'],
    ['https://twitter.com/jack/status/20', 'x'],
    ['https://x.com/jack', 'webpage'],
    ['https://en.wikipedia.org/wiki/Newline', 'webpage'],
  ])('%s is %s', (url, kind) => {
    expect(getExtractionKind(url)).toBe(kind);
  });
});

describe('EXTRACTION_MESSAGES', () => {
  it('has the agreed wording', () => {
    expect(EXTRACTION_MESSAGES).toEqual({
      webpage: { progress: 'Extracting article…', failure: "Couldn't extract the article from this page" },
      youtube: { progress: 'Extracting transcript…', failure: "Couldn't get the transcript of this video" },
      pdf: { progress: 'Extracting PDF…', failure: "Couldn't read this PDF" },
      x: { progress: 'Extracting post…', failure: "Couldn't extract this post" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/features/content/services/__tests__/ExtractionKind.test.ts`
Expected: FAIL with "Cannot find module '@/features/content/services/ExtractionKind'"

- [ ] **Step 3: Write `ExtractionKind.ts`**

```ts
import { isXStatusUrl } from '@/features/content/extractors/X';
import { getDesktopYoutubeUrl } from '@/utils';

export type ExtractionKind = 'youtube' | 'pdf' | 'x' | 'webpage';

const YOUTUBE_VIDEO_PATTERN = /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11})/;

/**
 * Which extractor a URL goes to
 * @param url - The page URL
 * @returns The kind of content; a mobile YouTube URL counts as YouTube
 */
export const getExtractionKind = (url: string): ExtractionKind => {
  if (getDesktopYoutubeUrl(url) || YOUTUBE_VIDEO_PATTERN.test(url)) return 'youtube';
  if (url.endsWith('.pdf')) return 'pdf';
  if (isXStatusUrl(url)) return 'x';
  return 'webpage';
};

export const EXTRACTION_MESSAGES: Record<ExtractionKind, { progress: string; failure: string }> = {
  webpage: { progress: 'Extracting article…', failure: "Couldn't extract the article from this page" },
  youtube: { progress: 'Extracting transcript…', failure: "Couldn't get the transcript of this video" },
  pdf: { progress: 'Extracting PDF…', failure: "Couldn't read this PDF" },
  x: { progress: 'Extracting post…', failure: "Couldn't extract this post" },
};

/* The failure toast replaces the progress toast */
export const EXTRACTION_TOAST_GROUP = 'extract';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/features/content/services/__tests__/ExtractionKind.test.ts`
Expected: PASS

- [ ] **Step 5: Branch `ArticleExtractionService` on the kind**

In `src/features/content/services/ArticleExtractionService.ts`:

Add to the imports:

```ts
import { getExtractionKind } from '@/features/content/services/ExtractionKind';
```

Right after the mobile YouTube block (the one returning "The mobile YouTube layout has no transcript"), add:

```ts
    const kind = getExtractionKind(url);
```

Replace the three conditions:

- `if (/^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11})/.test(url)) {` → `if (kind === 'youtube') {`
- `if (url.endsWith('.pdf')) {` → `if (kind === 'pdf') {`
- `if (isXStatusUrl(url)) {` → `if (kind === 'x') {`

Remove `isXStatusUrl` from the extractors import (it becomes unused):

```ts
import { extractPDF, extractReadability, extractX, extractYoutube } from '@/features/content/extractors';
```

In `src/features/content/services/index.ts`, add:

```ts
export * from './ExtractionKind';
```

- [ ] **Step 6: Show the messages in `useContentMessage`**

Change the services import to:

```ts
import { ArticleExtractionService, ArticleInjectionService, EXTRACTION_MESSAGES, EXTRACTION_TOAST_GROUP, extractWithProgress, getExtractionKind } from '@/features/content/services';
```

Replace the whole `case MessageAction.EXTRACT_ARTICLE:` block up to its `break;` with:

```ts
        case MessageAction.EXTRACT_ARTICLE: {
          const messages = EXTRACTION_MESSAGES[getExtractionKind(message.payload.tabUrl)];
          /* extractWithProgress never rejects: a failure comes back as isSuccess: false after its toast */
          extractWithProgress(() => extractionService.current.execute(message.payload.tabUrl), {
            showProgress: () => toast.loading(messages.progress, { group: EXTRACTION_TOAST_GROUP }),
            dismissProgress: (id: string) => toast.dismiss(id),
            showFailure: () => {
              toast.error(messages.failure, { group: EXTRACTION_TOAST_GROUP });
            },
          }).then((article: ArticleExtractionResult) => {
            /** Respond to the service worker */
            sendResponse({
              success: true,
              payload: {
                tabId: message.payload.tabId,
                tabUrl: message.payload.tabUrl,
                result: article,
              },
            });
          });
          break;
        }
```

- [ ] **Step 7: Run all tests and type-check**

Run: `pnpm test`
Expected: all pass (the existing `ExtractionProgress` tests are untouched)

Run: `pnpm type-check`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/features/content/services/ExtractionKind.ts src/features/content/services/__tests__/ExtractionKind.test.ts src/features/content/services/ArticleExtractionService.ts src/features/content/services/index.ts src/features/content/hooks/useContentMessage.ts
git commit -m "feat: name what is being extracted in the progress and failure toasts"
```

---

### Task 4: Injectors report their stages

**Files:**
- Create: `src/types/Injection.ts`
- Modify: `src/types/index.ts`
- Modify: `src/features/content/injectors/{ChatGPT,Claude,Grok,Perplexity,Gemini,Deepseek,Kimi,Qwen,AIStudio}.ts`
- Modify tests: `src/features/content/injectors/__tests__/{ChatGPT,Claude,Grok,Perplexity,Gemini,Kimi}.test.ts`
- Create tests: `src/features/content/injectors/__tests__/{Deepseek,Qwen,AIStudio}.test.ts`
- Modify: `src/features/content/services/ArticleInjectionService.ts` (the `injectors` record type and the call)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces (from `@/types`):
  - `type InjectionStage = 'selectingModel' | 'pasting' | 'sending'`
  - `type StageReporter = (stage: InjectionStage) => void`
  - `interface InjectOptions { model?: string; onStage?: StageReporter }`
  - `const noopStageReporter: StageReporter`
  - every injector: `(prompt: string, options?: InjectOptions) => Promise<{ success: boolean; error?: Error }>`
  - `ArticleInjectionService.execute(serviceUrl: string, prompt: string, options?: InjectOptions): Promise<ArticleInjectionResult>`

Stage rule for every injector: report `selectingModel` first when a model is given and the injector selects models; report `pasting` before looking for the editor (after model selection); report `sending` right after the text is inserted.

- [ ] **Step 1: Add the types**

Create `src/types/Injection.ts`:

```ts
/* The steps an injector goes through, shown to the user as progress toasts */
export type InjectionStage = 'selectingModel' | 'pasting' | 'sending';

export type StageReporter = (stage: InjectionStage) => void;

export interface InjectOptions {
  /* The model to select first, for the services that offer a choice */
  model?: string;
  onStage?: StageReporter;
}

export const noopStageReporter: StageReporter = () => undefined;
```

In `src/types/index.ts`, add:

```ts
export * from './Injection';
```

- [ ] **Step 2: Write the failing stage tests for the four injectors with jsdom tests**

`src/features/content/injectors/__tests__/ChatGPT.test.ts`: inside `describe('injectChatGPT', ...)`, after the `run` helper, add:

```ts
  it('reports pasting, then sending', async () => {
    mountProseMirror('aria-disabled="false"');
    const onStage = jest.fn();

    const result = injectChatGPT(PROMPT, { onStage });
    await jest.runAllTimersAsync();
    await result;

    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['pasting', 'sending']);
  });
```

`src/features/content/injectors/__tests__/Claude.test.ts`: inside `describe('injectClaude', ...)`, after the `mount` helper, add:

```ts
  it('reports pasting, then sending', async () => {
    mount('<button data-testid="chat-input-send"></button>');
    const onStage = jest.fn();

    const result = injectClaude(PROMPT, { onStage });
    await jest.runAllTimersAsync();
    await result;

    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['pasting', 'sending']);
  });
```

`src/features/content/injectors/__tests__/Grok.test.ts`: inside `describe('injectGrok', ...)`, after `watchSubmitClicks`, add:

```ts
  it('reports pasting, then sending', async () => {
    document.body.innerHTML = '<form><textarea></textarea><button type="submit" aria-label="Submit"></button></form>';
    watchSubmitClicks();
    const onStage = jest.fn();

    const result = injectGrok(PROMPT, { onStage });
    await jest.runAllTimersAsync();
    await result;

    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['pasting', 'sending']);
  });

  it('reports no sending when the editor is missing', async () => {
    const onStage = jest.fn();

    const result = injectGrok(PROMPT, { onStage });
    await jest.runAllTimersAsync();

    await expect(result).resolves.toMatchObject({ success: false });
    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['pasting']);
  });
```

`src/features/content/injectors/__tests__/Perplexity.test.ts`: inside `describe('injectPerplexity', ...)`, after `watchSubmitClicks`, add:

```ts
  it('reports pasting, then sending', async () => {
    watchSubmitClicks();
    const onStage = jest.fn();

    const result = injectPerplexity(PROMPT, { onStage });
    await jest.runAllTimersAsync();
    await result;

    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['pasting', 'sending']);
  });
```

- [ ] **Step 3: Write the failing stage tests for the model-selecting injectors and AI Studio**

`src/features/content/injectors/__tests__/Gemini.test.ts`: add the docblock as the very first lines of the file (the existing `matchGeminiModelLabel` tests run the same under jsdom):

```ts
/**
 * @jest-environment jsdom
 */
```

Change the import to `import { injectGemini, matchGeminiModelLabel } from '@/features/content/injectors/Gemini';` and append at the end of the file:

```ts
describe('injectGemini stages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML =
      '<rich-textarea><div class="ql-editor" contenteditable="true"><p></p></div></rich-textarea><button aria-label="Send message"></button>';
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  const stagesOf = async (options: { model?: string }) => {
    const onStage = jest.fn();
    const result = injectGemini('Prompt', { ...options, onStage });
    await jest.runAllTimersAsync();
    await expect(result).resolves.toEqual({ success: true });
    return onStage.mock.calls.map(([stage]) => stage);
  };

  it('reports selecting the model first when a model is given', async () => {
    /* The picker is missing, so the selection fails; the injection carries on as it does live */
    expect(await stagesOf({ model: 'Pro' })).toEqual(['selectingModel', 'pasting', 'sending']);
  });

  it('starts with pasting when no model is given', async () => {
    expect(await stagesOf({})).toEqual(['pasting', 'sending']);
  });
});
```

`src/features/content/injectors/__tests__/Kimi.test.ts`: add the same jsdom docblock as the first lines, change the import to `import { injectKimi, isPromptResidue } from '@/features/content/injectors/Kimi';`, and append:

```ts
describe('injectKimi stages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    /* jsdom does not implement execCommand */
    Object.defineProperty(document, 'execCommand', { value: jest.fn(() => true), configurable: true });
    document.body.innerHTML = '<div contenteditable="true" data-lexical-editor="true"></div><div class="send-button-container"></div>';
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  const stagesOf = async (options: { model?: string }) => {
    const onStage = jest.fn();
    const result = injectKimi('Prompt', { ...options, onStage });
    await jest.runAllTimersAsync();
    await expect(result).resolves.toEqual({ success: true });
    return onStage.mock.calls.map(([stage]) => stage);
  };

  it('reports selecting the model first when a model is given', async () => {
    expect(await stagesOf({ model: 'K3' })).toEqual(['selectingModel', 'pasting', 'sending']);
  });

  it('starts with pasting when no model is given', async () => {
    expect(await stagesOf({})).toEqual(['pasting', 'sending']);
  });
});
```

Create `src/features/content/injectors/__tests__/Deepseek.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import { injectDeepSeek } from '@/features/content/injectors/Deepseek';

describe('injectDeepSeek stages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<textarea></textarea><div role="button" class="ds-button--primary ds-button--filled ds-button--circle"></div>';
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  const stagesOf = async (options: { model?: string }) => {
    const onStage = jest.fn();
    const result = injectDeepSeek('Prompt', { ...options, onStage });
    await jest.runAllTimersAsync();
    await expect(result).resolves.toEqual({ success: true });
    return onStage.mock.calls.map(([stage]) => stage);
  };

  it('reports selecting the model first when a model is given', async () => {
    expect(await stagesOf({ model: 'Expert' })).toEqual(['selectingModel', 'pasting', 'sending']);
  });

  it('starts with pasting when no model is given', async () => {
    expect(await stagesOf({})).toEqual(['pasting', 'sending']);
  });
});
```

Create `src/features/content/injectors/__tests__/Qwen.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import { injectQwen } from '@/features/content/injectors/Qwen';

describe('injectQwen stages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<textarea class="message-input-textarea"></textarea><button class="send-button"></button>';
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  const stagesOf = async (options: { model?: string }) => {
    const onStage = jest.fn();
    const result = injectQwen('Prompt', { ...options, onStage });
    await jest.runAllTimersAsync();
    await expect(result).resolves.toEqual({ success: true });
    return onStage.mock.calls.map(([stage]) => stage);
  };

  it('reports selecting the model first when a model is given', async () => {
    expect(await stagesOf({ model: 'Qwen3.7-Max' })).toEqual(['selectingModel', 'pasting', 'sending']);
  });

  it('starts with pasting when no model is given', async () => {
    expect(await stagesOf({})).toEqual(['pasting', 'sending']);
  });
});
```

Create `src/features/content/injectors/__tests__/AIStudio.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import { injectAIStudio } from '@/features/content/injectors/AIStudio';

describe('injectAIStudio stages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<ms-prompt-box><textarea></textarea></ms-prompt-box><ms-run-button><button></button></ms-run-button>';
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('reports pasting, then sending; its settings are not model selection', async () => {
    const onStage = jest.fn();
    const result = injectAIStudio('Prompt', { onStage });
    await jest.runAllTimersAsync();

    await expect(result).resolves.toEqual({ success: true });
    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual(['pasting', 'sending']);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test src/features/content/injectors`
Expected: FAIL — type errors "Expected 1 arguments, but got 2" / "has no properties in common with type 'string'" for the new calls

- [ ] **Step 5: Change the nine injectors**

Every injector adds `InjectOptions` and `noopStageReporter` to its imports from `@/types`, e.g.:

```ts
import { InjectOptions, noopStageReporter } from '@/types';
```

**ChatGPT.ts** — signature and stages:

```ts
export async function injectChatGPT(promptText: string, { onStage = noopStageReporter }: InjectOptions = {}): Promise<{ success: boolean; error?: Error }> {
  try {
    onStage('pasting');
    const prompt = truncateForChatGPT(promptText);
```

and right after the `if (editor instanceof HTMLTextAreaElement) { ... } else { ... }` insertion block, before `/** Wait for the submit button to accept a click */`:

```ts
    onStage('sending');
```

**Claude.ts** — signature, then `onStage('pasting');` as the first statement inside `try`, and `onStage('sending');` right after `insertEditorText(prompt);`:

```ts
export async function injectClaude(prompt: string, { onStage = noopStageReporter }: InjectOptions = {}): Promise<{ success: boolean; error?: Error }> {
  try {
    onStage('pasting');
```

```ts
    insertEditorText(prompt);
    onStage('sending');
```

**Grok.ts** — signature, `onStage('pasting');` first inside `try`, and `onStage('sending');` after the whole `if / else if / else` insertion block, before `/** Wait for 1 to 1.5 seconds */`:

```ts
export async function injectGrok(prompt: string, { onStage = noopStageReporter }: InjectOptions = {}): Promise<{ success: boolean; error?: Error }> {
  try {
    onStage('pasting');
```

**Perplexity.ts** — signature, `onStage('pasting');` first inside `try`, and `onStage('sending');` after the `if (!isPromptInserted(...)) { ... }` fallback block, before `/** Wait for the submit button to be found */`:

```ts
export async function injectPerplexity(prompt: string, { onStage = noopStageReporter }: InjectOptions = {}): Promise<{ success: boolean; error?: Error }> {
  try {
    onStage('pasting');
```

**AIStudio.ts** — signature, `onStage('pasting');` first inside `try` (the thinking level and URL context settings belong to this stage), and `onStage('sending');` after the native-setter `if / else` block, before `/** Wait for 0.5 to 1 second */`:

```ts
export async function injectAIStudio(prompt: string, { onStage = noopStageReporter }: InjectOptions = {}): Promise<{ success: boolean; error?: Error }> {
  try {
    onStage('pasting');
```

**Gemini.ts** — signature and the model block:

```ts
export async function injectGemini(prompt: string, { model, onStage = noopStageReporter }: InjectOptions = {}): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[Gemini.tsx]', '[injectGemini]', 'Injecting article into Gemini', prompt);

    /* Select the configured model first; failures are non-fatal */
    if (model) {
      onStage('selectingModel');
      await selectGeminiModel(model);
    }
    onStage('pasting');
```

and `onStage('sending');` right after `editor.dispatchEvent(new Event('input', { bubbles: true }));`.

**Deepseek.ts**, **Qwen.ts**, **Kimi.ts** — these wait 2–3 s before model selection; the first stage covers that wait. Signature and opening, shown for DeepSeek (Qwen and Kimi are the same with `selectQwenModel` / `selectKimiModel` and their own log line):

```ts
export async function injectDeepSeek(prompt: string, { model, onStage = noopStageReporter }: InjectOptions = {}): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[DeepSeek.tsx]', '[injectDeepSeek]', 'Injecting article into DeepSeek\n', prompt);
    onStage(model ? 'selectingModel' : 'pasting');

    /** Wait for 2 seconds to ensure page is fully loaded */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(2000, 3000)));

    /* Select the configured model first; failures are non-fatal */
    if (model) {
      await selectDeepSeekModel(model);
      onStage('pasting');
    }
```

Then `onStage('sending');` right after the insertion:
- DeepSeek and Qwen: after the native-setter `if / else` block, before `/** Wait for 1 to 1.5 seconds */`
- Kimi: right after `document.execCommand('insertText', false, prompt);`

- [ ] **Step 6: Pass the options through `ArticleInjectionService`**

In `src/features/content/services/ArticleInjectionService.ts`, change the imports and the record type:

```ts
import { AIService, ArticleInjectionResult, getAIServiceForUrl, InjectOptions } from '@/types';
```

```ts
const injectors: Record<AIService, (prompt: string, options?: InjectOptions) => Promise<{ success: boolean; error?: Error }>> = {
```

Change the method signature and the call:

```ts
  async execute(serviceUrl: string, prompt: string, options: InjectOptions = {}): Promise<ArticleInjectionResult> {
```

```ts
        return await injector(prompt, options);
```

In `src/features/content/hooks/useContentMessage.ts`, change the call so that it still compiles (Task 5 rewrites this block):

```ts
                injectionService.current.execute(message.payload.tabUrl, prompt, { model }).then((result: ArticleInjectionResult) => {
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test src/features/content/injectors`
Expected: PASS (existing tests and the new stage tests)

Run: `pnpm type-check`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/types/Injection.ts src/types/index.ts src/features/content/injectors src/features/content/services/ArticleInjectionService.ts src/features/content/hooks/useContentMessage.ts
git commit -m "feat: let the injectors report which stage they are in"
```

---

### Task 5: Injection progress toasts

**Files:**
- Create: `src/features/content/services/InjectionProgress.ts`
- Test: `src/features/content/services/__tests__/InjectionProgress.test.ts`
- Modify: `src/features/content/services/index.ts`
- Modify: `src/features/content/hooks/useContentMessage.ts` (INJECT_ARTICLE case)

**Interfaces:**
- Consumes: `InjectionStage`, `StageReporter`, `ArticleInjectionResult` (`@/types`, Task 4); `ArticleInjectionService.execute(serviceUrl, prompt, options)` (Task 4); `toast.loading / success / error` (Task 2)
- Produces:
  - `interface InjectionToasts { loading: (message: string) => void; success: (message: string) => void; error: (message: string) => void }`
  - `INJECTION_STAGE_MESSAGES: Record<InjectionStage, string>`, `INJECTION_SUCCESS_MESSAGE = 'Sent'`, `INJECTION_TOAST_GROUP = 'inject'`
  - `getInjectionFailureMessage(lastStage: InjectionStage | null): string`
  - `injectWithProgress(inject: (onStage: StageReporter) => Promise<ArticleInjectionResult>, toasts: InjectionToasts): Promise<ArticleInjectionResult>`

- [ ] **Step 1: Write the failing test**

Create `src/features/content/services/__tests__/InjectionProgress.test.ts`:

```ts
/* Import the module directly: the services barrel pulls in the extractors (pdfjs-dist, Readability) */
import { getInjectionFailureMessage, injectWithProgress, INJECTION_STAGE_MESSAGES } from '@/features/content/services/InjectionProgress';
import type { StageReporter } from '@/types';

const createToasts = () => ({ loading: jest.fn(), success: jest.fn(), error: jest.fn() });

describe('injectWithProgress', () => {
  it('shows each stage, then Sent', async () => {
    const toasts = createToasts();

    const result = await injectWithProgress(async (onStage: StageReporter) => {
      onStage('selectingModel');
      onStage('pasting');
      onStage('sending');
      return { success: true };
    }, toasts);

    expect(result).toEqual({ success: true });
    expect(toasts.loading.mock.calls).toEqual([['Selecting model…'], ['Pasting article…'], ['Sending…']]);
    expect(toasts.success).toHaveBeenCalledWith('Sent');
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it('shows a stage reported twice in a row once', async () => {
    const toasts = createToasts();

    await injectWithProgress(async onStage => {
      onStage('pasting');
      onStage('pasting');
      onStage('sending');
      return { success: true };
    }, toasts);

    expect(toasts.loading.mock.calls).toEqual([['Pasting article…'], ['Sending…']]);
  });

  it('says the article could not be pasted when it fails before sending', async () => {
    const toasts = createToasts();
    const error = new Error('ChatGPT container not found');

    const result = await injectWithProgress(async onStage => {
      onStage('pasting');
      return { success: false, error };
    }, toasts);

    expect(result).toEqual({ success: false, error });
    expect(toasts.error).toHaveBeenCalledWith("Couldn't paste the article");
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it('says the message could not be sent when it fails while sending', async () => {
    const toasts = createToasts();

    await injectWithProgress(async onStage => {
      onStage('pasting');
      onStage('sending');
      return { success: false, error: new Error('submit button not found') };
    }, toasts);

    expect(toasts.error).toHaveBeenCalledWith("Couldn't send the message");
  });

  it('turns an exception into a failure, named after the last stage', async () => {
    const toasts = createToasts();

    const result = await injectWithProgress(async onStage => {
      onStage('sending');
      throw new Error('boom');
    }, toasts);

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('boom');
    expect(toasts.error).toHaveBeenCalledWith("Couldn't send the message");
  });

  it('says the article could not be pasted when it fails before any stage, e.g. while building the prompt', async () => {
    const toasts = createToasts();

    const result = await injectWithProgress(async () => {
      throw new Error('Article is not valid');
    }, toasts);

    expect(result.success).toBe(false);
    expect(toasts.loading).not.toHaveBeenCalled();
    expect(toasts.error).toHaveBeenCalledWith("Couldn't paste the article");
  });
});

describe('injection messages', () => {
  it('has the agreed wording', () => {
    expect(INJECTION_STAGE_MESSAGES).toEqual({ selectingModel: 'Selecting model…', pasting: 'Pasting article…', sending: 'Sending…' });
    expect(getInjectionFailureMessage(null)).toBe("Couldn't paste the article");
    expect(getInjectionFailureMessage('selectingModel')).toBe("Couldn't paste the article");
    expect(getInjectionFailureMessage('pasting')).toBe("Couldn't paste the article");
    expect(getInjectionFailureMessage('sending')).toBe("Couldn't send the message");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/features/content/services/__tests__/InjectionProgress.test.ts`
Expected: FAIL with "Cannot find module '@/features/content/services/InjectionProgress'"

- [ ] **Step 3: Write `InjectionProgress.ts`**

```ts
import type { ArticleInjectionResult, InjectionStage, StageReporter } from '@/types';

/* The toasts shown around an injection, passed in so that this logic runs without React */
export interface InjectionToasts {
  loading: (message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

export const INJECTION_STAGE_MESSAGES: Record<InjectionStage, string> = {
  selectingModel: 'Selecting model…',
  pasting: 'Pasting article…',
  sending: 'Sending…',
};

export const INJECTION_SUCCESS_MESSAGE = 'Sent';

/* Each stage replaces the previous one */
export const INJECTION_TOAST_GROUP = 'inject';

/**
 * The failure message for the stage the injection stopped at
 * @param lastStage - The last stage reported, or null when none was
 * @returns The message; model selection never fails the injection, so only sending has its own
 */
export const getInjectionFailureMessage = (lastStage: InjectionStage | null): string =>
  lastStage === 'sending' ? "Couldn't send the message" : "Couldn't paste the article";

/**
 * Run an injection, showing a toast for each stage it reports and one for the result
 * @param inject - The injection, given the callback to report its stages to
 * @param toasts - The toasts to show
 * @returns The injection result; an exception is turned into a failed result
 */
export async function injectWithProgress(
  inject: (onStage: StageReporter) => Promise<ArticleInjectionResult>,
  toasts: InjectionToasts
): Promise<ArticleInjectionResult> {
  let lastStage: InjectionStage | null = null;
  const onStage: StageReporter = stage => {
    if (stage === lastStage) return;
    lastStage = stage;
    toasts.loading(INJECTION_STAGE_MESSAGES[stage]);
  };

  let result: ArticleInjectionResult;
  try {
    result = await inject(onStage);
  } catch (error: unknown) {
    result = { success: false, error: error instanceof Error ? error : new Error('Failed to inject article') };
  }

  if (result.success) toasts.success(INJECTION_SUCCESS_MESSAGE);
  else toasts.error(getInjectionFailureMessage(lastStage));
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/features/content/services/__tests__/InjectionProgress.test.ts`
Expected: PASS

- [ ] **Step 5: Wire it into `useContentMessage`**

In `src/features/content/services/index.ts`, add:

```ts
export * from './InjectionProgress';
```

In `src/features/content/hooks/useContentMessage.ts`, extend the services import with `INJECTION_TOAST_GROUP` and `injectWithProgress`:

```ts
import {
  ArticleExtractionService,
  ArticleInjectionService,
  EXTRACTION_MESSAGES,
  EXTRACTION_TOAST_GROUP,
  extractWithProgress,
  getExtractionKind,
  INJECTION_TOAST_GROUP,
  injectWithProgress,
} from '@/features/content/services';
```

Replace the `createPrompt(service, ...)...catch(...)` chain (from `createPrompt(service, useSettingsStore.getState(), message.payload.article)` through the end of its `.catch(error => { ... });`) with:

```ts
            /* Building the prompt and reading the model run inside, so that their failures get a toast too */
            injectWithProgress(
              async onStage => {
                const prompt = await createPrompt(service, useSettingsStore.getState(), message.payload.article);
                /* Read the model via the async getter, which goes to chrome.storage: the store snapshot of the content script is taken before hydration */
                const model = await useSettingsStore.getState().getModelFor(service);
                return injectionService.current.execute(message.payload.tabUrl, prompt, { model, onStage });
              },
              {
                loading: message => {
                  toast.loading(message, { group: INJECTION_TOAST_GROUP });
                },
                success: message => {
                  toast.success(message, { group: INJECTION_TOAST_GROUP });
                },
                error: message => {
                  toast.error(message, { group: INJECTION_TOAST_GROUP });
                },
              }
            ).then((result: ArticleInjectionResult) => {
              if (!result.success) logger.error('🫳💬', '[useContentMessage.tsx]', '[handleMessage]', 'Failed to inject article:', result.error);
              /** Respond to the service worker */
              sendResponse({ success: result.success, error: result.error });
            });
```

Note the callback parameter is named `message` inside the toast object; it shadows the outer `message` only inside those three one-line arrows, which do not use the outer one. If the reviewer prefers, rename it to `text`.

- [ ] **Step 6: Run everything**

Run: `pnpm test`
Expected: all pass

Run: `pnpm type-check`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/features/content/services/InjectionProgress.ts src/features/content/services/__tests__/InjectionProgress.test.ts src/features/content/services/index.ts src/features/content/hooks/useContentMessage.ts
git commit -m "feat: show the injection stages and its result as toasts"
```

---

### Task 6: Full checks and manual verification

**Files:**
- Modify: `CLAUDE.md` only if a statement there became wrong (the "Core data flow" item 1 mentions the "Extracting…" toast; change it to "a per-kind progress toast")

**Interfaces:**
- Consumes: everything above

- [ ] **Step 1: Run the full check suite**

Run each, one command per call:

- `pnpm test` → all pass
- `pnpm type-check` → no errors
- `pnpm eslint-check` → no errors
- `pnpm prettier-check` → all files pass (if not: `pnpm prettier-fix`, re-run, and commit the formatting with the task it belongs to)
- `pnpm build` → success
- `pnpm build:firefox` → success

- [ ] **Step 2: Update CLAUDE.md if needed**

In `CLAUDE.md`, in "Core data flow" item 1, replace `` `extractWithProgress` shows an "Extracting…" toast after 500 ms and a failure toast `` with:

```
`extractWithProgress` shows a progress toast named after the kind of content (`ExtractionKind.ts`) after 500 ms and a failure toast; on the AI service page, injectors report their stages through `onStage` and `injectWithProgress` shows them
```

Commit:

```bash
git add CLAUDE.md
git commit -m "docs: describe the extraction and injection toasts"
```

- [ ] **Step 3: Manual check on Chrome (dev build)**

`pnpm dev`, load `dist/dev` in chrome://extensions. Check and note the result of each:

1. A YouTube video with captions → AI service ChatGPT: "Extracting transcript…" on the video page (if it takes over 0.5 s); on chatgpt.com "Pasting article…" → "Sending…" → "Sent", each readable, the previous fading out
2. Same with Gemini or Kimi with a model set in the options: "Selecting model…" comes first. On Kimi, "Sending…" stays about 6 s before "Sent" (residue cleanup; expected)
3. A video without captions → the red "Couldn't get the transcript of this video" with × on the top-left; it stays until × is clicked
4. A Wikipedia page with the OS in dark mode → dark colors
5. A page whose `html` has a small font size (e.g. run `document.documentElement.style.fontSize = '10px'` in DevTools first) → the toast keeps its size
6. Options page → Export settings → green "Settings exported successfully" at the top center; click Export 5 times quickly → at most 3 toasts

- [ ] **Step 4: Manual check on Firefox desktop and Firefox for Android**

- Firefox desktop (`pnpm build:firefox`, load `dist/firefox-prod/manifest.json` via about:debugging): item 1 above with ChatGPT; options page export
- Firefox for Android (RDP install as in memory `firefox-extension-gotchas.md`): one summary on ChatGPT; the toast fits the screen width with 16px on each side

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/fut-150-toast-redesign
```

PR to `develop`, English title and body, body ends with `Fixes FUT-150`, no AI attribution.
