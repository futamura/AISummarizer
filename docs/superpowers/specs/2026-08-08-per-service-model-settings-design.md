# サービス別モデル指定機能 設計書

日付: 2026-08-08
ステータス: レビュー待ち

## 目的

要約実行時に使用する AI モデルをサービスごとに指定できるようにする。例: Claude の要約だけ Opus 5 を使い、普段のチャットは Fable 5 のままにする。

現状、拡張はモデルを一切制御しておらず、各 AI サービスの Web UI が最後に選択していたモデルがそのまま使われる。

## 対象範囲

| サービス | 方式 | 根拠（2026-08-08 ライブ検証） |
|---|---|---|
| Claude | URL パラメータ | `claude.ai/new?model=claude-fable-5` 等で反映確認。タブ単位で効き、アカウント既定を汚さない（非永続） |
| AI Studio | URL パラメータ | `new_chat?model=` で反映確認。alias 解決あり（`gemini-3-pro-preview` → `gemini-3.1-pro-preview`） |
| ChatGPT | URL パラメータ | 未検証（検証アカウントが無料プランでピッカー非表示）。有料プランでの対応報告あり。パラメータ付与は非対応でも無害 |
| Gemini | DOM 操作 | `?model=` 系パラメータは全て無視されることを確認。ピッカー操作でのみ変更可 |
| DeepSeek | DOM 操作 | `?model=` / `?mode=` 無視を確認。Instant / Expert / Vision タブ操作でのみ変更可 |
| Grok | 対象外 | モデルでなく mode 概念（Fast/Auto/Expert/Heavy）。無料アカウントは Fast 固定 |
| Perplexity | 対象外 | モデル選択自体が Pro/Max 課金機能 |

対象外サービスには設定 UI 上モデル欄を表示しない。

## データモデル

`src/stores/SettingsStore.ts` の `SettingsState` に追加:

```ts
models: {
  [key in AIService]: string;
};
```

- 空文字 `''` = 「サービス既定（指定なし）」。デフォルト値は全サービス `''`
- `setModelFor(service, model)` / `getModelFor(service)` を `prompts` の同名メソッドと同型で追加（chrome.storage 直読の async getter パターン、`?? DEFAULT_SETTINGS.models[service]` フォールバック）
- `updateSettings` / `sendSettingsUpdate` の payload に `models` を追加
- `exportSettings` のバックアップ JSON に `models` を追加
- `importSettings`: 旧バックアップ（`models` キーなし）は既定値にフォールバック。migration は行わない（denylist 時の設計判断踏襲）
- `restoreSettings` に `models` リセットを追加

## モデル定義

`src/types/AIService.ts` に追加:

```ts
export interface AIServiceModelOption {
  label: string;   /* UI 表示名 e.g. "Opus 5" */
  value: string;   /* URL param slug または DOM 照合キー */
}

export const getModelOptionsFor = (service: AIService): AIServiceModelOption[] => { ... };
export const supportsModelParam = (service: AIService): boolean => { ... };   /* CHATGPT / CLAUDE / AI_STUDIO */
export const supportsModelSelection = (service: AIService): boolean => { ... }; /* 上記 + GEMINI / DEEPSEEK */
```

プリセット:

| サービス | プリセット (label → value) | custom 自由入力 |
|---|---|---|
| Claude | Fable 5 → `claude-fable-5`(検証済) / Opus 5 → `claude-opus-5`(要検証) / Sonnet 5 → `claude-sonnet-5`(検証済) / Haiku 4.5 → `claude-haiku-4-5`(要検証) | 可 |
| AI Studio | Gemini 3 Flash Preview → `gemini-3-flash-preview` / Gemini 3.1 Pro Preview → `gemini-3.1-pro-preview` | 可 |
| ChatGPT | なし | 可（custom のみ） |
| Gemini | Flash-Lite → `Flash-Lite` / Flash → `Flash` / Pro → `Pro` | 不可 |
| DeepSeek | Instant → `Instant` / Expert → `Expert` / Vision → `Vision` | 不可 |

「要検証」の slug は実装時に claude.ai 実機で確認してから確定する。

