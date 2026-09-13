# Firefox 対応 設計書

日付: 2026-09-12
ステータス: 承認済み (2026-09-12)。実装計画作成時の差分を反映済み

## 目的

既存の Chrome 拡張 (Manifest V3) を、同一コードベースから Firefox デスクトップ版向けにもビルド・配布できるようにする。

- 将来の Android ネイティブアプリ (Share Intent) 開発に先立つ、低コストな先行作業として位置付ける
- ブラウザ差分を `src/platform/` に閉じ込める今回の構成は、Android 着手時に行う core 切り出しの前例とする

## 決定事項

| 項目 | 決定 | 理由 |
|---|---|---|
| 対象 | Firefox デスクトップ版のみ正式対応 | Android 版 Firefox は `contextMenus` / sidebar / `windows` が非対応。Android 向けはネイティブアプリでカバーする |
| 配布 | AMO で一般公開 (listed) | 検索・自動更新あり。Chrome Web Store と同じ位置付け |
| リリース | 初回は手動提出、2回目以降は CI から自動提出 | 掲載情報の初期登録は手作業が確実 |
| 分岐方式 | 差分のみ platform モジュールに切り出し、ビルド時に切り替え | 呼び出し側から分岐を消す。使わない実装はバンドルから除去される |
| gecko id | `free-ai-summarizer@futamura.dev` | メールアドレス形式。**公開後は変更不可** |
| Firefox 版の name | `Free AI Summarizer - ChatGPT, Claude, Gemini` (44 文字) | Firefox は manifest の `name` を 45 文字までに制限する (`web-ext lint` の `JSON_INVALID`)。Chrome 版の name は変えない |
| Firefox 版の description | `A free and open-source browser extension that uses AI to summarize web articles. Get instant summaries with just a few clicks.` | manifest.json の説明文は "Chrome Extension" と書いているため。Chrome 版の説明文は変えない |

## 対象外

- Android 版 Firefox への対応
- core (storage / settings / DB) の interface 化。Android の PoC 着手時に行う
- UI の見た目の変更
- プライベートタブ許可の案内 UI。UI 変更にあたるため、README への注意書きのみとする
- 依存パッケージの追加。`web-ext` は CI / ローカルとも `npx web-ext@<固定版>` で実行し、Firefox API の型はローカルの d.ts で賄う

## ブラウザ差分の棚卸し

| 箇所 | Chrome | Firefox |
|---|---|---|
| 設定パネル (`ServiceWorker.ts:156,179`、`PopupMain.tsx:141,162`、`OptionsMain.tsx:277`) | `sidePanel.open` / `setOptions` | `sidebarAction.open` / `close` |
| テーマ検出 (`ServiceWorkerThemeService.ts`) | offscreen document の `matchMedia` | background ページで `matchMedia` を直接使う |
| マニフェスト | `service_worker`、`offscreen`、`side_panel` | `background.scripts`、`sidebar_action`、`gecko` |

`tabs` / `storage` / `runtime` / `alarms` / `contextMenus` / `action` / `windows`、および `PDF.ts` の `runtime.getURL` は、Firefox でも `chrome.*` 名前空間のまま使えるため変更しない。

## ビルド

### スクリプト (`package.json`)

- `dev:firefox`: `TARGET=firefox` で watch 付き開発ビルド。出力先は `dist/firefox-dev`
- `build:firefox`: `TARGET=firefox` で本番ビルド。出力先は `dist/firefox-prod`
- 既存の `dev` / `build` は変更しない。`TARGET` 未指定時は `chrome` とみなし、出力先 `dist/dev` / `dist/prod` も変わらない
- `eslint-check` / `eslint-fix` / `prettier-check` / `prettier-fix` の対象に `build/**/*.ts` を加える。あわせて `eslint.config.js` の `ignores` から `build/**` を外す (外さないと `build/*.ts` が TS パーサなしで解析されて失敗する)

### webpack (`webpack.config.ts`)

