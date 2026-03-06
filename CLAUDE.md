# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) that converts X (formerly Twitter)'s black/Lights Out dark theme into the classic DarkBlue (Dim) theme. Published on Chrome Web Store as "帰ってきたDarkBlueテーマ(X)". Version is in `manifest.json`. Zero external dependencies — pure vanilla JS and CSS.

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

1. **CSS layer** (`src/styles/darkblue.css`) — Static rules scoped under `html.darkbluethemex-active` guard class. Handles known selectors, `data-testid` attributes, and `[style*="..."]` attribute selectors.

2. **JS layer** (`src/content.js`) — Runtime color detection via MutationObserver. Parses computed/inline RGB values against `COLOR_MAP`, `BORDER_MAP`, `TEXT_MAP` and rewrites inline styles. Catches dynamically-applied colors that CSS alone can't target.

### Guard Class Pattern

All theming is controlled by a single class on `<html>`:
- **Enable:** `document.documentElement.classList.add('darkbluethemex-active')`
- **Disable:** remove the class + clear inline style overrides

CSS rules are all scoped under `html.darkbluethemex-active`, so removing the class instantly disables the entire theme with no side effects.

### Black Theme Detection

The extension only activates when X's black theme is detected (`body` background RGB values all ≤ 5). Light theme users are never affected. Detection result is cached for 1 second (`_bodyBgCache`) to avoid reflow.

### DarkBlue Color Palette

| Purpose | Hex | RGB |
|---------|-----|-----|
| BG Primary | `#15202B` | 21, 32, 43 |
| BG Card | `#192734` | 25, 39, 52 |
| BG Hover | `#22303C` | 34, 48, 60 |
| Border | `#38444D` | 56, 68, 77 |
| Text Sub | `#8B98A5` | 139, 152, 165 |
| Accent | `#1D9BF0` | — |

### Performance Optimizations in content.js

The content script uses tagged comments `[A1]`–`[A15]` for key optimizations:

- **rAF batching** `[A1]` — Collects pending nodes, processes in single animation frame
- **Smart periodic scan** `[A2]` — 5s active / 10s when tab hidden, only runs when `_dirtyFlag` set
- **Body BG cache** `[A3]` — 1-second TTL to avoid reflow
- **Parse cache** `[A4]` — Map with 500-entry limit for RGB string parsing
- **Observer suppression** `[A8]` — `_suppressObserver` flag prevents recursive triggers
- **WeakSet tracking** `[A9]` — `_processedElements` avoids re-processing without memory leaks
- **TreeWalker** `[A10]` — Limited to 20 elements per traversal
- **Debouncing** `[A15]` — `_evalDebounce` / `_scanDebounce` prevent thrashing

### Special Element Handling

- **Avatars** — Elements matching `data-testid*="UserAvatar"` are skipped (X uses z-index:-1 background images)
- **Notifications page** — Requires transparent background to show avatar images
- **"New Posts" banner** — Marked with `data-dbtx-skip` attribute to preserve transparency
- **Backdrop-filter headers** — `rgba(0,0,0,X)` converted to `rgba(21,32,43,X)`
- **Hover states** — Elements with `:hover` CSS rules skip inline style to preserve cascade

### State & Storage

- **`chrome.storage.sync`** — Primary toggle state (`darkblue_enabled`), synced across devices
- **`localStorage`** — `LAST_STATE_KEY` for FOUC prevention (optimistic guard class at `document_start`)

### File Roles

| File | Role |
|------|------|
| `manifest.json` | Extension config, version, permissions, content script registration |
| `src/content.js` | Main theme engine — detection, MutationObserver, color rewriting |
| `src/styles/darkblue.css` | Static CSS theme rules (26 sections), scoped under guard class |
| `src/popup/popup.html` | Extension popup UI |
| `src/popup/popup.js` | Toggle logic, tab state queries, message passing to content script |
| `src/popup/popup.css` | Popup styling with DarkBlue palette CSS variables |

## Coding Conventions

- All code and comments are in Japanese
- Content script is wrapped in an IIFE with `'use strict'`
- CSS sections are numbered and commented (e.g., `/* === 1. Global === */`)
- Performance-critical code has tagged optimization comments (`[A1]`–`[A15]`)
- `!important` is used in CSS to override X's inline styles — this is intentional
- `run_at: "document_start"` in manifest prevents Flash of Unstyled Content (FOUC)

## Key Constraints

- Target: Chrome 110+ only
- Host permissions: `x.com/*` and `twitter.com/*` only
- Permissions: `storage` + `activeTab` (minimal)
- No background/service worker — all logic in content script + popup
- X frequently changes its DOM structure and class names — CSS selectors may need updates when X deploys changes