## URL 生成の変更

`getSummarizeUrl(service, summarizeId)` に第 3 引数 `model?: string` を追加。`supportsModelParam(service)` かつ model 非空のとき `&model=<encodeURIComponent(model)>` を付与。

呼び出し元は 2 箇所。いずれも `getModelFor(service)` の値を渡す:

- `src/pages/ServiceWorker.ts` (コンテキストメニュー経路)
- `src/features/content/hooks/useContentMessage.ts` (フローティングパネル経路)

## DOM 操作系 injector の変更（Gemini / DeepSeek）

- injector シグネチャを `(prompt: string, model?: string)` に拡張
- `ArticleInjectionService.execute(serviceUrl, prompt)` に model を追加し、injector 呼び出し時に引き渡す（呼び出し元が `getModelFor` で取得）
- URL パラメータ系 injector は model 引数を受けるが無視する（URL 側で処理済みのため）
- Gemini: テキスト注入前にモード選択ボタン（`aria-label` はロケール依存のため使わない。ピッカーボタンの DOM 位置・`bard-mode-switcher` 系の構造セレクタを実装時に実機確認して決定）を開き、メニュー項目ラベルの部分一致（"Pro" / "Flash-Lite" / "Flash"、この順で判定し "Flash" の誤マッチを回避）でクリック
- DeepSeek: テキスト注入前に "Instant" / "Expert" / "Vision" のタブテキスト一致でクリック
- **モデル選択に失敗しても注入は続行**し `logger.warn` のみ。UI 変更でモデル選択が壊れても要約機能自体は動作し続ける

## Options UI（設定画面）

既存「Prompt」カード（`src/features/options/components/main/OptionsMain.tsx`）を拡張:

- カードタイトルを `Prompt` → `AI Service` に変更
- 各サービスタブ内、Prompt textarea の上に `Model` セクションを追加:
  - pill ボタン群: `Default` + プリセット（既存のタブ pill と同スタイル: rounded-full、選択中 `!bg-blue-600`）
  - `supportsModelParam` のサービスのみ、pill 群の末尾に custom 用テキスト入力欄（値がプリセット外なら custom 扱いで入力欄に表示）
  - `supportsModelSelection` が false のサービス（Grok / Perplexity）は Model セクション自体を非表示
- 保存タイミングは prompt と同様（変更時 store 更新、onBlur 保存パターン踏襲）

レイアウトイメージ:

```
┌─ AI Service ────────────────────────┐
│ [ChatGPT] [Gemini] [AI Studio]      │
│ [Claude*] [Grok] [Perplexity] ...   │
│                                     │
│ Model:                              │
│ (● Default) (Fable 5) (Opus 5)      │
│ (Sonnet 5) (Haiku 4.5) [custom___]  │
│                                     │
│ Prompt:                             │
│ ┌─────────────────────────────────┐ │
│ │ Extract each theme from...      │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## エラーハンドリング

- 無効な model slug（URL param 系）: サービス側が無視または既定にフォールバックする想定。拡張側でのバリデーションは行わない（custom 入力はユーザー責任）
- DOM 操作失敗（Gemini / DeepSeek）: warn ログ + 注入続行（前述）
- 旧設定 import: `models` 欠落時は既定値

## テスト

- `SettingsStore`: `models` の get/set・export/import（旧形式フォールバック含む）・restore
- `AIService`: `getSummarizeUrl` の model 付与（param 系 / 非 param 系 / 空文字）、`getModelOptionsFor` / `supportsModelParam` / `supportsModelSelection`
- injector: 既存テストの有無・方針に合わせる（実装時確認）

## 実装順序（概要）

1. `AIService.ts` モデル定義 + `getSummarizeUrl` 拡張（+ テスト）
2. `SettingsStore` に `models` 追加（+ テスト）
3. 呼び出し元 2 箇所で model 引き渡し
4. Gemini / DeepSeek injector の DOM 操作追加（実機セレクタ確認込み）
5. Options UI
6. Claude slug（Opus 5 / Haiku 4.5）実機検証・確定
