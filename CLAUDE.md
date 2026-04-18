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

To test locally: load the project folder as an unpacked extension at `chrome://extensions` with Developer Mode enabled.

## Release & CI (自動公開ワークフロー)

`.github/workflows/publish.yml` は `release/**` ブランチに push されると起動し、Chrome Web Store に自動アップロード＆公開する。

- ブランチ名と `manifest.json` の `version` が **完全一致必須**（例: `release/1.0.40` ⇔ `"version": "1.0.40"`）。不一致なら CI が失敗する。
- zip は `zip -r DarkBlueThemeX.zip manifest.json src icons -x "*.DS_Store" "*.swp" "*~"` で作成（`zip.sh`/`zip.ps1` と同じ内容物）。
- Secrets 必須: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID`。
- リリース手順は `vava` スキル（`/vava`）が自動化: バージョン +1 → main に push → `release/x.y.z` ブランチ作成 → 古いリリースブランチ削除。

## Architecture

### Hybrid CSS + JavaScript Theme Engine

Two layers work together to transform colors:

1. **CSS layer** (`src/styles/darkblue.css`) — Static rules with two selector patterns: `html.darkbluethemex-active` (post-activation) and `html[data-theme="dark"]:not(.darkbluethemex-off)` (FOUC prevention). Overwrites `r-*` atomic classes and handles special cases. Sections are numbered 1–10:
   1. ルート・Body  2. r-* アトミッククラス上書き  3. アバター背景透明化  4. 通知ページ stacking context  5. ホバー状態  6. スクロールバー  7. 検索バーボーダー  8. DM タブグラデーション  9. メニュー・ダイアログシャドウ  10. #layers ポップアップレイヤー

2. **JS layer** (`src/content.js`) — Switches `data-theme="dark"` to `"dim"` on `<html>` to activate X's built-in DarkBlue CSS custom properties. Inline style colors are handled entirely by CSS `[style*="..."]` attribute selectors in `darkblue.css` — no JS-based periodic scanning.

### Two-Class Guard System

Theming state is controlled by two classes on `<html>`:

- **`darkbluethemex-active`** (guard class) — Added when DarkBlue is applied. All main CSS rules are scoped under this. Removing it instantly disables the entire theme.
- **`darkbluethemex-off`** (OFF class) — Added when the extension is explicitly disabled. Deactivates CSS FOUC prevention rules (`html[data-theme="dark"]:not(.darkbluethemex-off)`). Without this, CSS would continue forcing DarkBlue colors even after the user disables the extension, because `data-theme` reverts to `"dark"`.

Enable flow: add guard class, remove OFF class, install setAttribute intercept.
Disable flow (`deactivateTheme()`): deactivate intercept, remove guard class, add OFF class, restore `<meta name="theme-color">`.

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

### setAttribute Intercept

X's main.js re-sets `data-theme="dark"` after page load. MutationObserver is asynchronous, so without synchronous interception the black theme would flash briefly. Solution: `installAttributeIntercept()` wraps `Element.prototype.setAttribute` to convert `data-theme="dark"` → `"dim"` synchronously. Also blocks `removeAttribute` on `data-theme` to prevent X from deleting the attribute.

The `_attrInterceptActive` flag controls the hook. On deactivation the flag is set to `false` (making the hook a no-op) but prototypes are NOT restored, to avoid conflicts with other extensions.

### Theme Detection via data-theme Attribute

The extension reads `document.documentElement.dataset.theme`:
- `"dark"` → X's black theme detected → convert to `"dim"` and apply DarkBlue
- `"dim"` → DarkBlue already active → maintain guard class
- Other (light, etc.) → deactivate

### MutationObserver Smart Filtering

The observer watches only `data-theme` and `class` attributes on `<html>` (no childList, no subtree). The callback checks current attribute values to determine if a mutation was self-inflicted:
- `data-theme` change: skip if current theme is `"dim"` (self-set) or extension disabled
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
- **Theme color meta** — `<meta name="theme-color">` is cached on first access; original value is saved and restored on deactivation.

### State & Storage

- **`chrome.storage.sync`** — Primary toggle state (`darkblue_enabled`), synced across devices. **Write responsibility is in popup.js only**; content.js reads via `storage.onChanged` listener.
- **`localStorage`** — `LAST_STATE_KEY` for FOUC prevention (optimistic guard class at `document_start`)

### Popup ↔ Content Script Communication

Two message types (hardcoded strings in both `src/content.js` and `src/popup/popup.js`):
- `'darkblue:toggle'` — popup sends enable/disable command (popup writes to storage, content script applies theme)
- `'darkblue:getState'` — popup queries current theme state

### File Roles

| File | Role |
|------|------|
| `manifest.json` | Extension config, version (single source of truth), permissions, content script registration |
| `src/content.js` | Main theme engine — `data-theme` switching, MutationObserver, setAttribute intercept |
| `src/styles/darkblue.css` | Static CSS theme rules, FOUC prevention, scoped under guard class and data-theme selectors |
| `src/popup/popup.html` | Extension popup UI |
| `src/popup/popup.js` | Toggle logic, storage writes, tab state queries, message passing to content script |
| `src/popup/popup.css` | Popup styling with DarkBlue palette CSS variables (all swatch colors reference these variables) |

### Repository Layout (Reference)

リリース zip には含まれない補助ディレクトリ:

| Path | 用途 |
|------|------|
| `scripts/generate-icons.ps1` | 拡張機能アイコン (16/48/128px) 生成スクリプト |
| `webstore/images/` | Chrome Web Store 掲載用タイル画像と生成スクリプト |
| `webstore/screenshots/` | ストアリスティング用スクリーンショットと生成スクリプト |
| `docs/privacy-policy*.md` | プライバシーポリシー (日本語・英語) |
| `debug/` | DevTools Trace などローカルデバッグ用のアーティファクト置き場 (`.gitignore` 対象) |

> CLAUDE.md が唯一の正規ガイド。過去に存在した `AGENTS.md` (Codex 用の並行ドキュメント) は情報がドリフトする問題があったため削除済み。Codex を使う場合も CLAUDE.md を参照させること。

## Version Update

Version の唯一の真実は `manifest.json` の `"version"` フィールド。popup.js は `chrome.runtime.getManifest().version` で動的取得するため、他ファイルの変更は不要。

## Coding Conventions

- All code and comments are in Japanese
- Content script is wrapped in an IIFE with `'use strict'`
- CSS sections are numbered and commented (e.g., `/* === 1. ルート・Body === */`)
- `!important` is used in CSS to override X's inline styles — this is intentional
- `run_at: "document_start"` in manifest for early CSS injection
- DOM elements queried repeatedly are cached in module-scope variables (popup.js: `cacheElements()`, content.js: `_metaThemeColor`)

## Key Constraints

- Target: Chrome 110+ only
- Host permissions: `x.com/*` and `twitter.com/*` only
- Permissions: `storage` + `activeTab` (minimal)
- No background/service worker — all logic in content script + popup
- Content script and popup run in separate contexts — cannot share modules (constants like `STORAGE_KEY` and message type strings are duplicated by design)
- X frequently changes its DOM structure and class names — CSS selectors may need updates when X deploys changes