- `process.env.TARGET` から `target: 'chrome' | 'firefox'` を決める。それ以外の値ならビルドエラーにする
- `DefinePlugin` で `__TARGET__` を文字列定数として埋め込む。型宣言は `src/types/` の d.ts に `declare const __TARGET__: 'chrome' | 'firefox';` を追加する
- Firefox ビルドでは `offscreen` の entry と、`offscreen.html` 用の HtmlWebpackPlugin を除外する
- `manifest.json` の CopyPlugin transform は、`build/manifest.ts` の関数を呼ぶ形に置き換える

### manifest 変換 (`build/manifest.ts`)

`manifest.json` を唯一のソースとする。Firefox 用 manifest はビルド時に生成し、リポジトリにはコミットしない。version が1箇所に保たれるため、Fastlane の `bump_version` は変更不要。

純粋関数として実装する:

```ts
export const toDevManifest = (manifest: Manifest): Manifest => { ... };      /* dev 用アイコンへの差し替え (既存処理の移設) */
export const toFirefoxManifest = (manifest: Manifest): Manifest => { ... };  /* Firefox 用への変換 */
export const transformManifest = (manifest: Manifest, options: { isDev: boolean; target: Target }): Manifest => { ... };
```

`toFirefoxManifest` の変換内容:

- `name`: `Free AI Summarizer - ChatGPT, Claude, Gemini` に置き換える。Firefox の上限 45 文字に収めるため (Chrome 用の name は 78 文字)
- `description`: "Chrome Extension" を含まない説明文 (`FIREFOX_DESCRIPTION`) に置き換える
- `background`: `{ service_worker, type }` を `{ scripts: ['service-worker.js'] }` に置き換える。ファイル名は webpack の変更を避けるため据え置く
- `permissions`: `offscreen` と `sidePanel` を除く
- `side_panel` を削除し、`sidebar_action` を追加する
  - `default_panel: 'options.html'`
  - `default_title`: manifest の `name` を流用しない。Firefox のサイドバー切り替えメニューに表示されるため、短い `"Free AI Summarizer"` とする
  - `default_icon`: `action.default_icon` と同じもの
  - `open_at_install: false`。既定値の true だとインストール直後にサイドバーが開いてしまう
- `browser_specific_settings.gecko` を追加する
  - `id: 'free-ai-summarizer@futamura.dev'`
  - `strict_min_version: '140.0'`。`data_collection_permissions` をサポートする最小バージョンで、ESR 140 もカバーする。実装時に `web-ext lint` の結果で妥当性を確認する
  - `data_collection_permissions: { required: ['none'] }`
  - **2026-09-13 更新**: AMO の方針調査により `required: ["websiteContent", "browsingActivity"]` に変更 (ページの本文・タイトル・URL をユーザーが選んだ AI サービスへ送るため)。`gecko_android.strict_min_version: "142.0"` も追加

dev ビルドでは `toDevManifest` を適用してから `toFirefoxManifest` を適用する。そのため `sidebar_action.default_icon` にも dev 用アイコンが入る。

### TypeScript 設定

- `tsconfig.json` の `include` に `build/**/*.ts` を追加する
- `DIRECTORYSTRUCTURE.md` に `build/` (ビルド時に使うスクリプト) と `src/platform/` を追記する

## platform モジュール (`src/platform/`)

```
src/platform/
├── index.ts        # __TARGET__ で実装を選び、下記3関数を公開
├── chrome.ts       # Chrome 実装 (既存コードの移設)
├── firefox.ts      # Firefox 実装
├── types.ts        # Platform interface
└── __tests__/
```

```ts
export interface Platform {
  openSettingsPanel(windowId?: number): Promise<void>;
  closeSettingsPanel(): Promise<void>;
  initThemeDetection(onColorSchemeChange: (isDarkMode: boolean) => void): Promise<void>;
}
```

`index.ts` は `__TARGET__ === 'firefox' ? firefoxPlatform : chromePlatform` を export する。`DefinePlugin` による定数置換のあと、minify で使わない側が除去される。

