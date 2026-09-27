# On-demand Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the page content only when the user summarizes or copies it, and remove automatic extraction with its settings.

**Architecture:** The service worker drives every action: `extractAndStore` asks the content script to extract, stores the result in IndexedDB and returns the article id, which `openAIService` and `readArticleForClipboard` use. The content script shows a delayed "Extracting…" toast and a failure toast around the extraction. Page loads no longer extract, except to resume a mobile YouTube summary held in `storage.session`.

**Tech Stack:** TypeScript, React 19, Manifest V3 (Chrome) / Firefox background page, Zustand persist, `idb`, Jest (ts-jest, node environment), pnpm.

**Spec:** `docs/superpowers/specs/2026-09-27-on-demand-extraction-design.md`

## Global Constraints

- Branch: `feat/fut-147-on-demand-extraction` (already checked out). Never commit to `develop` or `main`
- Commit messages in English, Conventional Commits, no `Co-Authored-By`, no AI attribution
- Source comments in English, block comments (`/* */`) only, even for one line
- No dependency or version changes; use `pnpm` only
- No visual change to the toast (shape, colors, position, animation stay); only its lifetime changes
- No zustand `version` / `migrate`; stored values of removed settings are not deleted explicitly
- Toast texts: `Extracting…` (with the ellipsis character U+2026), `Couldn't extract the content of this page`, `Article copied to clipboard` (unchanged)
- Progress toast delay: 500 ms
- Browser-specific code stays in `src/platform/`; guard missing APIs at runtime, not with `__TARGET__`
- Every task ends with `pnpm test` passing; the last task runs `pnpm type-check`, `pnpm eslint-check`, `pnpm prettier-check` as well

## Review Focus

1. A page open before the extension was installed or updated has no content script: summarize must do nothing and not throw (Task 4 test "does not open the AI service when the page has no content script")
2. A non-secure `http://` page: toasts must still work, since `crypto.randomUUID()` is missing there (Task 2 uses a counter; checked manually in Task 7 on `http://neverssl.com/`)
3. A YouTube extraction taking several seconds on the Firefox background page: the AI service tab must still open after it (checked manually in Task 7)
4. A settings backup exported before this change, still holding the removed keys: it must import without error (Task 5 test "imports a backup that still holds the removed extraction settings")
5. An existing user's stored settings still holding the removed keys: the options page and every action must work, and the keys drop out on the next save (Task 5 test above covers the drop; the options page is checked manually in Task 7)

---

### Task 1: Extraction with progress and failure toasts

**Files:**
- Create: `src/features/content/services/ExtractionProgress.ts`
- Modify: `src/features/content/services/index.ts`
- Test: `src/features/content/services/__tests__/ExtractionProgress.test.ts`

**Interfaces:**
- Consumes: `ArticleExtractionResult` from `@/types`
- Produces:
  - `export interface ExtractionToasts { showProgress: () => string; dismissProgress: (id: string) => void; showFailure: () => void; }`
  - `export const EXTRACTION_PROGRESS_DELAY_MS = 500;`
  - `export async function extractWithProgress(extract: () => Promise<ArticleExtractionResult>, toasts: ExtractionToasts, delayMs?: number): Promise<ArticleExtractionResult>` — never rejects; an exception becomes `isSuccess: false`

- [ ] **Step 1: Write the failing test**

Create `src/features/content/services/__tests__/ExtractionProgress.test.ts`:

```ts
/* Import the module directly: the services barrel pulls in the extractors (pdfjs-dist, Readability) */
import { extractWithProgress } from '@/features/content/services/ExtractionProgress';
import type { ArticleExtractionResult } from '@/types';

const SUCCESS: ArticleExtractionResult = { isSuccess: true, title: 'title', url: 'https://example.com/', content: 'content', error: null };
const FAILURE: ArticleExtractionResult = { isSuccess: false, title: null, url: 'https://example.com/', content: null, error: new Error('failed') };

const createToasts = () => ({
  showProgress: jest.fn(() => 'progress-id'),
  dismissProgress: jest.fn(),
  showFailure: jest.fn(),
});

/* An extraction the test settles by hand, so that the test decides how long it takes */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('extractWithProgress', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows no progress toast for an extraction that ends within the delay', async () => {
    const toasts = createToasts();
    const extraction = deferred<ArticleExtractionResult>();
    const result = extractWithProgress(() => extraction.promise, toasts, 500);

    jest.advanceTimersByTime(499);
    extraction.resolve(SUCCESS);
    await expect(result).resolves.toBe(SUCCESS);
    jest.advanceTimersByTime(1000);

    expect(toasts.showProgress).not.toHaveBeenCalled();
    expect(toasts.dismissProgress).not.toHaveBeenCalled();
    expect(toasts.showFailure).not.toHaveBeenCalled();
  });

  it('shows the progress toast after the delay and dismisses it when the extraction ends', async () => {
    const toasts = createToasts();
    const extraction = deferred<ArticleExtractionResult>();
    const result = extractWithProgress(() => extraction.promise, toasts, 500);

    jest.advanceTimersByTime(500);
    expect(toasts.showProgress).toHaveBeenCalledTimes(1);
    expect(toasts.dismissProgress).not.toHaveBeenCalled();

    extraction.resolve(SUCCESS);
    await expect(result).resolves.toBe(SUCCESS);

    expect(toasts.dismissProgress).toHaveBeenCalledWith('progress-id');
    expect(toasts.showFailure).not.toHaveBeenCalled();
  });

  it('shows the failure toast when the extraction fails', async () => {
    const toasts = createToasts();

    await expect(extractWithProgress(() => Promise.resolve(FAILURE), toasts, 500)).resolves.toBe(FAILURE);

    expect(toasts.showFailure).toHaveBeenCalledTimes(1);
  });

  it('dismisses the progress toast and reports a failure when the extraction throws', async () => {
    const toasts = createToasts();
    const extraction = deferred<ArticleExtractionResult>();
    const result = extractWithProgress(() => extraction.promise, toasts, 500);

    jest.advanceTimersByTime(500);
    extraction.reject(new Error('boom'));
    const article = await result;

    expect(article.isSuccess).toBe(false);
    expect(article.error?.message).toBe('boom');
    expect(toasts.dismissProgress).toHaveBeenCalledWith('progress-id');
    expect(toasts.showFailure).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/features/content/services/__tests__/ExtractionProgress.test.ts`
Expected: FAIL with `Cannot find module '@/features/content/services/ExtractionProgress'`

- [ ] **Step 3: Write the implementation**

Create `src/features/content/services/ExtractionProgress.ts`:

```ts
import type { ArticleExtractionResult } from '@/types';

/* The toasts shown around an extraction, passed in so that this logic runs without React */
export interface ExtractionToasts {
  /* Shows the progress toast and returns its id */
  showProgress: () => string;
  dismissProgress: (id: string) => void;
  showFailure: () => void;
}

/* Readability usually finishes well within this, so the progress toast only appears for YouTube and PDFs */
export const EXTRACTION_PROGRESS_DELAY_MS = 500;

/**
 * Run an extraction, showing a progress toast when it takes longer than the delay
 * and a failure toast when it does not succeed
 * @param extract - The extraction to run
 * @param toasts - The toasts to show
 * @param delayMs - How long to wait before showing the progress toast
 * @returns The extraction result; an exception is turned into a failed result
 */
export async function extractWithProgress(
  extract: () => Promise<ArticleExtractionResult>,
  toasts: ExtractionToasts,
  delayMs: number = EXTRACTION_PROGRESS_DELAY_MS
): Promise<ArticleExtractionResult> {
  let progressId: string | null = null;
  const timer = setTimeout(() => {
    progressId = toasts.showProgress();
  }, delayMs);

  let result: ArticleExtractionResult;
  try {
    result = await extract();
  } catch (error: unknown) {
    result = {
      isSuccess: false,
      title: null,
      url: null,
      content: null,
      error: error instanceof Error ? error : new Error('Failed to extract article'),
    };
  } finally {
    clearTimeout(timer);
    if (progressId !== null) toasts.dismissProgress(progressId);
  }

  if (!result.isSuccess) toasts.showFailure();
  return result;
}
```

