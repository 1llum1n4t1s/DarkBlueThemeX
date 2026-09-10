# AGENTS.md

この文書はエージェント向けの作業規約・必須コマンド・検証手順を定める。設計の正本は [DESIGN.md](DESIGN.md)、利用者向け案内は [README.md](README.md) とする。

## Project Overview

Cross-browser Manifest V3 拡張機能 (Chrome / Edge / Brave / Firefox 142+) で、X (旧 Twitter) の黒/Lights Out テーマを旧 DarkBlue(Dim) テーマに変換する。Chrome Web Store と Firefox AMO に「帰ってきたDarkBlueテーマ(X)」として公開済み。**Version の真実の源は `manifest.json`** で、`manifest.firefox.json` と `package.json` は CI の `pnpm run check-version` で 3 ファイル同期を強制。popup は `chrome.runtime.getManifest().version` で動的取得。製品実行時の外部依存はなく、配布物はローカル同梱した vanilla JS と CSS だけで動作する。

## Build & Package

初回導入は Node.js 22／pnpm 11 でリポジトリルートから次を実行する。生成アイコンは Git 管理外なので、ソースをブラウザへ読み込む前にも必要となる。

```bash
pnpm install --frozen-lockfile
pnpm run sync:support
pnpm run generate-icons
```

`zip.ps1`／`zip.sh` は同期・アイコン生成・検証を実行しない。準備と下記の必須検証を完了してからパッケージ化する。`package.json` の `prebuild` は `zip:*` の前処理にはならない。

```bash
# Windows (Chrome + Firefox 両方)
pwsh -File zip.ps1
pnpm run zip:win                  # package.json 経由 (同じ処理)

# Unix/macOS (Chrome + Firefox 両方)
bash zip.sh
pnpm run zip                      # = pnpm run zip:nix

# variant 個別
bash zip.sh chrome                # Chrome のみ
bash zip.sh firefox               # Firefox のみ
pwsh -File zip.ps1 -Target chrome
pwsh -File zip.ps1 -Target firefox
```

成果物:

- **`DarkBlueThemeX-chrome.zip`** — Chrome Web Store にアップロードする ZIP
- **`DarkBlueThemeX-firefox.xpi`** — Firefox AMO にアップロードする XPI (中身は ZIP、`manifest.firefox.json` を `manifest.json` にリネームして同梱)

No compilation step — パッケージ処理は同期済みのソースをそのまま格納する。Included: variant 別 manifest, `src/`, `icons/`. Excluded: editor/system files (`*.DS_Store`, `*.swp`, `*~`), docs, dev files。

**Windows の zip.ps1 は `System.IO.Compression.ZipFile` を直接使い、エントリ名を forward slash に正規化**している (Windows PowerShell 5.1 の `Compress-Archive` は backslash separator で zip を作る既知バグがあり、Firefox AMO の web-ext lint と一部の unzip ツールが弾くため)。

アイコン再生成が必要な場合は `pnpm run generate-icons` (Node.js + `sharp` を使用。`icons/icon16.png`・`icon48.png`・`icon128.png` を出力)。devDependencies は `sharp` (アイコン生成)、`chrome-webstore-upload-cli` (CWS CI 用)、`web-ext` (AMO CI 用)、`@kagayoi/support-extension` (問い合わせ共通部品の同期元) に限定する。**ランタイム依存はゼロ**。

問い合わせ共通部品は、固定した `@kagayoi/support-extension` から `pnpm run sync:support` で `src/shared/kagayoi-support-{footer,popup}.{js,css}` と `kagayoi-support-form.css` へ同期する。依存更新時は `pnpm-workspace.yaml` の `minimumReleaseAgeExclude` にある旧版の例外も整理して同期を実行し、共通仕様の変更は上流パッケージ、DarkBlueThemeX 固有の見た目は `src/popup/popup.css` の上書きへ置く。

通常のローカル必須検証は `pnpm exec kagayoi-support-sync --check` と `pnpm run check`。前者は同期生成物、後者は version 三者一致、実行コンテキスト間の共有リテラル、問い合わせ権限、テーマ復元契約を検証する。version だけを個別確認する場合は `pnpm run check-version` を使う。