### Chrome 実装

- `openSettingsPanel(windowId?)`: `windowId` が未指定なら `tabs.query({ active: true, currentWindow: true })` で取得する。その後 `sidePanel.setOptions({ path: 'options.html', enabled: true })` と `sidePanel.open({ windowId })` を呼ぶ
- `closeSettingsPanel()`: `sidePanel.setOptions({ enabled: false })`
- `initThemeDetection()`: 現在の `ServiceWorkerThemeService.initialize()` にある offscreen の生成処理を移す。コールバックは使わない (offscreen からの `COLOR_SCHEME_CHANGED` メッセージで反映される)

### Firefox 実装

- `openSettingsPanel()`: 関数の**1行目で同期的に** `browser.sidebarAction.open()` を呼び、その Promise を返す。`windowId` は使わない
- `closeSettingsPanel()`: `browser.sidebarAction.close()`
- `initThemeDetection(onColorSchemeChange)`: background ページ上で `matchMedia('(prefers-color-scheme: dark)')` の初期値をコールバックに渡し、`change` イベントも同じコールバックに渡す。platform は store に依存しない (テストしやすくするため)
- `browser.sidebarAction` の型は `src/types/` にローカルの d.ts として必要な分だけ宣言する (既存の `Chrome.d.ts` の offscreen 宣言と同じ方針)

### 呼び出し側の変更

| 箇所 | 変更 |
|---|---|
| `PopupMain.tsx` の Settings ボタン (2箇所) | クリックハンドラの**先頭**で `await openSettingsPanel()` を呼び、その後 `window.close()` する。`tabs.query` は Chrome 実装の内部に移す |
| `ServiceWorker.ts` の右クリックメニュー (`handleContextMenuClicked`) | `openSettingsPanel(tab.windowId)` に置き換える。await より前に呼ぶ現在の順序は維持する |
| `ServiceWorker.ts` の `OPEN_SETTINGS` ハンドラ | `openSettingsPanel(tab.windowId)` に置き換える。送信元が存在しない未使用ハンドラのため、挙動確認は対象外 |
| `OptionsMain.tsx` の閉じるボタン | `closeSettingsPanel()` に置き換える |
| `ServiceWorkerThemeService.initialize()` | `initThemeDetection(isDarkMode => useThemeStore.getState().setDarkMode(isDarkMode))` を呼ぶだけにする。`COLOR_SCHEME_CHANGED` / `PING_SERVICE_WORKER` のメッセージ処理は Chrome で引き続き使うため残す |

### Firefox 固有の注意点

1. **ユーザー操作の制約**: Firefox の `sidebarAction.open()` / `close()` は、ユーザー操作のハンドラ内で同期的に呼ばないと拒否される。そのため Firefox 実装は1行目で呼び、呼び出し側でもハンドラ先頭で呼ぶ
2. **offscreen の仕組みを流用しない理由**: `OffscreenThemeService` は `runtime.sendMessage` で通知し、失敗すると1秒後に再送する。Firefox の background ページから自分宛てに送っても受信側が存在しないため、再送が無限に続く
3. **background ページのアイドル停止**: 停止中のテーマ変更は、次に起動したときの `initThemeDetection()` で現在値を読み直して反映する
4. **プライベートタブ**: ユーザーが「プライベートウィンドウでの実行」を許可していないと、`windows.create({ incognito: true })` が失敗する。既存の catch でログに出るのみとし、通常タブへのフォールバックは行わない (プライバシー上の意図に反するため)。README に注意書きを追加する

## リリース

### Fastlane (`fastlane/Fastfile`)

- 新しいレーン:
  - `build_firefox`: `pnpm run build:firefox`
  - `create_firefox_package`: `dist/firefox-prod` を `free-ai-summarizer-firefox-<version>.zip` に固める
  - `create_source_package`: `git archive --format=zip HEAD` で `free-ai-summarizer-source-<version>.zip` を作る
