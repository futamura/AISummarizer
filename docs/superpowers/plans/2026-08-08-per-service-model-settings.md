# Per-Service Model Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 要約時に使う AI モデルをサービスごとに設定できるようにする（Claude / AI Studio / ChatGPT は URL パラメータ、Gemini / DeepSeek は injector の DOM 操作、Grok / Perplexity は対象外）。

**Architecture:** `SettingsState.models`（`''` = サービス既定）を追加し、URL パラメータ系は `getSummarizeUrl` が `&model=` を付与、DOM 系は injector がテキスト注入前にモデルピッカーを操作する。モデル選択失敗時も注入は続行する。

**Tech Stack:** TypeScript / React / Zustand / Chrome Extension MV3 / Jest (ts-jest, testEnvironment: node)

**Spec:** `docs/superpowers/specs/2026-08-08-per-service-model-settings-design.md`

## Global Constraints

- パッケージ操作は pnpm。新規依存の追加は禁止（承認が必要なため本計画では追加しない）
- ソースコメントは英語・ブロックコメント (`/* */`) のみ（1 行でも）
- コミットメッセージに `Co-Authored-By` / AI 生成署名を含めない
- 作業ブランチ: `feat/per-service-model-settings`（作成済み。develop へ直接コミット禁止）
- UI 変更は承認済み範囲のみ: Prompt カード改称 + Model セクション追加。他のレイアウト・色・フォント変更禁止
- 各タスク完了時に `pnpm type-check` を通すこと
- テスト実行: `pnpm test`（単一ファイルは `pnpm test <path>`）

---

### Task 1: モデル定義と getSummarizeUrl 拡張（AIService.ts）

**Files:**
- Modify: `src/types/AIService.ts`
- Create: `src/types/__tests__/AIService.test.ts`

**Interfaces:**
- Consumes: 既存 `AIService` enum、`AI_SERVICE_QUERY_KEY`
- Produces:
  - `interface AIServiceModelOption { label: string; value: string }`
  - `getModelOptionsFor(service: AIService): AIServiceModelOption[]`
  - `supportsModelParam(service: AIService): boolean`（CHATGPT / CLAUDE / AI_STUDIO で true）
  - `supportsModelSelection(service: AIService): boolean`（上記 + GEMINI / DEEPSEEK で true）
  - `getSummarizeUrl(service: AIService, summarizeId: string, model?: string): string`

- [ ] **Step 1: Write the failing test**

`src/types/__tests__/AIService.test.ts`:

