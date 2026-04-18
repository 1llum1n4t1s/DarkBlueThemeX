# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) that converts X (formerly Twitter)'s black/Lights Out dark theme into the classic DarkBlue (Dim) theme. Published on Chrome Web Store as "帰ってきたDarkBlueテーマ(X)". Version is the single source of truth in `manifest.json` (popup reads it dynamically via `chrome.runtime.getManifest()`). Zero external dependencies — pure vanilla JS and CSS.

## Build & Package

```bash
# Windows
powershell -File zip.ps1
npm run zip:win     # package.json 経由 (同じ処理)

# Unix/macOS
bash zip.sh
npm run zip         # = npm run zip:nix
```

Both produce `DarkBlueThemeX.zip` for Chrome Web Store upload. No build tools, no compilation step — `package.json` の scripts はシェルスクリプトの薄いラッパー。Included: `manifest.json`, `src/`, `icons/`. Excluded: editor/system files (`*.DS_Store`, `*.swp`, `*~`), docs, and dev files.

アイコン再生成が必要な場合は `npm run generate-icons` (Node.js + `sharp` を使用。`icons/icon16.png`・`icon48.png`・`icon128.png` を出力)。devDependencies は `sharp` (アイコン生成) と `chrome-webstore-upload-cli` (CI 用) の2つに固定。**ランタイム依存はゼロ**。

`npm run check-version` で `package.json` と `manifest.json` の version 一致を検証できる (CI ステップでも実行される)。

To test locally: load the project folder as an unpacked extension at `chrome://extensions` with Developer Mode enabled.

## Release & CI (自動公開ワークフロー)

`.github/workflows/publish.yml` は `release/**` ブランチに push されると起動し、Chrome Web Store に自動アップロード＆公開する。