Modify `src/features/content/services/index.ts` to:

```ts
export * from './ArticleExtractionService';
export * from './ArticleInjectionService';
export * from './ExtractionProgress';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/features/content/services/__tests__/ExtractionProgress.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/content/services/ExtractionProgress.ts src/features/content/services/index.ts src/features/content/services/__tests__/ExtractionProgress.test.ts
git commit -m "feat: add extraction wrapper with progress and failure toasts"
```

---

### Task 2: Persistent toasts and the content script extraction handler

**Files:**
- Modify: `src/features/content/components/main/Toaster.tsx`
- Modify: `src/features/content/hooks/useContentMessage.ts` (the `EXTRACT_ARTICLE` case and the comment in the `INJECT_ARTICLE` case)

**Interfaces:**
- Consumes: `extractWithProgress`, `ExtractionToasts` from Task 1 (`@/features/content/services`)
- Produces:
  - `export interface ToastOptions { persistent?: boolean }`
  - `toast.success | error | info | warning(message: string, options?: ToastOptions): string` — returns the toast id
  - `toast.dismiss(id: string): void`

No unit test: the Toaster is a React component and the repo has no React testing library (adding one needs approval). Its behavior is checked manually in Task 7.

- [ ] **Step 1: Replace the Toaster event handling and the `toast` API**

In `src/features/content/components/main/Toaster.tsx`, after the `ToasterProps` interface, add:

```ts
export interface ToastOptions {
  /* Keep the toast until toast.dismiss() is called with the id it returned */
  persistent?: boolean;
}

interface ToastEventDetail {
  id: string;
  type: ToastType;
  message: string;
  persistent: boolean;
}

/* A counter rather than crypto.randomUUID(), which is missing on non-secure (http) pages */
let lastToastId = 0;
```

Replace the whole `useEffect(() => { ... }, [duration]);` block inside `Toaster` with:

```tsx
  useEffect(() => {
    const hideToast = (id: string) => {
      setToasts(prev => prev.map(toast => (toast.id === id ? { ...toast, visible: false } : toast)));
      setTimeout(() => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
      }, 300);
    };

    const handleToast = (event: CustomEvent<ToastEventDetail>) => {
      const { id, type, message, persistent } = event.detail;
      setToasts(prev => [...prev, { id, type, message, visible: false }]);

      /* Delay for the fade-in */
      requestAnimationFrame(() => {
        setToasts(prev => prev.map(toast => (toast.id === id ? { ...toast, visible: true } : toast)));
      });

      /* A persistent toast stays until toast.dismiss() */
      if (!persistent) setTimeout(() => hideToast(id), duration);
    };

    const handleDismiss = (event: CustomEvent<{ id: string }>) => hideToast(event.detail.id);

    window.addEventListener('toast' as any, handleToast as EventListener);
    window.addEventListener('toast-dismiss' as any, handleDismiss as EventListener);
    return () => {
      window.removeEventListener('toast' as any, handleToast as EventListener);
      window.removeEventListener('toast-dismiss' as any, handleDismiss as EventListener);
    };
  }, [duration]);
```

Replace the whole `export const toast = { ... };` object at the end of the file with:

```ts
const showToast = (type: ToastType, message: string, options: ToastOptions = {}): string => {
  const id = String(++lastToastId);
  window.dispatchEvent(new CustomEvent<ToastEventDetail>('toast', { detail: { id, type, message, persistent: options.persistent ?? false } }));
  return id;
};

export const toast = {
  success: (message: string, options?: ToastOptions) => showToast('success', message, options),
  error: (message: string, options?: ToastOptions) => showToast('error', message, options),
  info: (message: string, options?: ToastOptions) => showToast('info', message, options),
  warning: (message: string, options?: ToastOptions) => showToast('warning', message, options),
  dismiss: (id: string) => {
    window.dispatchEvent(new CustomEvent('toast-dismiss', { detail: { id } }));
  },
};
```

The JSX (classes, icons, position) is not touched.

- [ ] **Step 2: Use `extractWithProgress` in the content script**

In `src/features/content/hooks/useContentMessage.ts`, change the services import to:

```ts
import { ArticleExtractionService, ArticleInjectionService, extractWithProgress } from '@/features/content/services';
```

Replace the whole `case MessageAction.EXTRACT_ARTICLE:` block (from `case MessageAction.EXTRACT_ARTICLE:` down to the `break;` before `case MessageAction.INJECT_ARTICLE:`) with:

```ts
        case MessageAction.EXTRACT_ARTICLE:
          /* extractWithProgress never rejects: a failure comes back as isSuccess: false after its toast */
          extractWithProgress(() => extractionService.current.execute(message.payload.tabUrl), {
            showProgress: () => toast.info('Extracting…', { persistent: true }),
            dismissProgress: (id: string) => toast.dismiss(id),
            showFailure: () => toast.error("Couldn't extract the content of this page"),
          }).then((article: ArticleExtractionResult) => {
            /** Update the current tab state */
            setCurrentTabId(message.payload.tabId);
            setCurrentTabUrl(message.payload.tabUrl);
            setCurrentArticle(article);

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
```

(The `setCurrent*` calls go away in Task 4 together with the rest of that state.)

In the `INJECT_ARTICLE` case, the comment `/* Read the model via the async getter, which goes to chrome.storage (see EXTRACT_ARTICLE above) */` points at a comment that no longer exists. Replace it with:

```ts
                /* Read the model via the async getter, which goes to chrome.storage: the store snapshot of the content script is taken before hydration */
```

- [ ] **Step 3: Run the tests and the type check**

Run: `pnpm test`
Expected: PASS (all suites)

Run: `pnpm type-check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/features/content/components/main/Toaster.tsx src/features/content/hooks/useContentMessage.ts
git commit -m "feat: show extraction progress and failure toasts on the page"
```

---

### Task 3: Menus without "Extract article again"

**Files:**
- Modify: `src/features/serviceworker/services/ContextMenuService.ts` (`createMenu`, `createFullMenu`)
- Modify: `src/models/ContextMenuItems.ts` (remove `EXTRACT`)
- Modify: `src/pages/ServiceWorker.ts` (`toggleUIState` call to `createMenu`, the `'extract'` case in `handleContextMenuClicked`)
- Modify: `src/features/popup/components/main/PopupMain.tsx` (remove the "Extract article again" item)
- Test: `src/features/serviceworker/services/__tests__/ContextMenuService.test.ts`

**Interfaces:**
- Produces: `ContextMenuService.createMenu(tabUrl?: string): Promise<void>` (the `isExtracted` parameter is gone)

- [ ] **Step 1: Write the failing test**

In `src/features/serviceworker/services/__tests__/ContextMenuService.test.ts`, change the existing call in `skips creating the menu without logging errors` from `service.createMenu(true, 'https://example.com/article')` to `service.createMenu('https://example.com/article')`.

Add this block after the `it('does not throw when the removeAll callback checks a getter-only lastError', ...)` test:

```ts
  describe('on an ordinary page', () => {
    beforeEach(() => {
      chromeMock.contextMenus.removeAll.mockImplementation((callback: () => void) => callback());
      chromeMock.contextMenus.create.mockImplementation((props: { id?: string }, callback?: () => void) => {
        callback?.();
        return props.id;
      });
    });

    const createdIds = () => chromeMock.contextMenus.create.mock.calls.map(([props]: [{ id?: string }]) => props.id);

    it('always offers copying, since the copy extracts the page itself', async () => {
      await new ContextMenuService(jest.fn()).createMenu('https://example.com/article');
      expect(createdIds()).toContain('copy');
    });

    it('no longer offers extracting the page again', async () => {
      await new ContextMenuService(jest.fn()).createMenu('https://example.com/article');
      expect(createdIds()).not.toContain('extract');
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/features/serviceworker/services/__tests__/ContextMenuService.test.ts`
Expected: FAIL — a type error on `createMenu('https://example.com/article')` (`Expected 1-2 arguments` / `Argument of type 'string' is not assignable to parameter of type 'boolean'`)

- [ ] **Step 3: Update `ContextMenuService`**

In `src/features/serviceworker/services/ContextMenuService.ts`:

Change the signature `async createMenu(isExtracted: boolean, tabUrl?: string) {` to `async createMenu(tabUrl?: string) {`, and inside it change `await this.createFullMenu(tabUrl, isExtracted);` to `await this.createFullMenu();`.

Change `private async createFullMenu(tabUrl: string, isExtracted: boolean) {` to `private async createFullMenu() {`.

Replace the `/** Create copy option */` block and the `/** Create extract option */` block with:

```ts
      /** Create copy option */
      await this._createContextMenu({
        id: MENU_ITEMS.COPY.id,
        title: MENU_ITEMS.COPY.title,
        contexts: ['page' as chrome.contextMenus.ContextType],
        parentId: root,
      });
```

In `src/models/ContextMenuItems.ts`, delete the `EXTRACT: { ... },` entry.

- [ ] **Step 4: Update the callers**

In `src/pages/ServiceWorker.ts`, `toggleUIState`: replace

```ts
      /** Toggle the context menu */
      // await this.contextMenuService.createMenu(doesArticleExist, tabUrl);
      try {
        await this.contextMenuService.createMenu(doesArticleExist, tabUrl);
```

with

```ts
      /** Toggle the context menu */
      try {
        await this.contextMenuService.createMenu(tabUrl);
```

(`doesArticleExist` stays for the badge until Task 4.)

In `handleContextMenuClicked`, delete the whole `case 'extract':` block (from `case 'extract':` to its `break;`).

In `src/features/popup/components/main/PopupMain.tsx`, delete the whole `<ServiceListMenu ...>` element whose label is `Extract article again` (from its opening `<ServiceListMenu` to its `</ServiceListMenu>`), and change the icon import to:

```ts
import { IoClipboardOutline, IoSettingsOutline } from 'react-icons/io5';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all suites)

Run: `pnpm type-check`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/features/serviceworker/services/ContextMenuService.ts src/features/serviceworker/services/__tests__/ContextMenuService.test.ts src/models/ContextMenuItems.ts src/pages/ServiceWorker.ts src/features/popup/components/main/PopupMain.tsx
git commit -m "feat: always offer copy and drop re-extraction from the menus"
```

---

### Task 4: Extract on user action in the service worker

**Files:**
- Modify: `src/pages/ServiceWorker.ts`
- Modify: `src/types/Message.ts` (remove `TAB_UPDATED`)
- Modify: `src/features/content/hooks/useContentMessage.ts` (remove the tab state and the `TAB_UPDATED` case)
- Modify: `src/features/content/contexts/ContentContext.tsx`
- Test: `src/pages/__tests__/ServiceWorker.test.ts` (replace the whole file)

**Interfaces:**
- Consumes: `db.addArticle(article: Omit<ArticleRecord, 'id'>): Promise<string>` (upserts by URL, returns the id), `db.getArticleById(id: string): Promise<ArticleRecord | undefined>`, `ContextMenuService.createMenu(tabUrl?: string)` from Task 3
- Produces (all on the `ServiceWorker` class in `src/pages/ServiceWorker.ts`):
  - `extractAndStore(tabId: number, tabUrl: string): Promise<string | null>`
  - `openAIService(service: AIService, tabId: number, tabUrl: string): Promise<boolean>` (now extracts first)
  - `readArticleForClipboard(tabId: number, tabUrl: string): Promise<boolean>` (the `forcibly` parameter is gone)
  - `openPendingAIService(tabId: number, tabUrl: string): Promise<void>` (the `isExtracted` parameter is gone)
  - `useContentMessage(): void` (returns nothing)

- [ ] **Step 1: Write the failing tests**

Replace the whole content of `src/pages/__tests__/ServiceWorker.test.ts` with:

```ts
/*
 * Mock the stores so importing the service worker does not pull in the real
 * zustand persist store (its rehydrate reads chrome.storage on import) or
 * IndexedDB, which does not exist in the node test environment.
 */
jest.mock('@/stores', () => ({
  useArticleStore: { getState: () => ({ getArticleByUrl: jest.fn(() => Promise.resolve(undefined)) }) },
  useSettingsStore: {
    getState: () => ({
      getServiceOnMenu: jest.fn(() => Promise.resolve(true)),
      getClipboardPrompt: jest.fn(() => Promise.resolve('{title}\n{content}')),
    }),
  },
  /* Regex.ts falls back to this when the stored settings hold no denylist */
  DEFAULT_SETTINGS: { extractionDenylist: '' },
}));
jest.mock('@/stores/SettingsStore', () => ({ DEFAULT_SETTINGS: { models: {} } }));
/* The service worker reaches the database through this wrapper, which opens IndexedDB on import; addArticle upserts by URL like the real one */
jest.mock('@/db', () => {
  const articles = new Map<string, any>();
  return {
    db: {
      addArticle: jest.fn(async (article: any) => {
        articles.set('article-id', { ...article, id: 'article-id' });
        return 'article-id';
      }),
      getArticleById: jest.fn(async (id: string) => articles.get(id)),
      getArticleByUrl: jest.fn(async () => undefined),
    },
  };
});
/* A recent last-cleanup date makes the initial cleanup skip the database */
jest.mock('@/stores/ArticleStore', () => ({
  useArticleStore: { getState: () => ({ getLastCleanupDate: jest.fn(() => Promise.resolve(new Date())) }) },
}));

const listenerStub = () => ({ addListener: jest.fn(), removeListener: jest.fn() });

/* The active tab is a chrome:// page, where no content script runs */
const NEW_TAB = { id: 1, windowId: 1, url: 'chrome://newtab/' };

/* Extension pages are outside the <all_urls> content script match, on both browsers */
const CHROME_OPTIONS_TAB = { id: 2, windowId: 1, url: 'chrome-extension://abcdefghijklmnop/options.html' };
const FIREFOX_OPTIONS_TAB = { id: 3, windowId: 1, url: 'moz-extension://abcdefghijklmnop/options.html' };

/* An ordinary page */
const ARTICLE_TAB = { id: 4, windowId: 1, url: 'https://example.com/article' };

/* An in-memory storage.session, which keeps a pending mobile YouTube summary across the page load */
const createSessionStorage = () => {
  const session: Record<string, unknown> = {};
  return {
    get: jest.fn((key: string) => Promise.resolve(key in session ? { [key]: session[key] } : {})),
    set: jest.fn((items: Record<string, unknown>) => Promise.resolve(void Object.assign(session, items))),
    remove: jest.fn((key: string) => Promise.resolve(void delete session[key])),
  };
};

const createChromeMock = () => ({
  tabs: {
    query: jest.fn(() => Promise.resolve([NEW_TAB])),
    get: jest.fn(() => Promise.resolve(NEW_TAB)),
    create: jest.fn(() => Promise.resolve(NEW_TAB)),
    update: jest.fn(() => Promise.resolve(NEW_TAB)),
    /* No content script answers by default, as on a page open before the extension was installed */
    sendMessage: jest.fn(() => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'))),
    onActivated: listenerStub(),
    onUpdated: listenerStub(),
  },
  runtime: {
    onMessage: listenerStub(),
    sendMessage: jest.fn(() => Promise.resolve(undefined)),
  },
  contextMenus: {
    create: jest.fn(),
    removeAll: jest.fn(),
    onClicked: listenerStub(),
  },
  offscreen: {
    hasDocument: jest.fn(() => Promise.resolve(false)),
    closeDocument: jest.fn(() => Promise.resolve()),
    createDocument: jest.fn(() => Promise.resolve()),
  },
  alarms: {
    clear: jest.fn(() => Promise.resolve(true)),
    create: jest.fn(() => Promise.resolve()),
    onAlarm: listenerStub(),
  },
  action: {
    setIcon: jest.fn(() => Promise.resolve()),
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  },
  storage: {
    local: { get: jest.fn(() => Promise.resolve({})) },
    session: createSessionStorage(),
  },
});

type ChromeMock = ReturnType<typeof createChromeMock>;

/* Let the promise chains started by the module-level ServiceWorker settle */
const flushPromises = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => {
  for (let i = 0; i < 5; i++) await flushPromises();
};

/* Make the content script answer EXTRACT_ARTICLE with the given results in turn (the last one repeats), and acknowledge every other message */
const answerExtraction = (chromeMock: Pick<ChromeMock, 'tabs'>, ...results: Array<{ isSuccess: boolean; content?: string }>) => {
  chromeMock.tabs.sendMessage.mockImplementation(((tabId: number, message: { action: string; payload: { tabUrl: string } }) => {
    if (message.action !== 'EXTRACT_ARTICLE') return Promise.resolve({ success: true });
    const { isSuccess, content = 'content' } = results.length > 1 ? results.shift()! : results[0];
    const url = message.payload.tabUrl;
    return Promise.resolve({ success: true, payload: { tabId, tabUrl: url, result: { isSuccess, url, title: 'title', content, error: null } } });
  }) as any);
};

/* The theme service registers its own listener from a class field, so the service worker's is the last one */
const sendToServiceWorker = async (chromeMock: Pick<ChromeMock, 'runtime'>, message: unknown) => {
  const listener = chromeMock.runtime.onMessage.addListener.mock.calls.at(-1)![0] as (message: unknown, sender: unknown, sendResponse: unknown) => Promise<void>;
  await listener(message, {}, jest.fn());
  await settle();
};

/* Replay a finished page load through the listener the service worker registered */
const loadTab = async (chromeMock: Pick<ChromeMock, 'tabs'>, tab: { id: number; windowId: number; url: string }) => {
  chromeMock.tabs.get.mockImplementation(() => Promise.resolve(tab) as any);
  chromeMock.tabs.query.mockImplementation(() => Promise.resolve([tab]) as any);
  const handleTabUpdated = chromeMock.tabs.onUpdated.addListener.mock.calls[0][0] as (tabId: number, changeInfo: { status: string }, tab: unknown) => Promise<void>;
  await handleTabUpdated(tab.id, { status: 'complete' }, tab);
  await settle();
};

const extractionRequests = (chromeMock: Pick<ChromeMock, 'tabs'>) =>
  chromeMock.tabs.sendMessage.mock.calls.filter(([, message]: any[]) => message?.action === 'EXTRACT_ARTICLE');

const aiServiceTabs = (chromeMock: Pick<ChromeMock, 'tabs'>) =>
  chromeMock.tabs.create.mock.calls.filter(([options]: any[]) => String(options?.url).includes('chatgpt.com'));

describe('ServiceWorker startup', () => {
  let chromeMock: ChromeMock;

  beforeEach(async () => {
    /* Fake timers stop a retry loop from running on; setImmediate stays real to flush promises */
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    chromeMock = createChromeMock();
    (globalThis as any).chrome = chromeMock;
    jest.resetModules();

    /* The module instantiates ServiceWorker on import */
    await import('@/pages/ServiceWorker');
    await flushPromises();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).chrome;
  });

  it('starts theme detection without waiting for a content script', () => {
    expect(chromeMock.offscreen.createDocument).toHaveBeenCalledWith(expect.objectContaining({ url: 'offscreen.html' }));
  });

  it('registers the database cleanup alarm without waiting for a content script', () => {
    expect(chromeMock.alarms.create).toHaveBeenCalledWith('cleanup-db', expect.anything());
  });
});

describe('ServiceWorker tab updates', () => {
  let chromeMock: ChromeMock;

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    chromeMock = createChromeMock();
    (globalThis as any).chrome = chromeMock;
    jest.resetModules();

    await import('@/pages/ServiceWorker');
    await flushPromises();
    answerExtraction(chromeMock, { isSuccess: true });
    chromeMock.tabs.sendMessage.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).chrome;
  });

  it('does not ask the content script to extract on the Chrome extension pages', async () => {
    await loadTab(chromeMock, CHROME_OPTIONS_TAB);
    expect(extractionRequests(chromeMock)).toHaveLength(0);
  });

  it('does not ask the content script to extract on the Firefox extension pages', async () => {
    await loadTab(chromeMock, FIREFOX_OPTIONS_TAB);
    expect(extractionRequests(chromeMock)).toHaveLength(0);
  });

  it('does not ask the content script to extract when an ordinary page finishes loading', async () => {
    await loadTab(chromeMock, ARTICLE_TAB);
    expect(extractionRequests(chromeMock)).toHaveLength(0);
  });
});

describe('ServiceWorker summarizing a page', () => {
  let chromeMock: ChromeMock;
  let db: { addArticle: jest.Mock; getArticleById: jest.Mock };

  const SETTINGS = { 'free-ai-summarizer-settings': { state: { tabBehavior: 'NEW_TAB' } } };

  const summarize = () =>
    sendToServiceWorker(chromeMock, { action: 'OPEN_AI_SERVICE', payload: { service: 'CHATGPT', tabId: ARTICLE_TAB.id, tabUrl: ARTICLE_TAB.url } });

  const copyToClipboard = () =>
    sendToServiceWorker(chromeMock, { action: 'READ_ARTICLE_FOR_CLIPBOARD', payload: { tabId: ARTICLE_TAB.id, tabUrl: ARTICLE_TAB.url } });

  const clipboardWrites = () => chromeMock.tabs.sendMessage.mock.calls.filter(([, message]: any[]) => message?.action === 'WRITE_ARTICLE_TO_CLIPBOARD');

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    chromeMock = createChromeMock();
    chromeMock.storage.local.get.mockImplementation(() => Promise.resolve(SETTINGS) as any);
    chromeMock.tabs.get.mockImplementation(() => Promise.resolve(ARTICLE_TAB) as any);
    (globalThis as any).chrome = chromeMock;
    jest.resetModules();

    await import('@/pages/ServiceWorker');
    await flushPromises();
    /* The same module instance the service worker imported, since the registry was reset above */
    db = (await import('@/db')).db as any;
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).chrome;
  });

  it('extracts the page and opens the AI service with the stored article', async () => {
    answerExtraction(chromeMock, { isSuccess: true });
    await summarize();
    expect(extractionRequests(chromeMock)).toHaveLength(1);
    expect(db.addArticle).toHaveBeenCalledWith(expect.objectContaining({ url: ARTICLE_TAB.url, content: 'content', is_success: true }));
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: expect.stringContaining('article-id') });
  });

  it('does not open the AI service when the extraction fails', async () => {
    answerExtraction(chromeMock, { isSuccess: false });
    await summarize();
    expect(db.addArticle).not.toHaveBeenCalled();
    expect(aiServiceTabs(chromeMock)).toHaveLength(0);
  });

  it('does not open the AI service when the page has no content script', async () => {
    await expect(summarize()).resolves.toBeUndefined();
    expect(aiServiceTabs(chromeMock)).toHaveLength(0);
  });

  /* A page that renders its body after the load event (jp.wsj.com) must not be summarized from a stale extraction */
  it('extracts the page again for every summary', async () => {
    answerExtraction(chromeMock, { isSuccess: true, content: 'Only the copyright notice' }, { isSuccess: true, content: 'The full article' });
    await summarize();
    await summarize();
    expect(extractionRequests(chromeMock)).toHaveLength(2);
    expect(db.addArticle).toHaveBeenLastCalledWith(expect.objectContaining({ content: 'The full article' }));
  });

  it('extracts the page and writes it to the clipboard', async () => {
    answerExtraction(chromeMock, { isSuccess: true, content: 'The full article' });
    await copyToClipboard();
    expect(extractionRequests(chromeMock)).toHaveLength(1);
    expect(clipboardWrites()).toHaveLength(1);
    expect(clipboardWrites()[0][1].payload.text).toBe('title\nThe full article');
  });

  it('does not write to the clipboard when the extraction fails', async () => {
    answerExtraction(chromeMock, { isSuccess: false });
    await copyToClipboard();
    expect(clipboardWrites()).toHaveLength(0);
  });
});

describe('ServiceWorker summarizing a mobile YouTube video', () => {
  let chromeMock: Omit<ChromeMock, 'contextMenus'> & { contextMenus?: unknown };

  const MOBILE_URL = 'https://m.youtube.com/watch?v=arj7oStGLkU';
  const DESKTOP_URL = 'https://www.youtube.com/watch?v=arj7oStGLkU&app=desktop';
  const YOUTUBE_TAB_ID = 5;
  const SETTINGS = { 'free-ai-summarizer-settings': { state: { tabBehavior: 'NEW_TAB' } } };

  const openAIService = () =>
    sendToServiceWorker(chromeMock, { action: 'OPEN_AI_SERVICE', payload: { service: 'CHATGPT', tabId: YOUTUBE_TAB_ID, tabUrl: MOBILE_URL } });

  /* Replay a finished page load in the YouTube tab, whose extraction ends with the given result */
  const loadYoutubeTab = async (url: string, isSuccess: boolean) => {
    answerExtraction(chromeMock, { isSuccess });
    await loadTab(chromeMock, { id: YOUTUBE_TAB_ID, windowId: 1, url });
  };

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    chromeMock = createChromeMock();
    chromeMock.storage.local.get.mockImplementation(() => Promise.resolve(SETTINGS) as any);
    /* Firefox for Android has no contextMenus API, which also keeps the menu rebuild from waiting on the fake timers */
    delete chromeMock.contextMenus;
    (globalThis as any).chrome = chromeMock;
    jest.resetModules();

    await import('@/pages/ServiceWorker');
    await flushPromises();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).chrome;
  });

  it('reloads the video in the desktop layout instead of opening the AI service', async () => {
    await openAIService();
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(YOUTUBE_TAB_ID, { url: DESKTOP_URL });
    expect(extractionRequests(chromeMock)).toHaveLength(0);
    expect(aiServiceTabs(chromeMock)).toHaveLength(0);
  });

  it('opens the AI service once the transcript is extracted in the desktop layout', async () => {
    await openAIService();
    await loadYoutubeTab(DESKTOP_URL, true);
    expect(aiServiceTabs(chromeMock)).toHaveLength(1);
  });

  it('opens the AI service only once', async () => {
    await openAIService();
    await loadYoutubeTab(DESKTOP_URL, true);
    await loadYoutubeTab(DESKTOP_URL, true);
    expect(aiServiceTabs(chromeMock)).toHaveLength(1);
  });

  it('does not open the AI service when the extraction fails', async () => {
    await openAIService();
    await loadYoutubeTab(DESKTOP_URL, false);
    await loadYoutubeTab(DESKTOP_URL, true);
    expect(aiServiceTabs(chromeMock)).toHaveLength(0);
  });

  it('does not open the AI service for another page loaded in the tab', async () => {
    await openAIService();
    await loadYoutubeTab('https://www.youtube.com/watch?v=dQw4w9WgXcQ', true);
    expect(aiServiceTabs(chromeMock)).toHaveLength(0);
  });
});

describe('ServiceWorker opening an AI service in a private tab', () => {
  let chromeMock: ChromeMock & { windows?: unknown };

  /* The private tab is the stored behavior in every test here */
  const SETTINGS = { 'free-ai-summarizer-settings': { state: { tabBehavior: 'NEW_PRIVATE_TAB' } } };

  const openAIService = () =>
    sendToServiceWorker(chromeMock, { action: 'OPEN_AI_SERVICE', payload: { service: 'CHATGPT', tabId: ARTICLE_TAB.id, tabUrl: ARTICLE_TAB.url } });

  const startServiceWorker = async (windows?: unknown) => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    chromeMock = createChromeMock();
    chromeMock.storage.local.get.mockImplementation(() => Promise.resolve(SETTINGS) as any);
    chromeMock.tabs.get.mockImplementation(() => Promise.resolve(ARTICLE_TAB) as any);
    if (windows) chromeMock.windows = windows;
    (globalThis as any).chrome = chromeMock;
    jest.resetModules();

    await import('@/pages/ServiceWorker');
    await flushPromises();
    answerExtraction(chromeMock, { isSuccess: true });
  };

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).chrome;
  });

  it('opens an ordinary tab where the windows API is missing', async () => {
    await startServiceWorker();
    await openAIService();
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: expect.stringContaining('chatgpt.com') });
  });

  it('opens a private window where the windows API exists', async () => {
    const windows = { getAll: jest.fn(() => Promise.resolve([])), create: jest.fn(() => Promise.resolve({})) };
    await startServiceWorker(windows);
    await openAIService();
    expect(windows.create).toHaveBeenCalledWith({ url: expect.stringContaining('chatgpt.com'), incognito: true });
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/pages/__tests__/ServiceWorker.test.ts`
Expected: FAIL — at least `does not ask the content script to extract when an ordinary page finishes loading` (1 request instead of 0), `extracts the page and opens the AI service with the stored article`, `extracts the page again for every summary` (0 requests instead of 2), `extracts the page and writes it to the clipboard`, and the mobile YouTube and private tab tests that expect an AI service tab (the old flow looks the article up by URL and finds nothing)