- `release` レーンでは、`create_package` の後に `build_firefox` と `create_firefox_package` を実行する。タグを打つ前に Firefox ビルドの失敗を検知するため
- `create_source_package` は `release` レーンに含めない。bump コミット前の `HEAD` から作ると version がずれるため。初回の手動提出用の単独レーンとし、未コミットの変更があれば警告する (CI はタグ時点で別途作成する)
- 既存 zip の削除 (`rm -f ../free-ai-summarizer-*.zip`) は Firefox 用・ソース用の zip も対象になる。これは意図どおり
- `.gitignore` は既存の `*.zip` で Firefox 用・ソース用の zip もカバーされるため変更しない

### CI (`.github/workflows/release.yml`)

- workflow 名を `Release Chrome Extension` から `Release Extension` に変更する
- Chrome の結果確認ステップの後ろに Firefox 用のステップを追加する。Firefox 側のステップはすべて `continue-on-error: true` とし、Chrome のリリースと GitHub Release を止めない
  1. `pnpm run build:firefox` を実行し、Firefox 用 zip とソース zip を作る
  2. `npx web-ext@<固定版> lint --source-dir dist/firefox-prod`
  3. `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` が未設定なら `::warning::` を出して提出をスキップする
  4. `npx web-ext@<固定版> sign --channel=listed --source-dir dist/firefox-prod --upload-source-code free-ai-summarizer-source-<version>.zip --approval-timeout 0`
  5. 結果確認: `steps.<id>.outcome` を見て、失敗時は `::warning::` を出す (Chrome の確認ステップと同じ方式)
- `web-ext` の固定バージョンは、実装時点の最新安定版とする
- GitHub Release には Firefox 用の成果物を添付しない。listed で署名された xpi は AMO の審査完了後にしか取得できず、署名なしの zip は通常版の Firefox にインストールできないため

### 制約

- AMO は同じ version の再アップロードを拒否する。Fastlane が既存タグを作り直して同じ version で再リリースした場合、Firefox 側だけが失敗して警告が出る (Chrome 側は影響を受けない)

### AMO 審査向けのビルド手順

README に「Building for Firefox (AMO reviewers)」の節を追加する:

- Node 20 (CI と同じ)
- pnpm (`packageManager` フィールドで固定済みのバージョン)
- `pnpm install --frozen-lockfile`
- `pnpm build:firefox`
- 出力先は `dist/firefox-prod`

本番ビルドの出力が決定的であること (同じソースから毎回同じ出力になること) を実装時に確認する。具体的には、2回ビルドして diff を取る。

### 初回の手動提出 (ユーザー作業)

`README.md` に手順を追記する (`fastlane/README.md` は fastlane 実行のたびに自動生成で上書きされるため使わない):

1. AMO (addons.mozilla.org) のデベロッパーアカウントを作成する
2. `bundle exec fastlane build_firefox` → `create_firefox_package` → `create_source_package` で提出物を作る
3. AMO Developer Hub で新規アドオンとして Firefox 用 zip を提出し、ソース zip をアップロードする。掲載情報 (説明文・スクリーンショット・カテゴリ・プライバシーポリシー) を入力する
4. AMO Developer Hub の「Manage API Keys」で JWT issuer / secret を発行する
5. GitHub の repository secrets に `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` を登録する

## テスト

### 自動テスト (Jest)

- `build/__tests__/manifest.test.ts`
  - `toFirefoxManifest`: `service_worker` / `type` / `offscreen` / `sidePanel` / `side_panel` が消えること、`background.scripts`・`sidebar_action` (`open_at_install: false`)・`gecko` 設定が入ること、version や `content_scripts` など他のキーが保持されること
  - `transformManifest`: dev + firefox の組み合わせで `sidebar_action.default_icon` が dev 用アイコンになること。chrome + prod では入力がそのまま返ること
  - 入力オブジェクトを変更 (mutate) しないこと