```ts
import {
  AIService,
  getModelOptionsFor,
  getSummarizeUrl,
  supportsModelParam,
  supportsModelSelection,
} from '@/types/AIService';

describe('supportsModelParam', () => {
  it('returns true only for URL-parameter services', () => {
    expect(supportsModelParam(AIService.CHATGPT)).toBe(true);
    expect(supportsModelParam(AIService.CLAUDE)).toBe(true);
    expect(supportsModelParam(AIService.AI_STUDIO)).toBe(true);
    expect(supportsModelParam(AIService.GEMINI)).toBe(false);
    expect(supportsModelParam(AIService.DEEPSEEK)).toBe(false);
    expect(supportsModelParam(AIService.GROK)).toBe(false);
    expect(supportsModelParam(AIService.PERPLEXITY)).toBe(false);
  });
});

describe('supportsModelSelection', () => {
  it('returns true for param and DOM services, false for excluded services', () => {
    expect(supportsModelSelection(AIService.CHATGPT)).toBe(true);
    expect(supportsModelSelection(AIService.CLAUDE)).toBe(true);
    expect(supportsModelSelection(AIService.AI_STUDIO)).toBe(true);
    expect(supportsModelSelection(AIService.GEMINI)).toBe(true);
    expect(supportsModelSelection(AIService.DEEPSEEK)).toBe(true);
    expect(supportsModelSelection(AIService.GROK)).toBe(false);
    expect(supportsModelSelection(AIService.PERPLEXITY)).toBe(false);
  });
});

describe('getModelOptionsFor', () => {
  it('returns presets for Claude', () => {
    const labels = getModelOptionsFor(AIService.CLAUDE).map(o => o.label);
    expect(labels).toEqual(['Fable 5', 'Opus 5', 'Sonnet 5', 'Haiku 4.5']);
  });

  it('returns empty presets for ChatGPT (custom only)', () => {
    expect(getModelOptionsFor(AIService.CHATGPT)).toEqual([]);
  });

  it('returns DOM labels for Gemini and DeepSeek', () => {
    expect(getModelOptionsFor(AIService.GEMINI).map(o => o.value)).toEqual(['Flash-Lite', 'Flash', 'Pro']);
    expect(getModelOptionsFor(AIService.DEEPSEEK).map(o => o.value)).toEqual(['Instant', 'Expert', 'Vision']);
  });
});

describe('getSummarizeUrl', () => {
  it('keeps existing URL shape when model is omitted', () => {
    expect(getSummarizeUrl(AIService.CLAUDE, '42')).toBe('https://claude.ai/new?aismid=42');
  });

  it('appends model parameter for param-supported services', () => {
    expect(getSummarizeUrl(AIService.CLAUDE, '42', 'claude-opus-5')).toBe('https://claude.ai/new?aismid=42&model=claude-opus-5');
    expect(getSummarizeUrl(AIService.AI_STUDIO, '42', 'gemini-3.1-pro-preview')).toBe(
      'https://aistudio.google.com/prompts/new_chat?aismid=42&model=gemini-3.1-pro-preview'
    );
    expect(getSummarizeUrl(AIService.CHATGPT, '42', 'gpt-5.2')).toBe('https://chatgpt.com/?aismid=42&model=gpt-5.2');
  });

  it('ignores model for DOM-operated and excluded services', () => {
    expect(getSummarizeUrl(AIService.GEMINI, '42', 'Pro')).toBe('https://gemini.google.com/app?aismid=42');
    expect(getSummarizeUrl(AIService.GROK, '42', 'anything')).toBe('https://grok.com/?aismid=42');
  });

  it('ignores empty-string model', () => {
    expect(getSummarizeUrl(AIService.CLAUDE, '42', '')).toBe('https://claude.ai/new?aismid=42');
  });

  it('URL-encodes the model value', () => {
    expect(getSummarizeUrl(AIService.CHATGPT, '42', 'a b&c')).toBe('https://chatgpt.com/?aismid=42&model=a%20b%26c');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/types/__tests__/AIService.test.ts`
Expected: FAIL（`getModelOptionsFor` 等が未エクスポート）

- [ ] **Step 3: Write minimal implementation**

`src/types/AIService.ts` に追加（既存 `getSummarizeUrl` は置き換え）:

```ts
export interface AIServiceModelOption {
  /* Label shown in the options UI */
  label: string;
  /* URL parameter slug, or the picker label substring for DOM-operated services */
  value: string;
}

const AI_SERVICE_MODEL_OPTIONS: { [key in AIService]: AIServiceModelOption[] } = {
  [AIService.CHATGPT]: [],
  [AIService.GEMINI]: [
    { label: 'Flash-Lite', value: 'Flash-Lite' },
    { label: 'Flash', value: 'Flash' },
    { label: 'Pro', value: 'Pro' },
  ],
  [AIService.AI_STUDIO]: [
    { label: 'Gemini 3 Flash Preview', value: 'gemini-3-flash-preview' },
    { label: 'Gemini 3.1 Pro Preview', value: 'gemini-3.1-pro-preview' },
  ],
  [AIService.CLAUDE]: [
    { label: 'Fable 5', value: 'claude-fable-5' },
    { label: 'Opus 5', value: 'claude-opus-5' },
    { label: 'Sonnet 5', value: 'claude-sonnet-5' },
    { label: 'Haiku 4.5', value: 'claude-haiku-4-5' },
  ],
  [AIService.GROK]: [],
  [AIService.PERPLEXITY]: [],
  [AIService.DEEPSEEK]: [
    { label: 'Instant', value: 'Instant' },
    { label: 'Expert', value: 'Expert' },
    { label: 'Vision', value: 'Vision' },
  ],
};

const MODEL_PARAM_SERVICES: AIService[] = [AIService.CHATGPT, AIService.CLAUDE, AIService.AI_STUDIO];
const MODEL_DOM_SERVICES: AIService[] = [AIService.GEMINI, AIService.DEEPSEEK];

export const getModelOptionsFor = (service: AIService): AIServiceModelOption[] => AI_SERVICE_MODEL_OPTIONS[service];

export const supportsModelParam = (service: AIService): boolean => MODEL_PARAM_SERVICES.includes(service);

export const supportsModelSelection = (service: AIService): boolean =>
  MODEL_PARAM_SERVICES.includes(service) || MODEL_DOM_SERVICES.includes(service);

export const getSummarizeUrl = (service: AIService, summarizeId: string, model?: string) => {
  /* Model is applied via URL parameter only where the service supports it; DOM-operated services handle it in their injector */
  const modelParam = model && supportsModelParam(service) ? `&model=${encodeURIComponent(model)}` : '';
  switch (service) {
    case AIService.CHATGPT:
      return `https://chatgpt.com/?${AI_SERVICE_QUERY_KEY}=${summarizeId}${modelParam}`;
    case AIService.GEMINI:
      return `https://gemini.google.com/app?${AI_SERVICE_QUERY_KEY}=${summarizeId}`;
    case AIService.AI_STUDIO:
      return `https://aistudio.google.com/prompts/new_chat?${AI_SERVICE_QUERY_KEY}=${summarizeId}${modelParam}`;
    case AIService.CLAUDE:
      return `https://claude.ai/new?${AI_SERVICE_QUERY_KEY}=${summarizeId}${modelParam}`;
    case AIService.GROK:
      return `https://grok.com/?${AI_SERVICE_QUERY_KEY}=${summarizeId}`;
    case AIService.PERPLEXITY:
      return `https://www.perplexity.ai/?${AI_SERVICE_QUERY_KEY}=${summarizeId}`;
    case AIService.DEEPSEEK:
      return `https://chat.deepseek.com/?${AI_SERVICE_QUERY_KEY}=${summarizeId}`;
  }
};
```

注意: `encodeURIComponent('a b&c')` は `a%20b%26c` を返す。テスト期待値と一致すること。

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/types/__tests__/AIService.test.ts`
Expected: PASS（全件）