- [ ] **Step 3: Rewrite the extraction flow in `src/pages/ServiceWorker.ts`**

Imports: change the stores import to `import { useSettingsStore } from '@/stores';`, and remove `ContentExtractionTiming` from the `@/types` import (add `ArticleExtractionResult` and `MessageResponse` if not present; keep the rest). `ArticleRecord` from `@/db` stays.

`handleTabActivated`: delete the last two lines

```ts
    /** Notify the current tab state to the content script */
    this.notifyCurrentTabState(activeInfo.tabId, tab.url);
```

`handleTabUpdated`: replace the part from `/** Execute the extraction */` to the end of the method with:

```ts
    /** Update the UI state */
    this.toggleUIState(tabId, tab.url);

    /** Inject the article into an AI service tab, or resume a mobile YouTube summary held for this page */
    if (isAIServiceUrl(tab.url)) {
      this.executeInjection(tabId, tab.url);
    } else {
      this.openPendingAIService(tabId, tab.url);
    }
  }
```

`handleServiceWorkerMessage`: delete the `case MessageAction.EXTRACT_ARTICLE:` block (its two lines and `break;`), and change the clipboard case call to `await this.readArticleForClipboard(message.payload.tabId, message.payload.tabUrl);`.

`handleContextMenuClicked`: change `this.readArticleForClipboard(tab.id, tab.url, true);` to `this.readArticleForClipboard(tab.id, tab.url);`.