- `src/platform/__tests__/`
  - Firefox の `openSettingsPanel`: 返り値の Promise を await する前の時点で、`sidebarAction.open` が呼ばれていること
  - Firefox の `initThemeDetection`: `matchMedia` の初期値と `change` イベントでコールバックが呼ばれ、`runtime.sendMessage` が呼ばれないこと
  - Chrome の `openSettingsPanel`: `windowId` の指定あり/なしの両方で `sidePanel.setOptions` と `sidePanel.open` が呼ばれること
  - Chrome の `closeSettingsPanel`: `sidePanel.setOptions({ enabled: false })` が呼ばれること
- jest の `globals` に `__TARGET__: 'chrome'` を設定し、既存テストが全件通ること。platform のテストは実装モジュール (`chrome.ts` / `firefox.ts`) を直接 import するので、`__TARGET__` に依存しない

### 静的チェック

- `pnpm type-check` / `pnpm eslint-check` / `pnpm prettier-check`
- `npx web-ext@<固定版> lint --source-dir dist/firefox-prod`。エラー 0 件を合格基準とする。警告は内容を確認し、対応するかどうかをチェックポイントで判断する

### 手動での動作確認 (Firefox デスクトップ)

Claude in Chrome は Firefox を操作できない。Claude は `dist/firefox-dev` のビルドと `npx web-ext@<固定版> run` による起動までを担当し、以下のチェックリストの確認は各 AI サービスにログイン済みのユーザーが行う。

1. インストール直後: サイドバーが自動で開かないこと。host permission が許可され、content script が動作していること
2. 記事抽出: Web 記事、YouTube 字幕、PDF
3. 注入: ChatGPT / Claude / Gemini / AI Studio / Grok / Perplexity / DeepSeek / Kimi / Qwen
4. 右クリックメニュー、popup、sidebar の開閉 (popup / 右クリックメニュー / 閉じるボタン)
5. OS のダーク/ライト切り替えがアイコンと UI に反映されること
6. バッジ、タブの開き方 (現在のタブ / 新しいタブ / プライベートタブ)、クリップボードへのコピー

### Chrome のリグレッション確認

設定パネルとテーマ検出のコードを移動するため、Chrome でも以下を確認する。Claude in Chrome ではツールバーの popup・右クリックメニュー・unpacked 拡張の読み込みを操作できないため、ユーザーが手動で確認する:

- popup と右クリックメニューからサイドパネルを開けること、閉じるボタンで閉じること
- OS のテーマ切り替えが反映されること
- 1サービス以上で抽出から注入まで一連の流れが動くこと

## 既知のリスク

| リスク | 内容 | 対応 |
|---|---|---|
| PDF 抽出 | `PDF.ts:16` は content script から `fetch(url)` する。Firefox は PDF を内蔵ビューア (pdf.js) で表示し、そのページには content script が注入されないため、動作しない可能性が高い | 動作確認で失敗した場合、チェックポイントで (a) Firefox 版では PDF 非対応と明記する か (b) background 側で fetch・解析する方式に変える かを決める **結論 (2026-09-12 チェックポイント③)**: 動作確認で失敗したため (a) を採用。Firefox 版は PDF 非対応と README と AMO の説明文に明記する。background 側での抽出 (b) は後日別タスクとする |
| 注入の挙動差 | contenteditable / ProseMirror 等への貼り付けや input イベントが、Firefox では挙動が異なる場合がある | 該当する injector だけを修正する。修正範囲が大きい場合はチェックポイントで相談する |
| host permission | Firefox MV3 の `<all_urls>` の許可タイミングは Chrome と異なる | 手動確認の項目1で確かめる。許可されない場合は、許可を求める導線をチェックポイントで検討する |
| AMO 審査 | 手動審査に回ると公開まで数日〜数週間かかる | Claude の側では制御できない。公開日を約束しない |

## チェックポイント

1. 実装計画の承認
2. 実装・自動テスト完了後、Firefox 手動確認を依頼する時点
3. 手動確認の結果報告 (PDF / 注入の問題があればここで方針を決める)
4. AMO への初回提出前 (外部公開操作)