Run: `pnpm type-check`
Expected: エラーなし

- [ ] **Step 5: Commit**

```bash
git add src/types/AIService.ts src/types/__tests__/AIService.test.ts
git commit -m "feat: add per-service model definitions and model URL parameter"
```

---

### Task 2: SettingsStore / GlobalContext に models 追加

**Files:**
- Modify: `src/stores/SettingsStore.ts`
- Modify: `src/stores/GlobalContext.tsx`

**Interfaces:**
- Consumes: Task 1 の型は不要（`AIService` enum のみ）
- Produces:
  - `SettingsState.models: { [key in AIService]: string }`（`''` = サービス既定）
  - `setModelFor(service: AIService, model: string): Promise<void>`
  - `getModelFor(service: AIService): Promise<string>`
  - GlobalContext 経由でも同名メソッドと `models` state を公開

単体テストなし（chrome.* API モックの新規依存が必要になるため。既存リポジトリにも store テストは存在しない）。`pnpm type-check` と Task 6 の実機確認でカバーする。

- [ ] **Step 1: SettingsState / DEFAULT_SETTINGS に models を追加**

`src/stores/SettingsStore.ts`:

```ts
export interface SettingsState {
  prompts: {
    [key in AIService]: string;
  };
  /* Model override per service. Empty string means "use the service's own default" */
  models: {
    [key in AIService]: string;
  };
  /* ...existing fields unchanged... */
}
```

`DEFAULT_SETTINGS` に追加:

```ts
  models: {
    [AIService.CHATGPT]: '',
    [AIService.GEMINI]: '',
    [AIService.AI_STUDIO]: '',
    [AIService.CLAUDE]: '',
    [AIService.GROK]: '',
    [AIService.PERPLEXITY]: '',
    [AIService.DEEPSEEK]: '',
  },
```

- [ ] **Step 2: setModelFor / getModelFor を追加**

`SettingsStore` interface に追加:

```ts
  setModelFor: (service: AIService, model: string) => Promise<void>;
  getModelFor: (service: AIService) => Promise<string>;
```

実装（`setPromptFor` / `getPromptFor` の直後に、同型で）:

```ts
      setModelFor: async (service: AIService, model: string) => {
        await get().updateSettings({
          models: {
            ...get().models,
            [service]: model,
          },
        });
      },
      getModelFor: async (service: AIService) => {
        const settings = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
        return settings[STORAGE_KEYS.SETTINGS]?.state?.models?.[service] ?? DEFAULT_SETTINGS.models[service];
      },
```