Delete the whole `executeExtraction` method (with its doc comment) and put this method in its place:

```ts
  /**
   * Ask the content script to extract the page, and store the result
   * @param tabId - The ID of the tab
   * @param tabUrl - The URL of the tab
   * @returns The ID of the stored article, or null when the extraction failed
   */
  async extractAndStore(tabId: number, tabUrl: string): Promise<string | null> {
    logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[extractAndStore]', 'tabId:', tabId, 'tabUrl:', tabUrl);
    try {
      const response: MessageResponse | undefined = await chrome.tabs.sendMessage(tabId, {
        action: MessageAction.EXTRACT_ARTICLE,
        payload: { tabId: tabId, tabUrl: tabUrl },
      });
      const result: ArticleExtractionResult | undefined = response?.payload?.result;
      if (!response?.success || !result?.isSuccess) {
        /* The content script has already shown the failure toast */
        logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[extractAndStore]', 'Extraction failed:', tabUrl, result?.error);
        return null;
      }
      return await db.addArticle({
        url: result.url ?? tabUrl,
        title: result.title,
        content: result.content,
        date: new Date(),
        is_success: true,
      });
    } catch (error: unknown) {
      /* No content script in the tab, e.g. a page open before the extension was installed or updated: nothing can show a toast there */
      logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[extractAndStore]', 'Failed to extract the page:', tabUrl, error);
      return null;
    }
  }
```

Replace the whole `openPendingAIService` method (with its doc comment) with:

```ts
  /**
   * Open the AI service that openAIService put on hold while the tab reloads a mobile YouTube video
   * in the desktop layout. The hold is kept in storage.session because the background page of
   * Firefox is an event page, which may be unloaded during the reload
   * @param tabId - The ID of the tab
   * @param tabUrl - The URL of the loaded page
   */
  async openPendingAIService(tabId: number, tabUrl: string) {
    try {
      const key = getPendingAIServiceKey(tabId);
      const pending: PendingAIService | undefined = (await chrome.storage.session.get(key))[key];
      if (!pending || pending.url !== tabUrl) return;

      /** Release the hold before extracting, so that a failed extraction is not retried on the next load */
      await chrome.storage.session.remove(key);
      await this.openAIService(pending.service, tabId, tabUrl);
    } catch (error: any) {
      logger.error('🧑‍🍳📃', '[ServiceWorker.ts]', '[openPendingAIService]', 'Failed to open the pending AI service:', error);
    }
  }
```

In `openAIService`, replace

```ts
      /** Get the article from the database */
      const article = await db.getArticleByUrl(tabUrl);
      if (!article?.is_success) {
        logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[openAIService]', 'Article not found', tabUrl);
        return false;
      }
```

with

```ts
      /** Extract the page now, so that content rendered after the load event is included */
      const articleId = await this.extractAndStore(tabId, tabUrl);
      if (!articleId) return false;
```

and change `getSummarizeUrl(service, article.id.toString(), model)` to `getSummarizeUrl(service, articleId, model)`.

In `toggleUIState`, replace the body of the method (everything inside it) with:

```ts
    try {
      logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[toggleUIState]');

      /** Check if the tab exists before proceeding */
      if (!(await chrome.tabs.get(tabId).catch(() => null))) {
        logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[toggleUIState]', 'Tab not found:', tabId);
        return;
      }

      /** Rebuild the context menu, whose items depend on the URL */
      await this.contextMenuService.createMenu(tabUrl);
    } catch (error: any) {
      logger.error('🧑‍🍳📃', '[ServiceWorker.ts]', '[toggleUIState]', 'Failed to create context menu:', error);
    }
```

Change the doc comment above `toggleUIState` from `Reload the article extraction state` to `Update the context menu for the tab`.

Delete the whole `notifyCurrentTabState` method (with its doc comment).

Replace the whole `readArticleForClipboard` method (with its doc comment) with:

```ts
  /**
   * Extract the page and write it to the clipboard with the clipboard prompt
   * @param tabId - The ID of the tab
   * @param tabUrl - The URL of the tab
   * @returns Whether the article was sent to the content script for writing
   */
  async readArticleForClipboard(tabId: number, tabUrl: string): Promise<boolean> {
    logger.debug('🧑‍🍳📃', '[ServiceWorker.ts]', '[readArticleForClipboard]', 'tabId:', tabId, 'tabUrl:', tabUrl);
    try {
      /** Check if the tab exists before proceeding */
      if (!(await chrome.tabs.get(tabId).catch(() => null))) {
        logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[readArticleForClipboard]', 'Tab not found:', tabId);
        return false;
      }

      const articleId = await this.extractAndStore(tabId, tabUrl);
      if (!articleId) return false;
      const article: ArticleRecord | undefined = await db.getArticleById(articleId);
      if (!article) {
        logger.warn('🧑‍🍳📃', '[ServiceWorker.ts]', '[readArticleForClipboard]', 'Stored article not found:', articleId);
        return false;
      }

      /** Copy the article to the clipboard */
      const prompt = await useSettingsStore.getState().getClipboardPrompt();
      const text = formatArticleForClipboard(article, prompt);
      await chrome.tabs
        .sendMessage(tabId, {
          action: MessageAction.WRITE_ARTICLE_TO_CLIPBOARD,
          payload: { tabId: tabId, tabUrl: tabUrl, text: text },
        })
        .then(response => {
          logger.debug('🧑‍🍳📃🔵', '[ServiceWorker.ts]', '[readArticleForClipboard]', 'response:', response);
        })
        .catch(error => {
          logger.warn('🧑‍🍳📃🔴', '[ServiceWorker.ts]', '[readArticleForClipboard]', 'Failed to send message to content script:', error);
        });
      return true;
    } catch (error: any) {
      logger.error('🧑‍🍳📃', '[ServiceWorker.ts]', '[readArticleForClipboard]', 'Failed to read article for clipboard:', error);
      return false;
    }
  }
```

- [ ] **Step 4: Remove `TAB_UPDATED` and the unused tab state of the content script**

In `src/types/Message.ts`, delete the line `TAB_UPDATED = 'TAB_UPDATED',`.

In `src/features/content/hooks/useContentMessage.ts`:
- Delete the three state lines `const [currentTabId, setCurrentTabId] = ...`, `const [currentTabUrl, setCurrentTabUrl] = ...`, `const [currentArticle, setCurrentArticle] = ...`, and change the React import to `import { useEffect, useRef } from 'react';`
- Delete the whole `case MessageAction.TAB_UPDATED:` block (to its `break;`)
- In the `EXTRACT_ARTICLE` case from Task 2, delete the `/** Update the current tab state */` comment and the three `setCurrent*` lines
- Change the last line of the hook from `return { currentArticle, currentTabId, currentTabUrl };` to nothing (delete it), and update the hook's doc comment to `Hook for handling Chrome extension messages; registers the listener for the lifetime of the component`
- Remove `ArticleExtractionResult` from the `@/types` import only if the type checker reports it unused (it is still used in the `EXTRACT_ARTICLE` `.then` callback)

Replace `src/features/content/contexts/ContentContext.tsx` so that the context holds only the settings. Change the value interface and its doc comment to:

```tsx
/**
 * The context value type for ContentContext.
 *
 * @property settings - The settings data.
 */
interface ContentContextValue {
  settings: SettingsState;
}
```

remove the `ArticleExtractionResult` import, and change the provider body to:

```tsx
  /* Registers the message listener of the content script */
  useContentMessage();
  /*
   * Expose the live store rather than a snapshot copy kept in React state: the content
   * script receives no settings updates, so a copy would freeze at the pre-hydration
   * defaults. Consumers must read values through the async getters, which go to
   * chrome.storage.
   */
  const settings = useSettingsStore.getState();

  /*******************************************************
   * Exported Value
   *******************************************************/

  const value = useMemo(() => ({ settings }), [settings]);
```