### ソースからの読み込み

- **Chrome / Edge / Brave**: `chrome://extensions`（Edge は `edge://extensions`、Brave は `brave://extensions`）でデベロッパーモードを有効にし、「パッケージ化されていない拡張機能を読み込む」からプロジェクトフォルダを選択
- **Firefox**: `bash zip.sh firefox` でビルドした `DarkBlueThemeX-firefox.xpi` を `about:debugging#/runtime/this-firefox` で「一時的なアドオンとして読み込む」(セッションごとに再読み込みが必要)

## Release & CI (自動公開ワークフロー)

`.github/workflows/publish.yml` は `release/**` ブランチに push されると起動し、**Chrome Web Store と Firefox AMO に同時に**自動アップロード＆申請する。

- ブランチ名と `manifest.json` の `version` が **完全一致必須**（例: `release/1.0.40` ⇔ `"version": "1.0.40"`）。不一致なら CI が失敗する。
- `package.json` / `manifest.json` / `manifest.firefox.json` の version 三者同期も `pnpm run check-version` で検証される（不一致なら CI 失敗）。
- zip は `bash zip.sh both` を CI 内で直接呼び出す形に統一済み（過去はインラインコマンドだったが、パッケージ内容物定義を 1 箇所に集約するため）。
- Chrome Web Store CLI は `devDependencies` 固定バージョン (`chrome-webstore-upload-cli@4.0.1`, CWS API v2) で、CI は `./node_modules/.bin/chrome-webstore-upload` のデフォルトコマンド (サブコマンド無し = upload+publish、`--auto-publish` は廃止) を使う。v4 は認証を `CLIENT_ID` / `CLIENT_SECRET` / `REFRESH_TOKEN` / `PUBLISHER_ID` 環境変数で受け取り (v3 の secret フラグは廃止)、**`PUBLISHER_ID` が新規必須** (CWS Developer Dashboard の Settings で確認)。GitHub Secret は `CWS_` プレフィックスのまま CLI 期待名に env で alias する。
- Firefox AMO は `web-ext sign --channel=listed` で提出。`.amo-metadata.json` で `version.license: "MIT"` を毎回付与（AMO API v5 では各 version 提出時に license 明示必須、過去 version から継承しないため）。
- `vava.config.json` は AMO の slug、日英ストア説明文、日英プライバシーポリシーの対応を定義する。`/vava` は `webstore/store-listing.firefox.{ja,en}.txt` と `docs/privacy-policy*.md` を正本として AMO 掲載情報を更新する。
- GitHub Actions 依存と npm 依存は `.github/dependabot.yml` で週次自動更新。
- Secrets 必須:
  - **Chrome Web Store**: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_PUBLISHER_ID`, `CWS_EXTENSION_ID`（`CWS_PUBLISHER_ID` は v4 で新規必須 — CWS Developer Dashboard の Settings で取得 → `gh secret set CWS_PUBLISHER_ID`）
  - **Firefox AMO**: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`（[AMO Developer Hub](https://addons.mozilla.org/ja/developers/addon/api/key/) で発行 → `gh secret set` で登録）
- Firefox AMO ジョブは `needs: package` のみで `publish-chrome` に依存しないため、Chrome 公開が失敗しても独立して submit される（sibling job の失敗は波及しない）。`if: success() || failure()` は付けない（付けると `package` の `pnpm run check` 失敗時にも firefox が走り、壊れた拡張を AMO に submit してしまうため。既定の「package 成功時のみ実行」ゲートに委ねる）。
- CI の Node は **22 固定**（pnpm 11 が Node 22+ 必須のため。ローカル開発環境とも一致）。
- `web-ext sign --channel=listed` は submission 受理後 15 分で `Approval: timeout exceeded` を返して exit 1 になる既知挙動があり、CI はこの文言を warning 扱いに変換する。同 version／Conflict の扱いは下記 runbook を参照し、CI 成功だけでストア反映済みと判断せず提出状態を確認する。
- リリース手順は `vava` スキル（`/vava`）が自動化: バージョン +1 → main に push → `release/x.y.z` ブランチ作成 → 古いリリースブランチ削除。
- GitHub Actions は `actions/*` を含めすべて commit SHA で固定（サプライチェーン対策）。`# vN` コメントを手掛かりに Dependabot が SHA を追従更新する。
- ワークフローはトップレベル `concurrency`（`group: publish-${{ github.ref }}` / `cancel-in-progress: false`）で直列化し、`release/**` への連続 push 時に publish が並走して CWS の upload／publish が競合するのを防ぐ。publish は不可逆な外部副作用を持つため、進行中ランをキャンセルせずキューイングして中断による部分公開を避ける。
- Chrome 公開ジョブは Firefox ジョブと対称に、`CWS_*` Secrets 欠落時の事前ガード（`-z` チェック）で fail-fast する。Secrets を扱う publish 2 ジョブは job レベル `permissions: contents: read` を明示。

### 公開後のロールバック / ロールフォワード（インシデント時 runbook）

公開済みバージョンに不具合が出た場合、**前バージョンへの直接ロールバックはできない**ため、修正版を新しいバージョン番号で出し直す（ロールフォワード）。

- **Chrome Web Store**: 旧バージョンへの直戻し UI はない。修正を入れて version を上げ、`/vava` で再リリースする。影響を絞りたい場合は CWS の段階公開（percentage rollout）も検討。
- **Firefox AMO**: 同一 version の再 submit は `Version ... already exists` または `Submission failed (...): Conflict` で **warning 化され反映されない**（`publish.yml` が green 化する既知挙動）。必ず version 番号を上げてから出し直すこと。
- version は 3 ファイル一致 + ブランチ名一致が CI で強制されるため、`/vava` 経由で番号を上げるのが最短経路。

## テーマ・権限変更時の作業規約

構造・データフロー・復元の不変条件は [DESIGN.md](DESIGN.md) を参照し、変更前に該当契約を確認する。

- テーマ判定は `getCurrentTheme()`、inline color-scheme 取得は `getInlineColorScheme()`、復元は `restoreDataTheme()` に集約する。外部スタイルの computed 値と区別し、CSSOM の inline 値を使用する。
- MAIN world のテーマイベントリスナーは楽観的 intercept ON より先に登録する。解除は intercept OFF → ガード解除・OFF クラス付与 → 属性復元の順を維持する。
- テーマ変更時は storage 未解決、BFCache 復帰、再訪 dark、公式 Dim、属性削除、ライト遷移、ON/OFF 復元を検証する。通知への SPA 遷移と戻る／進む、body の Tailwind 配色、複数 theme-color meta は実ブラウザでも確認する。
- X の新しい色を扱うときは DevTools で `r-*` クラスと computed RGB を確認し、`src/popup/popup.css` のパレットへ対応付ける。`src/styles/darkblue.css` の該当節にクラス上書きとセクション 1 の inline style セレクタを追加する。クラス名の永続的な安定性を仮定せず実 DOM と照合する。
- FOUC セレクタへの追加は JS 実行前に見えるルート・body 周辺の色を対象とし、コンポーネント内部色は `html.darkbluethemex-active` にスコープする。セクション 12・13 の body 側変数上書きを維持する。
- 共有リテラル変更時は `scripts/check-shared-literals.js` の対応グループを同時更新し、参照コメントには行番号の代わりに定数名を記す。
- Firefox の Gecko ID `{6a3c2b7e-9d4f-4a1c-b8e5-2f7d8c9e1a3b}` を維持する。任意データ収集権限は `manifest.firefox.json` と popup の要求経路を合わせ、許可／拒否を検証する。

## 補助ファイルと正本

リリース zip には含まれない補助ディレクトリ:

| Path | 用途 |
|------|------|
| `scripts/generate-icons.js` | 拡張機能アイコン (16/48/128px) 生成スクリプト (Node.js + sharp) |
| `scripts/check-version.js` | `package.json` / `manifest.json` / `manifest.firefox.json` の version 三者一致を検証 (CI 実行) |
| `scripts/check-shared-literals.js` | 実行コンテキストを跨ぐ共有リテラル値の一致を検証 (CI 実行)。content↔popup: `STORAGE_KEY` / `MSG_GET_STATE`、content↔intercept: `LOCATION_CHANGE_EVENT` / 3つの `THEME_*_EVENT` |
| `scripts/check-support-permissions.js` | Chrome の任意ホスト権限、Firefox の任意データ収集権限、許可／拒否時の popup 分岐を Node 標準機能だけで検証 (`pnpm run check`) |
| `scripts/check-theme-state.js` | MAIN / isolated world を分離した VM で storage 未解決時の OFF 維持、再訪時の dark、公式 Dim、属性削除、通常初期化の OFF 復元契約を検証 (`pnpm run check`) |
| `.github/workflows/publish.yml` | `release/**` push で Chrome Web Store + Firefox AMO に同時自動公開 |
| `zip.ps1` / `zip.sh` | Chrome/Firefox 両対応のパッケージ生成 (`-Target chrome|firefox|both` / `bash zip.sh chrome|firefox|both`) |
| `.github/dependabot.yml` | GitHub Actions と npm 依存の週次自動更新 |
| `webstore/images/` | Chrome Web Store 掲載用タイル画像と生成スクリプト |
| `webstore/screenshots/` | ストアリスティング用スクリーンショットと生成スクリプト |
| `webstore/store-listing.txt` | Chrome Web Store の日本語掲載文の正本。Developer Dashboard で手動更新するときに使用 |
| `webstore/store-listing.firefox.{ja,en}.txt` | Firefox AMO の日英 Summary / Description の正本 |
| `docs/privacy-policy*.md` | プライバシーポリシー (日本語・英語) |
| `debug/` | DevTools Trace などローカルデバッグ用のアーティファクト置き場 (`.gitignore` 対象) |

> エージェント向け規約は `AGENTS.md` に集約し、設計説明は `DESIGN.md` を更新して相互参照する。

## Coding Conventions

- All code and comments are in Japanese
- Content / intercept script はどちらも IIFE + `'use strict'`。拡張リロード時の二重注入防止のため `window.__dbtx_content_installed__` / `window.__dbtx_intercept_installed__` グローバル印を冒頭で確認し、true ならば即リターンする
- CSS sections are numbered and commented (e.g., `/* === 1. ルート・Body === */`)
- `!important` is used in CSS to override X's inline styles — this is intentional
- `run_at: "document_start"` in manifest for early CSS injection
- DOM elements queried repeatedly are cached in module-scope variables (popup.js: `cacheElements()`, content.js: `_themeColorMetas`)
- `chrome.runtime.onMessage` ハンドラ冒頭で `sender.id === chrome.runtime.id` を必ず検証する（他拡張からの偽装メッセージブロック）

## Key Constraints

- Target: Chrome 110+ / Firefox 142+ (MV3 の `world: "MAIN"` content script を使うため。Firefox は 128 から MAIN world 対応だが、`data_collection_permissions` を使うため 142+ に統一)
- Theme host permissions: `x.com/*` and `twitter.com/*` only。Kagayoi Support API は Chrome / Firefox とも `optional_host_permissions` に宣言する
- Permissions: `storage` + `activeTab` (minimal)
- `content_security_policy.extension_pages`: `script-src 'self'; object-src 'self'` を明示 (デフォルトと同等だが将来のリグレッション防止のため)
- No background/service worker — all logic in 2 content scripts (isolated + MAIN) + popup
- 3 実行コンテキストは現在の配布方式では定数を個別定義する。重複定数は `STORAGE_KEY` / `MSG_GET_STATE` (content↔popup)、`LOCATION_CHANGE_EVENT` / `THEME_*_EVENT` (content↔intercept) で、対になるファイルの同時更新必須
- X frequently changes its DOM structure and class names — CSS selectors may need updates when X deploys changes