- [ ] **Step 3: 送信 payload・export / import / restore に models を追加**

- `sendSettingsUpdate` の payload に `models: settings.models,` を追加
- `exportSettings` の `backupData.settings` に `models: settings.models || {},` を追加
- `importSettings` の `updateSettings({...})` に `models: backupData.settings.models ?? DEFAULT_SETTINGS.models,` を追加（旧バックアップは models キーなし → 既定値）
- `restoreSettings` の `updateSettings({...})` に `models: DEFAULT_SETTINGS.models,` を追加

- [ ] **Step 4: GlobalContext に passthrough を追加**

`src/stores/GlobalContext.tsx` の context 型に追加:

```ts
  models: {
    [key in AIService]: string;
  };
  setModelFor: (service: AIService, model: string) => Promise<void>;
  getModelFor: (service: AIService) => Promise<string>;
```

`prompts` / `setPromptFor` / `getPromptFor` が provider へ渡されている箇所と同じパターンで `models` / `setModelFor` / `getModelFor` を渡す（ファイル内の既存の受け渡し方法に厳密に合わせる）。

- [ ] **Step 5: Verify**

Run: `pnpm type-check`
Expected: エラーなし

Run: `pnpm test`
Expected: 既存テスト全 PASS

- [ ] **Step 6: Commit**

```bash
git add src/stores/SettingsStore.ts src/stores/GlobalContext.tsx
git commit -m "feat: persist per-service model setting in settings store"
```

---

### Task 3: 呼び出し経路で model を引き渡し + タブ URL 検証の頑健化

**Files:**
- Modify: `src/pages/ServiceWorker.ts`（`openAIService` 内、現 317 行付近）
- Modify: `src/features/content/hooks/useContentMessage.ts`（`INJECT_ARTICLE` ハンドラ、現 118-136 行付近）

**Interfaces:**
- Consumes: Task 1 `getSummarizeUrl(service, id, model?)`、`AI_SERVICE_QUERY_KEY`、Task 2 の storage 形状（`state.models`）
- Produces: なし（既存フローの配線変更のみ）

背景: AI サービスタブを開く URL に `&model=` が付くと、`useContentMessage.ts` の「タブ URL と再構築 URL の厳密一致」検証が壊れる。さらに AI Studio は model slug の alias を正規化して URL を書き換えることが実機確認されている（`gemini-3-pro-preview` → `gemini-3.1-pro-preview`）ため、厳密一致は原理的に維持できない。検証の目的は「このタブが該当記事の要約用に開かれたか」の確認なので、`aismid` パラメータ値の一致検証に置き換える。

- [ ] **Step 1: ServiceWorker.ts で model を読んで URL に渡す**

`openAIService` 内、`tabBehavior` を読んでいる箇所（現 315-317 行）を変更:

```ts
      const settings = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      const tabBehavior = settings[STORAGE_KEYS.SETTINGS]?.state?.tabBehavior ?? DEFAULT_SETTINGS.tabBehavior;
      const model = settings[STORAGE_KEYS.SETTINGS]?.state?.models?.[service] ?? DEFAULT_SETTINGS.models[service];
      const summarizeUrl = getSummarizeUrl(service, article.id.toString(), model);
```

- [ ] **Step 2: useContentMessage.ts の URL 検証を aismid 比較に変更**

`INJECT_ARTICLE` ケースの現在のコード:

```ts
            const service = getAIServiceForUrl(message.payload.tabUrl);
            const serviceUrl = getSummarizeUrl(service, message.payload.article.id);
            /* ...debug logs... */
            if (message.payload.tabUrl !== serviceUrl) {
              /* ...warn + sendResponse(false)... */
            }
```

を以下に置き換え:

```ts
            const service = getAIServiceForUrl(message.payload.tabUrl);
            /*
             * Compare only the aismid parameter instead of the full URL: the tab URL may
             * carry a model parameter, and AI Studio rewrites model aliases in the URL,
             * so strict URL equality can no longer be used.
             */
            const tabAismid = new URL(message.payload.tabUrl).searchParams.get(AI_SERVICE_QUERY_KEY);
            if (tabAismid !== String(message.payload.article.id)) {
              logger.warn(
                '🫳💬',
                '[useContentMessage.tsx]',
                '[handleMessage]',
                'Skipping injection: aismid mismatch:',
                tabAismid,
                '!=',
                message.payload.article.id
              );
              sendResponse({ success: false, error: new Error('Invalid service URL') });
              return true;
            }
```