(keep the `State Management` banner comment above it).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all suites)

Run: `pnpm type-check`
Expected: no errors. If `useArticleStore` or `STORAGE_KEYS` is reported unused in `ServiceWorker.ts`, remove that import (`STORAGE_KEYS` is still used in `openAIService`)

- [ ] **Step 6: Commit**

```bash
git add src/pages/ServiceWorker.ts src/pages/__tests__/ServiceWorker.test.ts src/types/Message.ts src/features/content/hooks/useContentMessage.ts src/features/content/contexts/ContentContext.tsx
git commit -m "feat: extract the page only when the user summarizes or copies it"
```

---

### Task 5: Remove the extraction settings

**Files:**
- Delete: `src/types/ContentExtractionTiming.ts`
- Modify: `src/types/index.ts`
- Modify: `src/stores/SettingsStore.ts`
- Modify: `src/stores/GlobalContext.tsx`
- Modify: `src/utils/Regex.ts`
- Modify: `src/features/options/components/main/OptionsMain.tsx`
- Modify: `src/pages/__tests__/ServiceWorker.test.ts` (drop the `DEFAULT_SETTINGS` mock line)
- Test: `src/utils/__tests__/regex.test.ts`, `src/stores/__tests__/SettingsStore.test.ts`

**Interfaces:**
- Produces: `SettingsState` without `contentExtractionTiming`, `extractionDenylist`, `saveArticleOnClipboard`, `isShowMessage`, `isShowBadge`; `isInvalidUrl(url?: string): Promise<boolean>` no longer consults a denylist (still async so callers stay unchanged)

- [ ] **Step 1: Write the failing tests**

In `src/utils/__tests__/regex.test.ts`, change the utils import to include `isInvalidUrl`:

```ts
import { escapeRegExp, escapeRegExpArray, getDesktopYoutubeUrl, isAIServiceUrl, isExtractionDenylistUrl, isInvalidUrl } from '@/utils';
```

and add this block right after the `describe('getDesktopYoutubeUrl', ...)` block:

```ts
  describe('isInvalidUrl', () => {
    beforeEach(() => {
      storageGetMock.mockResolvedValue({});
    });

    /* The user asked for the summary, so no site is refused any more */
    it('accepts pages the extraction denylist used to block', async () => {
      expect(await isInvalidUrl('https://www.amazon.co.jp/dp/B0DEXAMPLE')).toBe(false);
      expect(await isInvalidUrl('https://www.google.com/search?q=summary')).toBe(false);
    });

    it('rejects AI service, browser, extension and non-http pages', async () => {
      expect(await isInvalidUrl('https://chatgpt.com/')).toBe(true);
      expect(await isInvalidUrl('chrome://newtab/')).toBe(true);
      expect(await isInvalidUrl('moz-extension://abcdefghijklmnop/options.html')).toBe(true);
      expect(await isInvalidUrl(undefined)).toBe(true);
    });
  });
```

In `src/stores/__tests__/SettingsStore.test.ts`:
- Add imports `import { DEFAULT_SETTINGS } from '@/stores/SettingsStore';` (merge into the existing `useSettingsStore` import) and `import { TabBehavior } from '@/types';`
- Replace the test `persists a changed setting` with:

```ts
  it('persists a changed setting', async () => {
    await flushStorage();

    await useSettingsStore.getState().setTabBehavior(TabBehavior.CURRENT_TAB);
    await flushStorage();

    expect(geckoStorage[STORAGE_KEYS.SETTINGS]?.state?.tabBehavior).toBe(TabBehavior.CURRENT_TAB);
  });
```

- Add at the end of the `describe` block:

```ts
  /* Backups exported before the extraction settings were removed still hold them */
  it('imports a backup that still holds the removed extraction settings', async () => {
    await flushStorage();
    const backup = {
      version: '0.3.3',
      settings: {
        prompt: DEFAULT_SETTINGS.prompts,
        clipboardPrompt: 'Backup prompt {content}',
        tabBehavior: 'NEW_TAB',
        contentExtractionTiming: 'AUTOMATIC',
        extractionDenylist: 'example\\.com',
        saveArticleOnClipboard: true,
        isShowMessage: true,
        isShowBadge: true,
      },
    };
    const file = { text: async () => JSON.stringify(backup) } as unknown as File;

    await expect(useSettingsStore.getState().importSettings(file)).resolves.toEqual({ success: true });
    await flushStorage();

    const stored = geckoStorage[STORAGE_KEYS.SETTINGS]?.state;
    expect(stored?.clipboardPrompt).toBe('Backup prompt {content}');
    for (const key of ['contentExtractionTiming', 'extractionDenylist', 'saveArticleOnClipboard', 'isShowMessage', 'isShowBadge']) {
      expect(stored).not.toHaveProperty(key);
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/utils/__tests__/regex.test.ts src/stores/__tests__/SettingsStore.test.ts`
Expected: FAIL — `accepts pages the extraction denylist used to block` (Amazon and Google are blocked by the default denylist) and `imports a backup that still holds the removed extraction settings` (the stored state has `extractionDenylist`)

- [ ] **Step 3: Remove the denylist**

In `src/utils/Regex.ts`:
- Delete the whole `isExtractionDenylistUrl` function
- Change `isInvalidUrl` to:

```ts
export const isInvalidUrl = async (url?: string): Promise<boolean> => {
  if (!url) return true;
  return isAIServiceUrl(url) || isBrowserSpecificUrl(url) || !url.startsWith('http');
};
```

- Delete the imports of `STORAGE_KEYS` and `DEFAULT_SETTINGS`, and the `logger` import if nothing else in the file uses it

In `src/utils/__tests__/regex.test.ts`:
- Delete the whole `describe('isExtractionDenylistUrl', ...)` block
- Remove `isExtractionDenylistUrl` from the utils import, and delete the imports of `STORAGE_KEYS` and `DEFAULT_SETTINGS`
- Delete `const storageGetMock = jest.fn();`, the whole `beforeAll(...)` chrome mock, and the `beforeEach` inside `describe('isInvalidUrl', ...)` (nothing reads chrome.storage any more)

In `src/pages/__tests__/ServiceWorker.test.ts`, delete these lines from the `@/stores` mock (the service worker no longer reads the article store, and Regex.ts no longer reads a denylist):

```ts
  useArticleStore: { getState: () => ({ getArticleByUrl: jest.fn(() => Promise.resolve(undefined)) }) },
```

```ts
  /* Regex.ts falls back to this when the stored settings hold no denylist */
  DEFAULT_SETTINGS: { extractionDenylist: '' },
```

- [ ] **Step 4: Remove the settings from the store**

In `src/stores/SettingsStore.ts`:
- Change the types import to `import { AIService, TabBehavior } from '@/types';`
- Change the comment above the `getBrowserLanguage` import to `/* Import directly: DEFAULT_PROMPT calls it at module load, when the @/utils barrel may still be loading (utils/Text imports this store) */`
- In `SettingsState`, delete `contentExtractionTiming`, `extractionDenylist`, `saveArticleOnClipboard`, `isShowMessage`, `isShowBadge`
- In `DEFAULT_SETTINGS`, delete `contentExtractionTiming: ...`, the whole `extractionDenylist: \`...\`,` template literal, `saveArticleOnClipboard: false,`, `isShowMessage: false,`, `isShowBadge: true,`
- In the `SettingsStore` interface, delete `setContentExtractionTiming`, `getContentExtractionTiming`, `setExtractionDenylist`, `getExtractionDenylist`, `setIsShowMessage`, `getIsShowMessage`, `setIsShowBadge`, `getIsShowBadge`, `setSaveArticleOnClipboard`, `getSaveArticleOnClipboard`
- In the store body, delete the ten implementations with those names
- In `exportSettings`, delete the five lines `contentExtractionTiming: ...` through `isShowBadge: ...` from `backupData.settings`
- In `importSettings`, delete the five lines `contentExtractionTiming: ...` through `isShowBadge: ...` from the `updateSettings` call. Older backups that still hold them import fine because the keys are simply not read
- In `restoreSettings`, delete the five lines `contentExtractionTiming: ...` through `isShowBadge: ...`
- In `partialize`, delete the five lines `contentExtractionTiming: ...` through `isShowBadge: ...`. Stored values of these keys drop out on the next write; no `version` / `migrate` is added

