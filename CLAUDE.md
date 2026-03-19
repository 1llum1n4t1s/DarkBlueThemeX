# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) that converts X (formerly Twitter)'s black/Lights Out dark theme into the classic DarkBlue (Dim) theme. Published on Chrome Web Store as "帰ってきたDarkBlueテーマ(X)". Version is the single source of truth in `manifest.json` (popup reads it dynamically via `chrome.runtime.getManifest()`). Zero external dependencies — pure vanilla JS and CSS.

## Build & Package

```bash
# Windows
powershell -File zip.ps1

# Unix/macOS
bash zip.sh
```

Both produce `DarkBlueThemeX.zip` for Chrome Web Store upload. No npm, no build tools, no compilation step.

To test locally: load the project folder as an unpacked extension at `chrome://extensions` with Developer Mode enabled.

## Architecture

### Hybrid CSS + JavaScript Theme Engine

Two layers work together to transform colors:

1. **CSS layer** (`src/styles/darkblue.css`) — Static rules scoped under `html.darkbluethemex-active` guard class. Overwrites `r-*` atomic classes and handles special cases (avatars, notifications).

2. **JS layer** (`src/content.js`) — Switches `data-theme="dark"` to `"dim"` on `<html>` to activate X's built-in DarkBlue CSS custom properties. Also runs periodic inline style fixes via `BG_FIXES`, `TEXT_FIXES`, `BORDER_FIXES` Maps for colors that CSS attribute selectors can't catch.

### Guard Class Pattern

All theming is controlled by a single class on `<html>`:
- **Enable:** `document.documentElement.classList.add('darkbluethemex-active')`
- **Disable:** `deactivateTheme()` — removes class, restores original `<meta name="theme-color">`, stops periodic scan

CSS rules are all scoped under `html.darkbluethemex-active`, so removing the class instantly disables the entire theme with no side effects.

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

### Special Element Handling

- **Notifications page** — `data-dbtx-page="notifications"` set on `<html>` for CSS to apply transparent backgrounds (avatar visibility)
- **Inline style periodic scan** — `fixAllInlineStyles()` runs every 3s using `:not(body)[style]` selector to catch React re-renders that reapply black-theme inline colors. Timer is created once and reused (skips recreation if already running).
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
| `src/content.js` | Main theme engine — `data-theme` switching, MutationObserver, inline style fixes |
| `src/styles/darkblue.css` | Static CSS theme rules, scoped under guard class |
| `src/popup/popup.html` | Extension popup UI |
| `src/popup/popup.js` | Toggle logic, storage writes, tab state queries, message passing to content script |
| `src/popup/popup.css` | Popup styling with DarkBlue palette CSS variables (all swatch colors reference these variables) |

## Coding Conventions

- All code and comments are in Japanese
- Content script is wrapped in an IIFE with `'use strict'`
- CSS sections are numbered and commented (e.g., `/* === 1. ルート・Body === */`)
- `!important` is used in CSS to override X's inline styles — this is intentional
- `run_at: "document_start"` in manifest prevents Flash of Unstyled Content (FOUC)
- DOM elements queried repeatedly are cached in module-scope variables (popup.js: `cacheElements()`, content.js: `_metaThemeColor`)

## Key Constraints

- Target: Chrome 110+ only
- Host permissions: `x.com/*` and `twitter.com/*` only
- Permissions: `storage` + `activeTab` (minimal)
- No background/service worker — all logic in content script + popup
- Content script and popup run in separate contexts — cannot share modules (constants like `STORAGE_KEY` and message type strings are duplicated by design)
- X frequently changes its DOM structure and class names — CSS selectors may need updates when X deploys changes