- import から `getSummarizeUrl` を外し、`AI_SERVICE_QUERY_KEY` を追加（`@/types` から）
- `getAIServiceForUrl` が非対応 URL で throw する挙動は既存 try/catch がそのまま処理する

- [ ] **Step 3: Verify**

Run: `pnpm type-check`
Expected: エラーなし

Run: `pnpm test`
Expected: 全 PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/ServiceWorker.ts src/features/content/hooks/useContentMessage.ts
git commit -m "feat: pass model setting to summarize URL and relax tab URL check"
```

---

### Task 4: ArticleInjectionService と Gemini / DeepSeek injector の DOM モデル選択

**Files:**
- Modify: `src/features/content/services/ArticleInjectionService.ts`
- Modify: `src/features/content/hooks/useContentMessage.ts`（`execute` 呼び出し 1 箇所）
- Modify: `src/features/content/injectors/Gemini.ts`
- Modify: `src/features/content/injectors/Deepseek.ts`
- Create: `src/features/content/injectors/__tests__/Gemini.test.ts`

**Interfaces:**
- Consumes: Task 2 GlobalContext の `models`（useContentMessage 内 `settings.models`）
- Produces:
  - `ArticleInjectionService.execute(serviceUrl: string, prompt: string, model?: string): Promise<ArticleInjectionResult>`
  - injector 型: `(prompt: string, model?: string) => Promise<{ success: boolean; error?: Error }>`
  - `matchGeminiModelLabel(itemTexts: string[], model: string): number`（テスト対象の純関数、Gemini.ts から export）

- [ ] **Step 1: Write the failing test（Gemini ラベル照合の純関数）**

`src/features/content/injectors/__tests__/Gemini.test.ts`:

```ts
import { matchGeminiModelLabel } from '@/features/content/injectors/Gemini';

/* Menu item texts as observed on gemini.google.com (2026-08-08) */
const MENU = ['3.5 Flash-Lite すばやく回答を得るのに最適', '3.6 Flash あらゆる場面でサポート', '3.1 Pro 高度な数学とコーディングに最適'];

describe('matchGeminiModelLabel', () => {
  it('matches Pro', () => {
    expect(matchGeminiModelLabel(MENU, 'Pro')).toBe(2);
  });

  it('matches Flash-Lite', () => {
    expect(matchGeminiModelLabel(MENU, 'Flash-Lite')).toBe(0);
  });

  it('matches Flash without hitting Flash-Lite', () => {
    expect(matchGeminiModelLabel(MENU, 'Flash')).toBe(1);
  });

  it('returns -1 when nothing matches', () => {
    expect(matchGeminiModelLabel(MENU, 'Ultra')).toBe(-1);
  });

  it('returns -1 for empty model', () => {
    expect(matchGeminiModelLabel(MENU, '')).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/features/content/injectors/__tests__/Gemini.test.ts`
Expected: FAIL（`matchGeminiModelLabel` 未定義）

- [ ] **Step 3: Gemini.ts にモデル選択を実装**

`src/features/content/injectors/Gemini.ts` に追加:

```ts
/*
 * Find the index of the mode menu item matching the configured model.
 * "Flash" must not match "Flash-Lite", so Flash requires the absence of "Flash-Lite".
 */
export const matchGeminiModelLabel = (itemTexts: string[], model: string): number => {
  if (!model) return -1;
  return itemTexts.findIndex(text => {
    if (model === 'Flash') return text.includes('Flash') && !text.includes('Flash-Lite');
    return text.includes(model);
  });
};

/*
 * Select the model via the mode picker before injecting text.
 * Selectors verified live on 2026-08-08: picker button under bard-mode-switcher,
 * menu items carry data-test-id="bard-mode-option-<hash>" (prefix is stable, hash is not).
 * Any failure is logged and swallowed so the injection itself still proceeds.
 */
async function selectGeminiModel(model: string): Promise<void> {
  try {
    const picker = await waitForElement('bard-mode-switcher button');
    if (!(picker instanceof HTMLElement)) throw new Error('Gemini mode picker not found');
    picker.click();

    /* Wait for the menu to render */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));

    const items = [...document.querySelectorAll('[data-test-id^="bard-mode-option"]')];
    const index = matchGeminiModelLabel(
      items.map(el => el.textContent ?? ''),
      model
    );
    if (index < 0) throw new Error(`Gemini mode option not found for model: ${model}`);

    const item = items[index];
    if (!(item instanceof HTMLElement)) throw new Error('Gemini mode option is not an HTML element');
    item.click();

    /* Wait for the menu to close */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));
  } catch (error: unknown) {
    logger.warn('📕', '[Gemini.tsx]', '[selectGeminiModel]', 'Model selection failed, continuing injection:', error);
  }
}
```

`injectGemini` のシグネチャと冒頭を変更:

```ts
export async function injectGemini(prompt: string, model?: string): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[Gemini.tsx]', '[injectGemini]', 'Injecting article into Gemini', prompt);

    /* Wait for 2 to 3 seconds */
    new Promise(resolve => setTimeout(resolve, getRandomInt(2000, 3000)));

    /* Select the configured model first; failures are non-fatal */
    if (model) await selectGeminiModel(model);

    /* ...existing editor lookup and injection unchanged... */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/features/content/injectors/__tests__/Gemini.test.ts`
Expected: PASS

- [ ] **Step 5: Deepseek.ts にモデル選択を実装**

`src/features/content/injectors/Deepseek.ts` に追加。DeepSeek の新 UI は入力欄上に "Instant" / "Expert" / "Vision" のタブを表示する（2026-08-08 実機確認、英語表記）。タブの DOM 構造は未採取のためテキスト一致で探索する:

```ts
/*
 * Select the model tab (Instant / Expert / Vision) before injecting text.
 * The tab labels are English regardless of locale (verified 2026-08-08); class names
 * are hashed, so the tab is located by exact text match on the deepest element.
 * Any failure is logged and swallowed so the injection itself still proceeds.
 */
