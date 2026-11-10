# AGENTS.md

この文書はエージェント向けの作業規約・必須コマンド・検証手順を定める。設計の正本は [DESIGN.md](DESIGN.md)、利用者向け案内は [README.md](README.md) とする。

Bun は `package.json` の `packageManager` (`bun@1.4.4`) を正本とする。`bunfig.toml` の `minimumReleaseAge = 86400` は従来の24時間の公開待機を維持し、例外は `minimumReleaseAgeExcludes`、依存の実行許可は `package.json` の `trustedDependencies` に置く。CI は `scripts/Initialize-BunBuild.ps1 -VersionFile package.json` で同じ実行環境を準備する。

## Project Overview

Cross-browser Manifest V3 拡張機能 (Chrome / Edge / Brave / Firefox 142+) で、X (旧 Twitter) の黒/Lights Out テーマを旧 DarkBlue(Dim) テーマに変換する。Chrome Web Store と Firefox AMO に「帰ってきたDarkBlueテーマ(X)」として公開済み。**Version の真実の源は `manifest.json`** で、`manifest.firefox.json` と `package.json` は CI の `bun --bun run check-version` で 3 ファイル同期を強制。popup は `chrome.runtime.getManifest().version` で動的取得。製品実行時の外部依存はなく、配布物はローカル同梱した vanilla JS と CSS だけで動作する。

## Build & Package

初回導入は Bun 1.4.4 でリポジトリルートから次を実行する。バージョンは `package.json` に固定し、CI も同じ値を参照する。生成アイコンは Git 管理外なので、ソースをブラウザへ読み込む前にも必要となる。

```bash
bun run deps
bun --bun run sync:support
bun --bun run generate-icons
```

`zip.ps1`／`zip.sh` は同期・アイコン生成・検証を実行しない。準備と下記の必須検証を完了してからパッケージ化する。

```bash
# Windows (Chrome + Firefox 両方)
pwsh -File zip.ps1
bun --bun run zip:win                  # package.json 経由 (同じ処理)

# Unix/macOS (Chrome + Firefox 両方)
bash zip.sh
bun --bun run zip                      # = bun --bun run zip:nix

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

アイコン再生成が必要な場合は `bun --bun run generate-icons` (Bun + `sharp` を使用。`icons/icon16.png`・`icon48.png`・`icon128.png` を出力)。devDependencies は `sharp` (アイコン生成)、`web-ext` (開発時の拡張検証用)、`@kagayoi/support-extension` (問い合わせ共通部品の同期元) に限定する。**ランタイム依存はゼロ**。

問い合わせ共通部品は、固定した `@kagayoi/support-extension` から `bun --bun run sync:support` で `src/shared/kagayoi-support-{footer,popup}.{js,css}` と `kagayoi-support-form.css` へ同期する。依存更新時は `bunfig.toml` の `minimumReleaseAgeExcludes` にある旧版の例外も整理して同期を実行し、共通仕様の変更は上流パッケージ、DarkBlueThemeX 固有の見た目は `src/popup/popup.css` の上書きへ置く。

通常のローカル必須検証は `bun --bun run sync:support --check` と `bun --bun run check`。前者は同期生成物、後者は version 三者一致、実行コンテキスト間の共有リテラル、問い合わせ権限、テーマ復元契約を検証する。同期と一致確認は、`package.json` の `sync:support` にある Bun 直接起動の経路を使う。version だけを個別確認する場合は `bun --bun run check-version` を使う。

### ソースからの読み込み

- **Chrome / Edge / Brave**: `chrome://extensions`（Edge は `edge://extensions`、Brave は `brave://extensions`）でデベロッパーモードを有効にし、「パッケージ化されていない拡張機能を読み込む」からプロジェクトフォルダを選択
- **Firefox**: `bash zip.sh firefox` でビルドした `DarkBlueThemeX-firefox.xpi` を `about:debugging#/runtime/this-firefox` で「一時的なアドオンとして読み込む」(セッションごとに再読み込みが必要)

## Release & CI (自動公開ワークフロー)

`.github/workflows/publish.yml` は `release/**` ブランチに push されると起動し、**Chrome Web Store と Firefox AMO に同時に**自動アップロード＆申請する。