Delete `src/types/ContentExtractionTiming.ts`, and delete the line `export * from './ContentExtractionTiming';` from `src/types/index.ts`.

In `src/stores/GlobalContext.tsx`, change the types import to `import { AIService, TabBehavior } from '@/types';` and delete the fifteen interface lines from `contentExtractionTiming: ContentExtractionTiming;` through `getIsShowBadge: () => Promise<boolean>;`.

- [ ] **Step 5: Remove the settings from the options page**

In `src/features/options/components/main/OptionsMain.tsx`:
- Change the React import to `import React, { useCallback, useEffect, useState } from 'react';`
- Change the headlessui import to `import { Field, Input, Tab, TabGroup, TabList, TabPanel, TabPanels, Textarea } from '@headlessui/react';` (`Switch` is only left in a commented-out block)
- In the `@/types` import, delete `ContentExtractionTiming`, `getContentExtractionTimingFromIndex`, `getContentExtractionTimingIndex`, `getContentExtractionTimingLabel`
- In the `useGlobalContext()` destructuring, delete the entries from `/** contentExtractionTiming */` through `setIsShowBadge: setStoredIsShowBadge,`
- Delete the state lines `inputContentExtractionTiming`, `inputIsSaveArticleOnClipboard`, `inputIsShowMessage`, `inputIsShowBadge`, `inputExtractionDenylist` (and the blank line between them)
- Delete the five `useEffect` blocks that initialize those five inputs
- In `saveStoredSettings`, delete the lines from `contentExtractionTiming: getContentExtractionTimingFromIndex(` through `isShowBadge: inputIsShowBadge ?? DEFAULT_SETTINGS.isShowBadge,`, and change its dependency list to `[inputPrompts, inputModels, inputClipboardPrompt, inputTabBehavior]`
- In `unsetInputValues`, delete the five `setInput...(undefined)` lines for those inputs
- Delete the JSX from `{/* Content Extraction */}` through the end of the `Show Badge When Extraction Completes` `</OptionCard>` (the four cards and the denylist block), leaving `{/* Manage Settings */}` right after the `Open AI Service in` card

- [ ] **Step 6: Run the tests and all checks**

Run: `pnpm test`
Expected: PASS (all suites)

Run: `pnpm type-check`
Expected: no errors

Run: `pnpm eslint-check`
Expected: no errors

Run: `pnpm prettier-check`
Expected: no issues. If it reports files, run `pnpm prettier-fix` and re-run `pnpm test`

Run: `grep -rn "ContentExtractionTiming\|extractionDenylist\|saveArticleOnClipboard\|isShowMessage\|isShowBadge\|isExtractionDenylistUrl\|TAB_UPDATED\|notifyCurrentTabState\|executeExtraction" src`
Expected: matches only in `src/stores/__tests__/SettingsStore.test.ts` (the backup fixture and the loop of removed keys)

- [ ] **Step 7: Commit**

```bash
git add -u src
git commit -m "feat: remove the extraction timing, denylist, badge and extraction notice settings"
```

---

### Task 6: Documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-27-on-demand-extraction-design.md` (status line)

- [ ] **Step 1: Update README**

In `README.md`, replace the line `- Extract articles automatically from webpages` with:

```markdown
- Extract the page when you summarize it, so content that loads late is included
```

- [ ] **Step 2: Update CLAUDE.md**

In `CLAUDE.md` under `### Core data flow`, replace items 1 and 2 with:

```markdown
1. Extraction runs only on a user action — an AI service or "Copy to clipboard" in the popup or the context menu. The service worker's `extractAndStore` sends `EXTRACT_ARTICLE` to the content script, which extracts via `src/features/content/extractors/` — `Readability.ts` (web pages), `Youtube.ts` (transcripts), `PDF.ts` (pdfjs-dist; the worker file is copied to `pdf.worker.min.mjs` by webpack), `X.ts` (single post pages of x.com/twitter.com, reading the post out of the DOM because Readability pulls in replies, trends and ads; falls back to Readability when the markup no longer matches). `extractWithProgress` shows an "Extracting…" toast after 500 ms and a failure toast. Page loads do not extract, except to resume a mobile YouTube summary held in `storage.session`
2. The service worker stores the result in IndexedDB (`src/db/Database.ts`, `idb` wrapper, upserted by URL, capped at 200 records, cleaned up by the service worker) and uses the returned article id
```

Item 3 stays as it is.

- [ ] **Step 3: Update the spec status**

In `docs/superpowers/specs/2026-09-27-on-demand-extraction-design.md`, change `Status: Awaiting review` to `Status: Approved (2026-09-27)`.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md docs/superpowers/specs/2026-09-27-on-demand-extraction-design.md
git commit -m "docs: describe on-demand extraction"
```

---

### Task 7: Verification on real browsers

**Files:** none (report only). This task needs the user: claude-in-chrome cannot open `chrome://extensions`, so the user loads the unpacked build.

- [ ] **Step 1: Run every check**

Run each separately: `pnpm test`, `pnpm type-check`, `pnpm eslint-check`, `pnpm prettier-check`, `pnpm build`, `pnpm build:firefox`
Expected: all pass

- [ ] **Step 2: Chrome (dev build, `pnpm dev` → load `dist/dev` unpacked)**

Check and record each result:
- The WSJ article `https://jp.wsj.com/articles/iran-has-a-secret-weapon-in-its-war-with-america-help-from-china-6ca13c80`: summarize with ChatGPT right after the page renders; the injected prompt holds the article body (about 6,000 characters), not the copyright notice
- An ordinary article (for example a Wikipedia page): the AI service opens with no toast
- A YouTube video: "Extracting…" appears, then disappears, then the AI service opens
- A PDF: summarize works
- An X post: summarize works
- "Copy to clipboard" from the popup and from the context menu: "Article copied to clipboard", and the clipboard holds the article
- A page open before reloading the extension: summarize does nothing and nothing breaks
- An `http://` page (`http://neverssl.com/`): toasts work (force a failure with a page that has no readable content, if needed)
- The failure toast: on a page with no readable text (for example `https://www.google.com/`), "Couldn't extract the content of this page"
- Context menu: AI services, separator, "Copy article to clipboard", separator, "Settings"; no "Extract article again"
- Popup: no "Extract article again"
- Options page: the four removed cards are gone; other settings save and reset; export and import work
- Toolbar badge: no ✓ on any page

- [ ] **Step 3: Firefox desktop (`pnpm dev:firefox` → about:debugging → Load Temporary Add-on)**

- Summarize from the popup and from the context menu on an ordinary article
- A YouTube video: "Extracting…", then the AI service opens (Review Focus 3)

- [ ] **Step 4: Firefox for Android (RDP, see the firefox-extension-gotchas memory)**

- Summarize an article from the popup
- A mobile YouTube video: the tab reloads in the desktop layout and the AI service opens once

- [ ] **Step 5: Report**

Report each check as passed or failed with the observed behavior. Do not claim a check that was not run.