async function selectDeepSeekModel(model: string): Promise<void> {
  try {
    const candidates = [...document.querySelectorAll('div, span, button')].filter(
      el => el.childElementCount === 0 && el.textContent?.trim() === model
    );
    const target = candidates[0];
    if (!(target instanceof HTMLElement)) throw new Error(`DeepSeek model tab not found: ${model}`);
    target.click();

    /* Wait for the tab switch to settle */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(500, 1000)));
  } catch (error: unknown) {
    logger.warn('📕', '[DeepSeek.tsx]', '[selectDeepSeekModel]', 'Model selection failed, continuing injection:', error);
  }
}
```

`injectDeepSeek` のシグネチャと冒頭を変更（editor 探索の前に挿入）:

```ts
export async function injectDeepSeek(prompt: string, model?: string): Promise<{ success: boolean; error?: Error }> {
  try {
    logger.debug('📕', '[DeepSeek.tsx]', '[injectDeepSeek]', 'Injecting article into DeepSeek\n', prompt);

    /* Wait for 2 seconds to ensure page is fully loaded */
    await new Promise(resolve => setTimeout(resolve, getRandomInt(2000, 3000)));

    /* Select the configured model first; failures are non-fatal */
    if (model) await selectDeepSeekModel(model);

    /* ...existing editor lookup and injection unchanged... */
```

- [ ] **Step 6: ArticleInjectionService に model を通す**

`src/features/content/services/ArticleInjectionService.ts`:

```ts
const injectors: Record<AIService, (prompt: string, model?: string) => Promise<{ success: boolean; error?: Error }>> = {
  /* ...entries unchanged... */
};
```

```ts
  async execute(serviceUrl: string, prompt: string, model?: string): Promise<ArticleInjectionResult> {
```

injector 呼び出しを `await injector(prompt, model);` に変更。URL パラメータ系 injector（ChatGPT / Claude / AIStudio / Grok / Perplexity）は引数が少ない関数として Record に代入可能なため変更不要。

- [ ] **Step 7: useContentMessage.ts から model を渡す**

`INJECT_ARTICLE` ケースの `execute` 呼び出し（Task 3 変更後のコード）:

```ts
            createPrompt(service, settings, message.payload.article)
              .then(prompt => {
                const model = settings.models?.[service] ?? '';
                injectionService.current.execute(message.payload.tabUrl, prompt, model).then((result: ArticleInjectionResult) => {
                  sendResponse({ success: result.success, error: result.error });
                });
```

- [ ] **Step 8: Verify**

Run: `pnpm test`
Expected: 全 PASS

Run: `pnpm type-check`
Expected: エラーなし

- [ ] **Step 9: Commit**

```bash
git add src/features/content/services/ArticleInjectionService.ts src/features/content/hooks/useContentMessage.ts src/features/content/injectors/Gemini.ts src/features/content/injectors/Deepseek.ts src/features/content/injectors/__tests__/Gemini.test.ts
git commit -m "feat: select model via DOM for Gemini and DeepSeek injectors"
```

---

### Task 5: Options UI（Model セクション）

**Files:**
- Modify: `src/features/options/components/main/OptionsMain.tsx`

**Interfaces:**
- Consumes: Task 1 `getModelOptionsFor` / `supportsModelParam` / `supportsModelSelection`（`@/types` から）、Task 2 GlobalContext の `models` / `setModelFor` / `getModelFor`
- Produces: なし（UI のみ）

承認済み UI 変更: カードタイトル `Prompt` → `AI Service`、各サービスタブ内の textarea 上に Model セクション追加。pill は既存タブ pill と同一クラス構成。

- [ ] **Step 1: state とロード処理を追加**

`useGlobalContext()` の分割代入に追加:

```ts
    /** models */
    models: storedModels,
    setModelFor: setStoredModelFor,
    getModelFor: getStoredModelFor,
```

state（`inputPrompts` の直後）:

```ts
  const [inputModels, setInputModels] = useState<{ [key in AIService]?: string } | undefined>(undefined);
```

ロード用 useEffect（`inputPrompts` の useEffect と同型）:

```ts
  useEffect(() => {
    if (inputModels === undefined) {
      const loadModels = async () => {
        const values: [AIService, string][] = await Promise.all(
          Object.values(AIService).map(async (service: AIService) => [service, await getStoredModelFor(service)] as const)
        );
        setInputModels(Object.fromEntries(values));
      };
      loadModels();
    }
  }, [inputModels, storedModels]);
```

`saveStoredSettings` の `updateSettings({...})` に追加:

```ts
      models: Object.fromEntries(Object.values(AIService).map(service => [service, inputModels?.[service] ?? DEFAULT_SETTINGS.models[service]])) as {
        [key in AIService]: string;
      },
```

`unsetInputValues` に `await setInputModels(undefined);` を追加。

- [ ] **Step 2: カードタイトル変更と Model セクション追加**

`<OptionCard title="Prompt">` → `<OptionCard title="AI Service">`。

各 `TabPanel` 内、`<Field>`（prompt textarea）の前に挿入:

```tsx
                    {supportsModelSelection(service) && (
                      <div className="flex flex-col gap-2">
                        <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Model</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            className={clsx(
                              'rounded-full px-3 py-1 font-semibold',
                              'text-zinc-900 dark:text-zinc-50',
                              'bg-zinc-300 dark:bg-zinc-700',
                              'opacity-30 dark:opacity-30',
                              'hover:opacity-100',
                              (inputModels?.[service] ?? '') === '' && '!bg-blue-600 !opacity-100',
                              'focus:outline-none',
                              'transition-opacity'
                            )}
                            onClick={async () => {
                              setInputModels(prev => ({ ...(prev ?? {}), [service]: '' }));
                              await setStoredModelFor(service, '');
                            }}
                          >
                            Default
                          </button>
                          {getModelOptionsFor(service).map(option => (
                            <button
                              key={option.value}
                              className={clsx(
                                'rounded-full px-3 py-1 font-semibold',
                                'text-zinc-900 dark:text-zinc-50',
                                'bg-zinc-300 dark:bg-zinc-700',
                                'opacity-30 dark:opacity-30',
                                'hover:opacity-100',
                                inputModels?.[service] === option.value && '!bg-blue-600 !opacity-100',
                                'focus:outline-none',
                                'transition-opacity'
                              )}
                              onClick={async () => {
                                setInputModels(prev => ({ ...(prev ?? {}), [service]: option.value }));
                                await setStoredModelFor(service, option.value);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                          {supportsModelParam(service) && (
                            <Input
                              name="custom-model"
                              placeholder="custom model id"
                              className={clsx(
                                'rounded-lg px-3 py-1 text-base/6',
                                'text-zinc-700 dark:text-zinc-300',
                                'bg-zinc-50 dark:bg-zinc-800',
                                'border border-zinc-300 dark:border-none',
                                'focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-700'
                              )}
                              value={
                                getModelOptionsFor(service).some(o => o.value === (inputModels?.[service] ?? '')) ? '' : (inputModels?.[service] ?? '')
                              }
                              onChange={e => {
                                const newValue = e.target.value;
                                setInputModels(prev => ({ ...(prev ?? {}), [service]: newValue }));
                              }}
                              onBlur={async () => {
                                await setStoredModelFor(service, inputModels?.[service] ?? '');
                              }}
                            />
                          )}
                        </div>
                      </div>
                    )}
```

import 追加: `Input` を `@headlessui/react` から、`getModelOptionsFor` / `supportsModelParam` / `supportsModelSelection` を `@/types` から。

custom 入力の表示ルール: 現在値がプリセットのいずれかに一致する場合、テキスト欄は空表示（pill 側がハイライト）。プリセット外の値はテキスト欄に表示され、その間 Default / プリセット pill は非ハイライト。

- [ ] **Step 3: Verify**

Run: `pnpm type-check`
Expected: エラーなし

Run: `pnpm eslint-check`
Expected: エラーなし

Run: `pnpm prettier-check`
Expected: エラーなし（失敗時は `pnpm prettier-fix`）

- [ ] **Step 4: Commit**

```bash
git add src/features/options/components/main/OptionsMain.tsx
git commit -m "feat: add per-service model selection to options UI"
```

---

### Task 6: 実機検証と slug / セレクタ確定

**Files:**
- Modify（必要時のみ）: `src/types/AIService.ts`（slug 修正）、`src/features/content/injectors/Gemini.ts` / `Deepseek.ts`（セレクタ修正）

**Interfaces:**
- Consumes: Task 1-5 の全成果物
- Produces: 検証済みプリセット slug・セレクタ

このタスクはブラウザ実機（claude-in-chrome）とユーザーの目視確認を伴う。自動テストでは代替できない。

- [ ] **Step 1: dev ビルドを作成し拡張を読み込む**

Run: `pnpm dev`（watch 起動）
chrome://extensions → 「Load unpacked」→ `dist/dev`（読み込み済みならリロード）

- [ ] **Step 2: Claude の未検証 slug を確定**

claude-in-chrome で以下 URL を順に開き、モデルピッカー表示（`[data-testid="model-selector-dropdown"]` のテキスト）を確認:

- `https://claude.ai/new?model=claude-opus-5` → 期待: Opus 5
- `https://claude.ai/new?model=claude-haiku-4-5` → 期待: Haiku 4.5

不一致の場合: claude.ai のピッカーメニュー DOM から正しい slug を特定し、`src/types/AIService.ts` の `AI_SERVICE_MODEL_OPTIONS[AIService.CLAUDE]` を修正。`src/types/__tests__/AIService.test.ts` に slug 変更が波及する場合は期待値も更新。

- [ ] **Step 3: E2E 動作確認（設定 → 要約）**

各サービスで: Options で model を設定 → 任意の記事ページで要約実行 → 開いたタブのモデル表示を確認:

- Claude: Opus 5 設定 → ピッカーが Opus 5
- AI Studio: Gemini 3.1 Pro Preview 設定 → Run settings が該当モデル
- Gemini: Pro 設定 → ピッカーが Pro（DOM 選択が効くこと）
- DeepSeek: Expert 設定 → Expert タブ選択状態
- Default 設定 → 従来どおりサービス既定モデル
- モデル選択失敗時（存在しないラベル等）でも注入自体は完了すること

Gemini / DeepSeek でセレクタが実 DOM と合わない場合はここで修正し、`pnpm test` 再実行。

- [ ] **Step 4: 修正があれば commit**

```bash
git add -A
git commit -m "fix: adjust model slugs and selectors after live verification"
```

修正がなければこのステップはスキップ。

- [ ] **Step 5: 最終確認**

Run: `pnpm test`
Run: `pnpm type-check`
Run: `pnpm eslint-check`
Run: `pnpm prettier-check`
Expected: すべてエラーなし

---

## 完了後

`superpowers:finishing-a-development-branch` に従い、ユーザー確認のうえ `develop` へマージする。
