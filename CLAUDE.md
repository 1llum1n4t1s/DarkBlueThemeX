# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cross-browser Manifest V3 拡張機能 (Chrome / Edge / Brave / Firefox 142+) で、X (旧 Twitter) の黒/Lights Out テーマを旧 DarkBlue(Dim) テーマに変換する。Chrome Web Store には「帰ってきたDarkBlueテーマ(X)」として公開、Firefox AMO 対応済み (ストアリスティングは別途申請)。**Version の真実の源は `manifest.json`** で、`manifest.firefox.json` と `package.json` は CI の `pnpm run check-version` で 3 ファイル同期を強制。popup は `chrome.runtime.getManifest().version` で動的取得。Zero external dependencies — pure vanilla JS と CSS のみ。

## Build & Package

```bash
# Windows (Chrome + Firefox 両方)
powershell -File zip.ps1
pnpm run zip:win                  # package.json 経由 (同じ処理)

# Unix/macOS (Chrome + Firefox 両方)
bash zip.sh
pnpm run zip                      # = pnpm run zip:nix

# variant 個別
bash zip.sh chrome                # Chrome のみ
bash zip.sh firefox               # Firefox のみ
powershell -File zip.ps1 -Target chrome
powershell -File zip.ps1 -Target firefox
```

成果物:
- **`DarkBlueThemeX-chrome.zip`** — Chrome Web Store にアップロードする ZIP
- **`DarkBlueThemeX-firefox.xpi`** — Firefox AMO にアップロードする XPI (中身は ZIP、`manifest.firefox.json` を `manifest.json` にリネームして同梱)

No build tools, no compilation step — `package.json` の scripts はシェルスクリプトの薄いラッパー。Included: variant 別 manifest, `src/`, `icons/`. Excluded: editor/system files (`*.DS_Store`, `*.swp`, `*~`), docs, dev files。

**Windows の zip.ps1 は `System.IO.Compression.ZipFile` を直接使い、エントリ名を forward slash に正規化**している (Windows PowerShell 5.1 の `Compress-Archive` は backslash separator で zip を作る既知バグがあり、Firefox AMO の web-ext lint と一部の unzip ツールが弾くため)。

アイコン再生成が必要な場合は `pnpm run generate-icons` (Node.js + `sharp` を使用。`icons/icon16.png`・`icon48.png`・`icon128.png` を出力)。devDependencies は `sharp` (アイコン生成) と `chrome-webstore-upload-cli` (CWS CI 用) と `web-ext` (AMO CI 用) の 3 つに固定。**ランタイム依存はゼロ**。

`pnpm run check-version` で `package.json` / `manifest.json` / `manifest.firefox.json` の version 三者一致を検証できる (CI ステップでも実行される)。

To test locally:
- **Chrome / Edge / Brave**: `chrome://extensions` で「パッケージ化されていない拡張機能を読み込む」からプロジェクトフォルダを選択
- **Firefox**: `bash zip.sh firefox` でビルドした `DarkBlueThemeX-firefox.xpi` を `about:debugging#/runtime/this-firefox` で「一時的なアドオンとして読み込む」(セッションごとに再読み込みが必要)

## Release & CI (自動公開ワークフロー)

`.github/workflows/publish.yml` は `release/**` ブランチに push されると起動し、**Chrome Web Store と Firefox AMO に同時に**自動アップロード＆申請する。