- ブランチ名と `manifest.json` の `version` が **完全一致必須**（例: `release/1.0.40` ⇔ `"version": "1.0.40"`）。不一致なら CI が失敗する。
- `package.json` と `manifest.json` の version 同期も `npm run check-version` で検証される（不一致なら CI 失敗）。
- zip は `bash zip.sh` を CI 内で直接呼び出す形に統一済み（過去はインラインコマンドだったが、パッケージ内容物定義を 1 箇所に集約するため）。
- Chrome Web Store CLI は `devDependencies` 固定バージョン (`chrome-webstore-upload-cli@3.3.2`) で、CI は `./node_modules/.bin/chrome-webstore-upload` を使う（過去は `npx --yes` で毎回 latest を取得していたが、サプライチェーン観点で廃止）。
- GitHub Actions 依存と npm 依存は `.github/dependabot.yml` で週次自動更新。
- Secrets 必須: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID`。
- リリース手順は `vava` スキル（`/vava`）が自動化: バージョン +1 → main に push → `release/x.y.z` ブランチ作成 → 古いリリースブランチ削除。

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

### Theme Detection via data-theme Attribute

The extension reads `document.documentElement.dataset.theme`:
- `"dark"` → X's black theme detected → convert to `"dim"` and apply DarkBlue
- `"dim"` → DarkBlue already active → maintain guard class
- Other (light, etc.) → deactivate

### MutationObserver Smart Filtering

The observer watches only `data-theme` and `class` attributes on `<html>` (and `data-theme` on `<body>` for jf-element pages). The callback checks current attribute values to determine if a mutation was self-inflicted:
- `data-theme` change: **GUARD_CLASS 付与済みの `"dim"`** は自分が設定した値としてスキップ。GUARD_CLASS 未付与の `"dim"` は X 公式 Dim 設定や他拡張由来なので再評価する（この区別を入れないと自己変更誤検知で初期適用が漏れる）。extension 無効時は常にスキップ。
- `class` change: only react if guard class was externally removed while theme is `"dim"`

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

**重複リテラル管理**: `STORAGE_KEY = 'darkblue_enabled'` と `'darkblue:getState'` は content.js と popup.js の両方に独立してハードコードされている（Chrome 拡張のコンテキスト分離で共有モジュール不可）。変更時は必ず両ファイルを同時更新すること。各リテラル定義箇所には対応箇所のファイルパスをコメントとして併記済み。

### File Roles

| File | Role |
|------|------|
| `manifest.json` | Extension config, version (single source of truth), permissions, 2 content scripts (isolated + MAIN world) |
| `src/content.js` | Main theme engine (isolated world) — `data-theme` switching, MutationObserver, intercept ON/OFF 属性制御 |
| `src/intercept.js` | MAIN world から `Element.prototype.setAttribute`/`removeAttribute` を同期的にラップ (FOUC 防止最終防衛線) |
| `src/styles/darkblue.css` | Static CSS theme rules, FOUC prevention, scoped under guard class and data-theme selectors |
| `src/popup/popup.html` | Extension popup UI |
| `src/popup/popup.js` | Toggle logic, storage writes, tab state queries, message passing to content script |
| `src/popup/popup.css` | Popup styling with DarkBlue palette CSS variables (all swatch colors reference these variables) |

### Repository Layout (Reference)

リリース zip には含まれない補助ディレクトリ:

| Path | 用途 |
|------|------|
| `scripts/generate-icons.js` | 拡張機能アイコン (16/48/128px) 生成スクリプト (Node.js + sharp) |
| `scripts/check-version.js` | `package.json` と `manifest.json` の version 一致を検証 (CI 実行) |
| `.github/workflows/publish.yml` | `release/**` push で Chrome Web Store 自動公開 |
| `.github/dependabot.yml` | GitHub Actions と npm 依存の週次自動更新 |
| `webstore/images/` | Chrome Web Store 掲載用タイル画像と生成スクリプト |
| `webstore/screenshots/` | ストアリスティング用スクリーンショットと生成スクリプト |
| `docs/privacy-policy*.md` | プライバシーポリシー (日本語・英語) |
| `debug/` | DevTools Trace などローカルデバッグ用のアーティファクト置き場 (`.gitignore` 対象) |

> CLAUDE.md が唯一の正規ガイド。過去に存在した `AGENTS.md` (Codex 用の並行ドキュメント) は情報がドリフトする問題があったため削除済み。Codex を使う場合も CLAUDE.md を参照させること。

## Version Update

Version の唯一の真実は `manifest.json` の `"version"` フィールド。popup.js は `chrome.runtime.getManifest().version` で動的取得するため、popup 側の変更は不要。`package.json` の `"version"` は npm エコシステム互換のため保持しているが、`npm run check-version` （CI でも実行）で manifest と一致しているかを検証する。`/vava` スキルが両方を同時にインクリメントする。

## Coding Conventions

- All code and comments are in Japanese
- Content / intercept script はどちらも IIFE + `'use strict'`。拡張リロード時の二重注入防止のため `window.__dbtx_content_installed__` / `window.__dbtx_intercept_installed__` グローバル印を冒頭で確認し、true ならば即リターンする
- CSS sections are numbered and commented (e.g., `/* === 1. ルート・Body === */`)
- `!important` is used in CSS to override X's inline styles — this is intentional
- `run_at: "document_start"` in manifest for early CSS injection
- DOM elements queried repeatedly are cached in module-scope variables (popup.js: `cacheElements()`, content.js: `_metaThemeColor`)
- `chrome.runtime.onMessage` ハンドラ冒頭で `sender.id === chrome.runtime.id` を必ず検証する（他拡張からの偽装メッセージブロック）

## Key Constraints

- Target: Chrome 110+ only (MV3 の `world: "MAIN"` content script を使うため)
- Host permissions: `x.com/*` and `twitter.com/*` only
- Permissions: `storage` + `activeTab` (minimal)
- `content_security_policy.extension_pages`: `script-src 'self'; object-src 'self'` を明示 (デフォルトと同等だが将来のリグレッション防止のため)
- No background/service worker — all logic in 2 content scripts (isolated + MAIN) + popup
- 3 実行コンテキスト (content.js = isolated world / intercept.js = MAIN world / popup = extension page) は共有モジュール不可。定数は `STORAGE_KEY` と `'darkblue:getState'` のみ重複、両側同時更新必須
- X frequently changes its DOM structure and class names — CSS selectors may need updates when X deploys changes