- ブランチ名と `manifest.json` の `version` が **完全一致必須**（例: `release/1.0.40` ⇔ `"version": "1.0.40"`）。不一致なら CI が失敗する。
- `package.json` / `manifest.json` / `manifest.firefox.json` の version 三者同期も `bun --bun run check-version` で検証される（不一致なら CI 失敗）。
- zip は `bash zip.sh both` を CI 内で直接呼び出す形に統一済み（過去はインラインコマンドだったが、パッケージ内容物定義を 1 箇所に集約するため）。
- Chrome Web Store は `scripts/Publish-Cws.ps1` で既存OAuth認証とpublisher/item IDを使い、同期upload応答の成功・ID・版を確認してからpublishする。非同期・重複・不明な応答は停止する。
- Firefox AMO は最終XPIを既存verifierで照合し、そのreceiptのSHA-256を `scripts/Publish-Amo.ps1` へ渡して提出する。`.amo-metadata.json` の `version.license` を毎回送る。
- GitHub Actions 依存と npm 依存は `.github/dependabot.yml` で週次自動更新。
- Secrets 必須:
  - **Chrome Web Store**: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_PUBLISHER_ID`, `CWS_EXTENSION_ID`（`CWS_PUBLISHER_ID` は v4 で新規必須 — CWS Developer Dashboard の Settings で取得 → `gh secret set CWS_PUBLISHER_ID`）
  - **Firefox AMO**: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`（[AMO Developer Hub](https://addons.mozilla.org/ja/developers/addon/api/key/) で発行 → `gh secret set` で登録）
- Firefox AMO ジョブは `needs: package` のみで `publish-chrome` に依存しないため、Chrome 公開が失敗しても独立して submit される（sibling job の失敗は波及しない）。`if: success() || failure()` は付けない（付けると `package` の `bun --bun run check` 失敗時にも firefox が走り、壊れた拡張を AMO に submit してしまうため。既定の「package 成功時のみ実行」ゲートに委ねる）。
- CI の Bun は `package.json` の固定値を参照し、ローカル開発環境と一致させる。
- AMOは提出受付応答まで確認し、承認待ちはしない。timeoutや重複を成功扱いにせず、ストア状態を確認してから再開する。
- リリース手順は `vava` スキル（`/vava`）が自動化: バージョン +1 → main に push → `release/x.y.z` ブランチ作成 → 古いリリースブランチ削除。
- GitHub Actions は `actions/*` を含めすべて commit SHA で固定（サプライチェーン対策）。`# vN` コメントを手掛かりに Dependabot が SHA を追従更新する。
- ワークフローはリポジトリ共通の `concurrency`（`group: publish-${{ github.repository }}`、`cancel-in-progress: false`、`queue: max`）で直列化する。異なる `release/**` ブランチへの push も同じキューに入り、CWS の upload／publish の競合や実行中の中断による部分公開を避ける。
- Chrome と Firefox の公開スクリプトは、各ストアの認証情報が欠けていればストアとの通信前に停止する。Secrets を扱う publish 2 ジョブは job レベルで `permissions: contents: read` を明示する。

### 公開後のロールバック / ロールフォワード（インシデント時 runbook）

公開済みバージョンに不具合が出た場合、**前バージョンへの直接ロールバックはできない**ため、修正版を新しいバージョン番号で出し直す（ロールフォワード）。

- **Chrome Web Store**: 旧バージョンへの直戻し UI はない。修正を入れて version を上げ、`/vava` で再リリースする。影響を絞りたい場合は CWS の段階公開（percentage rollout）も検討。
- **Firefox AMO**: 同一 version の再提出は既存版の検査または AMO の競合応答で停止する。ストアの状態を確認し、修正版には新しい version 番号を付けて提出する。
- version は 3 ファイル一致 + ブランチ名一致が CI で強制されるため、`/vava` 経由で番号を上げるのが最短経路。

## テーマ・権限変更時の作業規約

構造・データフロー・復元の不変条件は [DESIGN.md](DESIGN.md) を参照し、変更前に該当契約を確認する。

- テーマ判定は `getCurrentTheme()`、inline color-scheme 取得は `getInlineColorScheme()`、復元は `restoreDataTheme()` に集約する。外部スタイルの computed 値と区別し、CSSOM の inline 値を使用する。
- MAIN world のテーマイベントリスナーは楽観的 intercept ON より先に登録する。解除は intercept OFF → ガード解除・OFF クラス付与 → 属性復元の順を維持する。
- テーマ変更時は storage 未解決、初期取得・BFCache 再取得と変更通知の競合、複数取得の完了順逆転、再訪 dark、公式 Dim、属性削除、light／normal への遷移後の重複 mutation と dark 復帰、ON/OFF 復元を検証する。通知への SPA 遷移と戻る／進む、body の Tailwind 配色、複数 theme-color meta は実ブラウザでも確認する。
- X の新しい色を扱うときは DevTools で `r-*` クラスと computed RGB を確認し、`src/popup/popup.css` のパレットへ対応付ける。`src/styles/darkblue.css` の該当節にクラス上書きとセクション 1 の inline style セレクタを追加する。クラス名の永続的な安定性を仮定せず実 DOM と照合する。
- FOUC セレクタへの追加は JS 実行前に見えるルート・body 周辺の色を対象とし、コンポーネント内部色は `html.darkbluethemex-active` にスコープする。セクション 12・13 の body 側変数上書きを維持する。
- 共有リテラル変更時は `scripts/check-shared-literals.js` の対応グループを同時更新し、参照コメントには行番号の代わりに定数名を記す。
- popup の設定読込を変更するときは、読込中の操作禁止、成功後の操作可能化、失敗時の「未確認」表示と操作禁止を `bun --bun run check-support-permissions` で検証する。状態の設計は [DESIGN.md](DESIGN.md#有効状態の変更) を参照する。
- Firefox の Gecko ID `{6a3c2b7e-9d4f-4a1c-b8e5-2f7d8c9e1a3b}` を維持する。任意データ収集権限は `manifest.firefox.json` と popup の要求経路を合わせ、許可／拒否を検証する。

## 補助ファイルと正本

リリース zip には含まれない補助ディレクトリ:

| Path | 用途 |
|------|------|
| `scripts/generate-icons.js` | 拡張機能アイコン (16/48/128px) 生成スクリプト (Bun + sharp) |
| `scripts/check-version.js` | `package.json` / `manifest.json` / `manifest.firefox.json` の version 三者一致を検証 (CI 実行) |
| `scripts/check-shared-literals.js` | 実行コンテキストを跨ぐ共有リテラル値の一致を検証 (CI 実行)。content↔popup: `STORAGE_KEY` / `MSG_GET_STATE`、content↔intercept: `LOCATION_CHANGE_EVENT` / 3つの `THEME_*_EVENT` |
| `scripts/check-support-permissions.js` | Chrome の任意ホスト権限、Firefox の任意データ収集権限、許可／拒否時の popup 分岐と設定読込時の操作制御を Bun の Node.js 互換機能だけで検証 (`bun --bun run check`) |
| `scripts/check-theme-state.js` | MAIN / isolated world を分離した VM で storage 未解決・競合、BFCache 再取得、light／normal 遷移と dark 復帰、Dim の由来別復元契約を検証 (`bun --bun run check`) |
| `.github/workflows/publish.yml` | `release/**` push で Chrome Web Store + Firefox AMO に同時自動公開 |
| `zip.ps1` / `zip.sh` | Chrome/Firefox 両対応のパッケージ生成 (`-Target chrome|firefox|both` / `bash zip.sh chrome|firefox|both`) |
| `.github/dependabot.yml` | GitHub Actions と npm 依存の週次自動更新 |
| `webstore/images/` | Chrome Web Store 掲載用タイル画像と生成スクリプト |
| `webstore/screenshots/` | ストアリスティング用スクリーンショットと生成スクリプト |
| `webstore/store-listing.txt` | Chrome Web Store の日本語掲載文の正本。Developer Dashboard で手動更新するときに使用 |
| `webstore/store-listing.firefox.{ja,en}.txt` | Firefox AMO の日英 Summary / Description の正本 |
| `docs/privacy-policy*.md` | プライバシーポリシー (日本語・英語) |
| `debug/` | DevTools Trace などローカルデバッグ用のアーティファクト置き場 (`.gitignore` 対象) |

画像生成スクリプトは `-OutputDirectory` の明示指定が必須。既存掲載画像を更新する場合も、意図する出力先を指定する。

```powershell
pwsh -File webstore/images/generate-tiles.ps1 -OutputDirectory .\debug\webstore-images
pwsh -File webstore/screenshots/generate-slides.ps1 -OutputDirectory .\debug\webstore-screenshots
```

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

### ストア掲載情報

リポジトリルートで実行する。AMO 更新は公開依頼時のみ実行し、事前に同じコマンドへ `--dry-run` を付けて入力を確認する。

```powershell
bun "$HOME/.agents/skills/vava/scripts/update-amo-listing.mjs" --slug 'darkblue-theme-x' --listing 'ja=webstore/store-listing.firefox.ja.txt' --listing 'en-US=webstore/store-listing.firefox.en.txt' --privacy 'ja=docs/privacy-policy.md' --privacy 'en-US=docs/privacy-policy-en.md'
```

### CWS 公開のHTTP境界

`publish.yml` はビルド済みZIPを `scripts/Publish-Cws.ps1`（PowerShell 7）へ渡す。既存のOAuth secrets・publisher/item IDを維持し、ZIPをストリーム送信し、upload成功を確認してからpublishする。重複・通信断・不明な応答を公開成功として扱わず、ストア状態を確認してから再開する。公開専用npm CLIは使用しない。変更時はHTTP fixtureで成功・版/ID不一致・upload失敗・publish拒否を確認する。

### AMO 公開のHTTP境界

公開workflowは生成した最終XPIを既存の配布物検証へ通し、SHA-256・GUID・versionを `scripts/Publish-Amo.ps1`（PowerShell 7.2 以上）へ渡す。旧web-ext sign/承認タイムアウトを成功化する手順に代えて、JWT認証・全ページの非公開listed版検査・upload検証・GUIDに対するPUT提出の受付応答まで確認する。XPIの同一snapshotをhash検証と送信に使い、保存UUIDの再利用・重複・不明な受付結果は停止する。CI成功は審査完了・ストア公開を意味しない。

CWS公開workflowはrepository固定のconcurrency groupで直列化する。同期uploadの成功・ID・版を確認した場合だけpublishし、非同期uploadはAPI v2でdraft版を要求と結び付けられないため停止する。APIにはuploadとpublishの原子的なCASが無いため、提出中はDashboardや他の手動公開操作を並行しない。

### CI中間成果物

job間の検証済み成果物はprivate R2へSigV4で保存し、repository・commit・run・producer attemptのidentityと各ファイルのSHA-256/サイズを検証して復元する。設定は `vars.CLOUDFLARE_ACCOUNT_ID` / `vars.R2_ARTIFACT_BUCKET` と `secrets.R2_ARTIFACT_ACCESS_KEY_ID` / `secrets.R2_ARTIFACT_SECRET_ACCESS_KEY`。キーは当該bucket限定。`ci-artifacts/` は30日保持後にlifecycleで削除され、恒久配布とは区別する。

## Bun依存の脆弱性検出

依存の固定復元は `bun run deps` を使う。lock欠落・破損を拒否し、`[run] bun=true` 経由で依存のpostinstallまでBunで実行する。Node.jsがあるPCでも通常の `bun install` を直接使う経路へ戻さない。

ローカルでは `bun audit` でlock全体を監査できる。Dependabotの更新PRでは、Dependency validationで公開時と同じ照合スクリプトを使い、Chrome ZIPとFirefox XPIの版・構成・内容を検証してからFirefoxのlintを実行する。

依存の安全性は `bun --bun run test:dependencies` で実際の web-ext → addons-linter が使う deepmerge を検証する。CVE-2026-93753（GHSA-gcqx-w48m-w2h4）は公式修正版が未公開のため、`patches/deepmerge@4.3.1.patch` で own データ属性として書き込み、戻り値の prototype 汚染を防ぐ暫定対応を行う。公式修正版が出たらパッチを置換する。版に基づく `bun audit` の deepmerge 警告は残るため、監査成功とは扱わない。minimatch は 11.0.4 以降、関連する multimatch は 8 系へ固定し、ESLint の eslintrc / config-array へ ESM named import 互換パッチを適用する。web-ext 10.8.0 は Windows の秘密ファイル・依存・成果物の除外を保つため、FileFilter に windowsPathsNoEscape を渡す互換パッチを適用する。node-forge は公式修正版 1.4.2 を使用する。