- ブランチ名と `manifest.json` の `version` が **完全一致必須**（例: `release/1.0.40` ⇔ `"version": "1.0.40"`）。不一致なら CI が失敗する。
- `package.json` / `manifest.json` / `manifest.firefox.json` の version 三者同期も `pnpm run check-version` で検証される（不一致なら CI 失敗）。
- zip は `bash zip.sh both` を CI 内で直接呼び出す形に統一済み（過去はインラインコマンドだったが、パッケージ内容物定義を 1 箇所に集約するため）。
- Chrome Web Store CLI は `devDependencies` 固定バージョン (`chrome-webstore-upload-cli@3.5.0`) で、CI は `./node_modules/.bin/chrome-webstore-upload` を使う。v4 は publisherId 新規必須化で個人開発者の Secrets 構成と不適合なため意図的に 3.x に留めている (Dependabot が v4 を再提案してきても merge しないこと)。
- Firefox AMO は `web-ext sign --channel=listed` で提出。`.amo-metadata.json` で `version.license: "MIT"` を毎回付与（AMO API v5 では各 version 提出時に license 明示必須、過去 version から継承しないため）。
- GitHub Actions 依存と npm 依存は `.github/dependabot.yml` で週次自動更新。
- Secrets 必須:
  - **Chrome Web Store**: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID`
  - **Firefox AMO**: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`（[AMO Developer Hub](https://addons.mozilla.org/ja/developers/addon/api/key/) で発行 → `gh secret set` で登録）
- Firefox AMO ジョブは `needs: package` のみで `publish-chrome` に依存しないため、Chrome 公開が失敗しても独立して submit される（sibling job の失敗は波及しない）。`if: success() || failure()` は付けない（付けると `package` の検証 = `check-version` / `check-shared-literals` 失敗時にも firefox が走り、壊れた拡張を AMO に submit してしまうため。既定の「package 成功時のみ実行」ゲートに委ねる）。
- CI の Node は **22 固定**（pnpm 11 が Node 22+ 必須のため。ローカル開発環境とも一致）。
- `web-ext sign --channel=listed` は submission 受理後 15 分で `Approval: timeout exceeded` を返して exit 1 になる既知挙動があり、CI はそれだけは warning 扱いに変換して green 化する（submission 自体は AMO に届いている）。
- リリース手順は `vava` スキル（`/vava`）が自動化: バージョン +1 → main に push → `release/x.y.z` ブランチ作成 → 古いリリースブランチ削除。
- GitHub Actions は `actions/*` を含めすべて commit SHA で固定（サプライチェーン対策）。`# vN` コメントを手掛かりに Dependabot が SHA を追従更新する。
- ワークフローはトップレベル `concurrency`（`group: publish-${{ github.ref }}` / `cancel-in-progress: false`）で直列化し、`release/**` への連続 push 時に publish が並走して CWS の `--auto-publish` が競合するのを防ぐ。publish は不可逆な外部副作用を持つため、進行中ランをキャンセルせずキューイングして中断による部分公開を避ける。
- Chrome 公開ジョブは Firefox ジョブと対称に、`CWS_*` Secrets 欠落時の事前ガード（`-z` チェック）で fail-fast する。Secrets を扱う publish 2 ジョブは job レベル `permissions: contents: read` を明示。
- `pnpm run check-shared-literals`（CI）で `STORAGE_KEY` / `MSG_GET_STATE` の content↔popup 一致も検証する。

### 公開後のロールバック / ロールフォワード（インシデント時 runbook）

公開済みバージョンに不具合が出た場合、**前バージョンへの直接ロールバックはできない**ため、修正版を新しいバージョン番号で出し直す（ロールフォワード）。

- **Chrome Web Store**: 旧バージョンへの直戻し UI はない。修正を入れて version を上げ、`/vava` で再リリースする。影響を絞りたい場合は CWS の段階公開（percentage rollout）も検討。
- **Firefox AMO**: 同一 version の再 submit は `Version ... already exists` で **warning 化され反映されない**（`publish.yml` が green 化する既知挙動）。必ず version 番号を上げてから出し直すこと。
- version は 3 ファイル一致 + ブランチ名一致が CI で強制されるため、`/vava` 経由で番号を上げるのが最短経路。

## Firefox AMO 対応の構造

- `manifest.firefox.json` が Firefox 専用 manifest。差分は **`browser_specific_settings.gecko`** のみ:
  - `id`: `{6a3c2b7e-9d4f-4a1c-b8e5-2f7d8c9e1a3b}` (UUID 形式、初回 AMO 公開後は変更不可)
  - `strict_min_version`: `"142.0"` (`data_collection_permissions` 利用と `world: "MAIN"` content script の安全マージン)
  - `data_collection_permissions.required`: `["none"]` (収集なし宣言、AMO レビュアー向けの明示シグナル)
- DarkBlueThemeX は `chrome.offscreen` / `chrome.tabCapture` 等の Firefox 非対応 API を一切使っていないため、WebRestrictionRemoval が採用する `__FIREFOX_STRIP_BEGIN__` マーカー方式のコード物理削除は不要。`chrome.runtime` / `chrome.storage` / `chrome.tabs` のみで完結している。
- `content_scripts.world: "MAIN"` は Firefox 128+ でサポート済 (本プロジェクトは 142+ 必須)。
- web-ext lint 結果: **errors 0 / warnings 0**（2026-05-27 確認）。

## Architecture

### Hybrid CSS + JavaScript Theme Engine

Two layers work together to transform colors:

1. **CSS layer** (`src/styles/darkblue.css`) — Static rules with two selector patterns: `html.darkbluethemex-active` (post-activation) and `html[data-theme="dark"]:not(.darkbluethemex-off)` (FOUC prevention). Overwrites `r-*` atomic classes and handles special cases. Sections are numbered 1–12:
   1. ルート・Body  2. r-* アトミッククラス上書き  3. アバター背景透明化  4. 通知ページ stacking context  5. ホバー状態  6. スクロールバー  7. 検索バーボーダー  8. DM タブグラデーション  9. メニュー・ダイアログシャドウ  10. #layers ポップアップレイヤー  11. jf-element dim 対応  12. Analytics/JF ページ Tailwind CSS 変数上書き

   **FOUC セレクタ (layer 1) に追加する判断基準**: `<html>`/`<body>` 直下に即適用され JS 実行前に見える色のみ FOUC 系 (`html[data-theme="dark"]:not(.darkbluethemex-off)`) に追加する。コンポーネント内部色 (カード/ホバー/テキスト/ボーダー) は `html.darkbluethemex-active` のみで十分。

2. **JS layer** (`src/content.js`) — Switches `data-theme="dark"` to `"dim"` on `<html>` to activate X's built-in DarkBlue CSS custom properties. Inline style colors are handled entirely by CSS `[style*="..."]` attribute selectors in `darkblue.css` — no JS-based periodic scanning.

### Two-Class Guard System

Theming state is controlled by two classes on `<html>`:

- **`darkbluethemex-active`** (guard class) — Added when DarkBlue is applied. All main CSS rules are scoped under this. Removing it instantly disables the entire theme.
- **`darkbluethemex-off`** (OFF class) — Added when the extension is explicitly disabled. Deactivates CSS FOUC prevention rules (`html[data-theme="dark"]:not(.darkbluethemex-off)`). Without this, CSS would continue forcing DarkBlue colors even after the user disables the extension, because `data-theme` reverts to `"dark"`.

Enable flow: add guard class, remove OFF class, set `data-dbtx-intercept="on"` (MAIN world intercept を有効化).
Disable flow (`deactivateTheme()`): set `data-dbtx-intercept="off"`, remove guard class, add OFF class, restore `<meta name="theme-color">`.

### CSS FOUC Prevention (Multi-Layer)

CSS rules use **dual selector patterns** to prevent black flash without waiting for JS:

```css
/* Layer 1: Before JS runs — data-theme is still "dark" */
html[data-theme="dark"]:not(.darkbluethemex-off) { background-color: #15202B !important; }
html[data-theme="dark"]:not(.darkbluethemex-off) body { ... }

/* Layer 2: After JS runs — data-theme changed to "dim", guard class added */
html.darkbluethemex-active { ... }
html.darkbluethemex-active body { ... }

/* Layer 3: Inline style attribute selector catch */
html[data-theme="dark"]:not(.darkbluethemex-off) [style*="background-color: rgb(0, 0, 0)"] { ... }
```

CSS is injected before JS in manifest (`css` before `js` in content_scripts), so Layer 1 activates at CSS parse time — before any script executes.

### setAttribute Intercept (MAIN world)

X's main.js re-sets `data-theme="dark"` after page load. MutationObserver is asynchronous, so without synchronous interception the black theme would flash briefly. Solution: `src/intercept.js` は `world: "MAIN"` で実行され、`Element.prototype.setAttribute` を同期的にラップして `data-theme="dark"` → `"dim"` に変換する。**isolated world に閉じた prototype 置換では X の main.js (MAIN world) が呼ぶ `setAttribute` を捕捉できない**ため、必ず MAIN world で走らせる必要がある。

content.js (isolated world) から intercept の ON/OFF を制御する手段として、`<html>` の `data-dbtx-intercept="on|off"` 属性を使う。intercept.js はこの属性値を毎回読んで動作を切り替える。intercept.js は **二重インストール防止用に `window.__dbtx_intercept_installed__` をグローバル印として使う**。

`removeAttribute('data-theme')` は「削除して X のリセット」ではなく「`data-theme="dim"` に再設定」するよう変換し、silently 無視による混乱を避ける設計。

### Theme Detection (data-theme + color-scheme フォールバック)

`getCurrentTheme()` は以下の優先順位でテーマを判定する:
1. `document.documentElement.dataset.theme` が存在すればその値を使用（ただし拡張機能が設定した `"dim"` かつ GUARD_CLASS 付与済みの場合は `color-scheme` を優先確認し、ダークでなければ `null` を返す）
2. `data-theme` がない場合、`<html>` の inline style から `color-scheme: dark` を検出すれば `"dark"` を返す（X が `data-theme` 属性を廃止したことへの対応）
3. いずれにも該当しなければ `null`（ライトテーマ等 → deactivate）

判定結果の処理:
- `"dark"` → X の黒テーマ → `data-theme="dim"` を設定して DarkBlue 適用
- `"dim"` → DarkBlue 維持（ガードクラス保持）
- `null` / その他 → deactivate

### MutationObserver Smart Filtering

The observer watches `data-theme`, `class`, and `style` attributes on `<html>` (and `data-theme` on `<body>` for jf-element pages). The callback checks current attribute values to determine if a mutation was self-inflicted:
- `data-theme` change: **GUARD_CLASS 付与済みの `"dim"`** は自分が設定した値としてスキップ。GUARD_CLASS 未付与の `"dim"` は X 公式 Dim 設定や他拡張由来なので再評価する（この区別を入れないと自己変更誤検知で初期適用が漏れる）。extension 無効時は常にスキップ。
- `class` change: only react if guard class was externally removed while theme is `"dim"`
- `style` change: `color-scheme` の値が前回と異なる場合のみ再評価（X が `data-theme` を廃止し `color-scheme` で管理する方式に移行したため追加）。前回値キャッシュ (`_lastColorScheme`) でフィルタリングし、無関係な style 変更では発火しない。

SPA navigation detection is handled separately by History API hooks (`pushState`/`replaceState`) and `popstate` listener — not by the observer.

### DarkBlue Color Palette

| Purpose | Hex | RGB |
|---------|-----|-----|
| BG Primary | `#15202B` | 21, 32, 43 |
| BG Card | `#192734` | 25, 39, 52 |
| BG Hover | `#22303C` | 34, 48, 60 |
| Border | `#38444D` | 56, 68, 77 |
| Text Sub | `#8B98A5` | 139, 152, 165 |
| Accent | `#1D9BF0` | — |

### r-* Class Name Stability

X uses React Native Web which generates `r-*` atomic class names deterministically from CSS property values (e.g., `background-color: rgb(0,0,0)` always produces `r-kemksi`). These class names are stable across X deployments because the same CSS value always hashes to the same class name. New colors added by X may need new CSS rules.

### Adding New r-* Color Overrides

When X introduces a new dark-theme color not yet handled:

1. Inspect the element in DevTools, note the `r-*` class name and its computed RGB value
2. Map the RGB to the nearest DarkBlue palette color (see table above)
3. Add CSS rule in the appropriate section of `darkblue.css`:
   ```css
   html.darkbluethemex-active .r-XXXXX {
     background-color: #22303C !important;
   }
   ```
4. Add CSS `[style*="..."]` attribute selector in `darkblue.css` section 1 for the RGB value (see existing patterns)

### Special Element Handling

- **Notifications page** — `data-dbtx-page="notifications"` set on `<html>` for CSS to apply transparent backgrounds (avatar visibility)
- **Body data-theme** — Some X pages (Creator Studio, analytics) set `data-theme="dark"` on `<body>` via jf-element framework. The script detects and converts this separately; `_bodyThemeFixed` flag tracks whether body was modified for cleanup on deactivation.
- **Inline style color override** — CSS `[style*="..."]` attribute selectors in `darkblue.css` override React's hardcoded inline colors instantly (no JS needed). Covers background-color, color, and border-color variants.
- **Theme color meta** — `<meta name="theme-color">` is cached on first access; original value is saved and restored on deactivation. SPA で X が `<meta>` を差し替えた場合に備え、`document.contains()` でキャッシュの生存を毎回確認して必要なら再クエリする。

### State & Storage

- **`chrome.storage.sync`** — Primary toggle state (`darkblue_enabled`), synced across devices. **`chrome.storage.sync` への書き込みは popup.js のみ**; content.js は `storage.onChanged` リスナーで読むだけ。`popup` → `content` のトグル伝播はこの onChanged 経路のみ（旧実装の `'darkblue:toggle'` メッセージ送信は二重発火防止のため削除済み）。
- **`localStorage`** — `LAST_STATE_KEY` を楽観的 FOUC フラグとして使用。content.js の `document_start` 即時ブロック (IIFE 先頭) で `localStorage.getItem(LAST_STATE_KEY) === 'true'` なら `GUARD_CLASS` を即座に付与し、storage.sync の非同期解決を待たずに r-* クラス上書きルールを発動させる。content.js の書き込みはこれを読むためのもの（読み書き対称）。

### Popup ↔ Content Script Communication

1 メッセージ型のみ (hardcoded in both `src/content.js` and `src/popup/popup.js`):
- `'darkblue:getState'` — popup が現在のテーマ状態を問い合わせる（応答用）

トグル自体は `chrome.storage.sync.set` → `storage.onChanged` 経由で全タブに伝播する設計（sendMessage 経由の toggle は二重発火の原因になるため廃止）。

**重複リテラル管理**: `STORAGE_KEY = 'darkblue_enabled'` と `MSG_GET_STATE = 'darkblue:getState'` は content.js と popup.js の両方に独立してハードコードされている（Chrome 拡張のコンテキスト分離で共有モジュール不可）。変更時は必ず両ファイルを同時更新すること。各リテラル定義箇所には対応箇所を**定数名で**コメント併記している（行番号は行ズレで腐るため付さない）。一致は `scripts/check-shared-literals.js`（`pnpm run check-shared-literals`、CI でも実行）が機械検証し、片側更新漏れを CI で検出する。

### File Roles

| File | Role |
|------|------|
| `manifest.json` | Chrome / Edge / Brave 用 manifest, version (single source of truth), permissions, 2 content scripts (isolated + MAIN world) |
| `manifest.firefox.json` | Firefox AMO 用 manifest, **差分は `browser_specific_settings.gecko` のみ** (id / strict_min_version / data_collection_permissions) |
| `src/content.js` | Main theme engine (isolated world) — `data-theme` switching, MutationObserver, intercept ON/OFF 属性制御 |
| `src/intercept.js` | MAIN world から `Element.prototype.setAttribute`/`removeAttribute` を同期的にラップ (FOUC 防止最終防衛線) |
| `src/styles/darkblue.css` | Static CSS theme rules, FOUC prevention, scoped under guard class and data-theme selectors |
| `src/popup/popup.html` | Extension popup UI |
| `src/popup/popup.js` | Toggle logic, storage writes, tab state queries, message passing to content script |
| `src/popup/popup.css` | Popup styling with DarkBlue palette CSS variables (all swatch colors reference these variables) |
| `.amo-metadata.json` | Firefox AMO submission の metadata (`categories.firefox: ["appearance"]`, `version.license: "MIT"`)。 `web-ext sign --amo-metadata=` で毎回付与 |

### Repository Layout (Reference)

リリース zip には含まれない補助ディレクトリ:

| Path | 用途 |
|------|------|
| `scripts/generate-icons.js` | 拡張機能アイコン (16/48/128px) 生成スクリプト (Node.js + sharp) |
| `scripts/check-version.js` | `package.json` / `manifest.json` / `manifest.firefox.json` の version 三者一致を検証 (CI 実行) |
| `scripts/check-shared-literals.js` | content.js / popup.js の共有リテラル (`STORAGE_KEY` / `MSG_GET_STATE`) 値の一致を検証 (CI 実行) |
| `.github/workflows/publish.yml` | `release/**` push で Chrome Web Store + Firefox AMO に同時自動公開 |
| `zip.ps1` / `zip.sh` | Chrome/Firefox 両対応のパッケージ生成 (`-Target chrome|firefox|both` / `bash zip.sh chrome|firefox|both`) |
| `.github/dependabot.yml` | GitHub Actions と npm 依存の週次自動更新 |
| `webstore/images/` | Chrome Web Store 掲載用タイル画像と生成スクリプト |
| `webstore/screenshots/` | ストアリスティング用スクリーンショットと生成スクリプト |
| `docs/privacy-policy*.md` | プライバシーポリシー (日本語・英語) |
| `debug/` | DevTools Trace などローカルデバッグ用のアーティファクト置き場 (`.gitignore` 対象) |

> CLAUDE.md が唯一の正規ガイド。過去に存在した `AGENTS.md` は情報がドリフトする問題があったため削除済み。

## Version Update

Version の唯一の真実は `manifest.json` の `"version"` フィールド。popup.js は `chrome.runtime.getManifest().version` で動的取得するため、popup 側の変更は不要。`package.json` の `"version"` は npm エコシステム互換のため保持しているが、`pnpm run check-version` （CI でも実行）で manifest と一致しているかを検証する。`/vava` スキルが両方を同時にインクリメントする。

## Coding Conventions

- All code and comments are in Japanese
- Content / intercept script はどちらも IIFE + `'use strict'`。拡張リロード時の二重注入防止のため `window.__dbtx_content_installed__` / `window.__dbtx_intercept_installed__` グローバル印を冒頭で確認し、true ならば即リターンする
- CSS sections are numbered and commented (e.g., `/* === 1. ルート・Body === */`)
- `!important` is used in CSS to override X's inline styles — this is intentional
- `run_at: "document_start"` in manifest for early CSS injection
- DOM elements queried repeatedly are cached in module-scope variables (popup.js: `cacheElements()`, content.js: `_metaThemeColor`)
- `chrome.runtime.onMessage` ハンドラ冒頭で `sender.id === chrome.runtime.id` を必ず検証する（他拡張からの偽装メッセージブロック）

## Key Constraints

- Target: Chrome 110+ / Firefox 142+ (MV3 の `world: "MAIN"` content script を使うため。Firefox は 128 から MAIN world 対応だが、`data_collection_permissions` を使うため 142+ に統一)
- Host permissions: `x.com/*` and `twitter.com/*` only
- Permissions: `storage` + `activeTab` (minimal)
- `content_security_policy.extension_pages`: `script-src 'self'; object-src 'self'` を明示 (デフォルトと同等だが将来のリグレッション防止のため)
- No background/service worker — all logic in 2 content scripts (isolated + MAIN) + popup
- 3 実行コンテキスト (content.js = isolated world / intercept.js = MAIN world / popup = extension page) は共有モジュール不可。定数は `STORAGE_KEY` と `'darkblue:getState'` のみ重複、両側同時更新必須
- X frequently changes its DOM structure and class names — CSS selectors may need updates when X deploys changes
