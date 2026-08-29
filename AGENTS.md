# AGENTS.md

This file provides guidance to Codex and other coding agents working in this repository.

## Project Overview

Cross-browser Manifest V3 拡張機能 (Chrome / Edge / Brave / Firefox 142+) で、X (旧 Twitter) の黒/Lights Out テーマを旧 DarkBlue(Dim) テーマに変換する。Chrome Web Store と Firefox AMO に「帰ってきたDarkBlueテーマ(X)」として公開済み。**Version の真実の源は `manifest.json`** で、`manifest.firefox.json` と `package.json` は CI の `pnpm run check-version` で 3 ファイル同期を強制。popup は `chrome.runtime.getManifest().version` で動的取得。製品実行時の外部依存はなく、配布物はローカル同梱した vanilla JS と CSS だけで動作する。

## Build & Package

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

アイコン再生成が必要な場合は `pnpm run generate-icons` (Node.js + `sharp` を使用。`icons/icon16.png`・`icon48.png`・`icon128.png` を出力)。devDependencies は `sharp` (アイコン生成)、`chrome-webstore-upload-cli` (CWS CI 用)、`web-ext` (AMO CI 用)、`kagayoi-support-extension` (問い合わせ共通部品の同期元) に限定する。**ランタイム依存はゼロ**。

問い合わせ共通部品は、固定した `kagayoi-support-extension` から `pnpm run sync:support` で `src/shared/kagayoi-support-{footer,popup}.{js,css}` と `kagayoi-support-form.css` へ同期する。依存更新後は同期を実行し、共通仕様の変更は上流パッケージ、DarkBlueThemeX 固有の見た目は `src/popup/popup.css` の上書きへ置く。

通常の必須検証は `pnpm exec kagayoi-support-sync --check` と `pnpm run check`。前者は同期生成物、後者は version 三者一致、実行コンテキスト間の共有リテラル、問い合わせ権限、テーマ復元契約を検証する。version だけを個別確認する場合は `pnpm run check-version` を使う。

To test locally:
- **Chrome / Edge / Brave**: `chrome://extensions` で「パッケージ化されていない拡張機能を読み込む」からプロジェクトフォルダを選択
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
- `web-ext sign --channel=listed` は submission 受理後 15 分で `Approval: timeout exceeded` を返して exit 1 になる既知挙動があり、CI はそれだけは warning 扱いに変換して green 化する（submission 自体は AMO に届いている）。
- リリース手順は `vava` スキル（`/vava`）が自動化: バージョン +1 → main に push → `release/x.y.z` ブランチ作成 → 古いリリースブランチ削除。
- GitHub Actions は `actions/*` を含めすべて commit SHA で固定（サプライチェーン対策）。`# vN` コメントを手掛かりに Dependabot が SHA を追従更新する。
- ワークフローはトップレベル `concurrency`（`group: publish-${{ github.ref }}` / `cancel-in-progress: false`）で直列化し、`release/**` への連続 push 時に publish が並走して CWS の `--auto-publish` が競合するのを防ぐ。publish は不可逆な外部副作用を持つため、進行中ランをキャンセルせずキューイングして中断による部分公開を避ける。
- Chrome 公開ジョブは Firefox ジョブと対称に、`CWS_*` Secrets 欠落時の事前ガード（`-z` チェック）で fail-fast する。Secrets を扱う publish 2 ジョブは job レベル `permissions: contents: read` を明示。
- `pnpm run check-shared-literals`（CI）で `STORAGE_KEY` / `MSG_GET_STATE` の content↔popup 一致と、`LOCATION_CHANGE_EVENT` / 3つの `THEME_*_EVENT` の content↔intercept 一致も検証する。

### 公開後のロールバック / ロールフォワード（インシデント時 runbook）

公開済みバージョンに不具合が出た場合、**前バージョンへの直接ロールバックはできない**ため、修正版を新しいバージョン番号で出し直す（ロールフォワード）。

- **Chrome Web Store**: 旧バージョンへの直戻し UI はない。修正を入れて version を上げ、`/vava` で再リリースする。影響を絞りたい場合は CWS の段階公開（percentage rollout）も検討。
- **Firefox AMO**: 同一 version の再 submit は `Version ... already exists` で **warning 化され反映されない**（`publish.yml` が green 化する既知挙動）。必ず version 番号を上げてから出し直すこと。
- version は 3 ファイル一致 + ブランチ名一致が CI で強制されるため、`/vava` 経由で番号を上げるのが最短経路。

## Firefox AMO 対応の構造

- `manifest.firefox.json` が Firefox 専用 manifest。主な差分は **`browser_specific_settings.gecko`**:
  - `id`: `{6a3c2b7e-9d4f-4a1c-b8e5-2f7d8c9e1a3b}` (UUID 形式、初回 AMO 公開後は変更不可)
  - `strict_min_version`: `"142.0"` (`data_collection_permissions` 利用と `world: "MAIN"` content script の安全マージン)
  - `data_collection_permissions.required`: `["none"]`（問い合わせを使わない通常動作では収集なし）
  - `data_collection_permissions.optional`: `["personallyIdentifyingInfo", "authenticationInfo", "personalCommunications", "technicalAndInteraction"]`（問い合わせボタン操作時に `permissions.request({ data_collection: ... })` で同意を取得）
- `support.kagayoi.com` は Chrome / Firefox とも `optional_host_permissions` とし、問い合わせボタン操作時に要求する。Firefox は同じ `permissions.request()` で任意データ収集権限も一括要求する。
- DarkBlueThemeX は `chrome.offscreen` / `chrome.tabCapture` 等の Firefox 非対応 API を一切使っていないため、WebRestrictionRemoval が採用する `__FIREFOX_STRIP_BEGIN__` マーカー方式のコード物理削除は不要。`chrome.runtime` / `chrome.storage` / `chrome.tabs` のみで完結している。
- `content_scripts.world: "MAIN"` は Firefox 128+ でサポート済 (本プロジェクトは 142+ 必須)。
- web-ext lint 結果: **errors 0 / notices 0 / warnings 0**（2026-08-28 確認）。

## Architecture

### Hybrid CSS + JavaScript Theme Engine

Two layers work together to transform colors:

1. **CSS layer** (`src/styles/darkblue.css`) — Static rules with two selector patterns: `html.darkbluethemex-active` (post-activation) and `html[data-theme="dark"]:not(.darkbluethemex-off)` (FOUC prevention). Overwrites `r-*` atomic classes and handles special cases. Sections are numbered 1–13:
   1. ルート・Body  2. r-* アトミッククラス上書き  3. アバター背景透明化  4. 通知ページ stacking context  5. ホバー状態  6. スクロールバー  7. 検索バーボーダー  8. DM タブグラデーション  9. メニュー・ダイアログシャドウ  10. #layers ポップアップレイヤー  11. jf-element 対応  12. Analytics/JF/ログイン画面 Tailwind CSS 変数上書き  13. `--x-*` デザイントークン上書き

   **FOUC セレクタ (layer 1) に追加する判断基準**: `<html>`/`<body>` 直下に即適用され JS 実行前に見える色のみ FOUC 系 (`html[data-theme="dark"]:not(.darkbluethemex-off)`) に追加する。コンポーネント内部色 (カード/ホバー/テキスト/ボーダー) は `html.darkbluethemex-active` のみで十分。

2. **JS layer** (`src/content.js`) — Switches `data-theme="dark"` to `"dim"` on `<html>` to activate X's built-in DarkBlue CSS custom properties. Inline style colors are handled entirely by CSS `[style*="..."]` attribute selectors in `darkblue.css` — no JS-based periodic scanning.

### Two-Class Guard System

Theming state is controlled by two classes on `<html>`:

- **`darkbluethemex-active`** (guard class) — Added when DarkBlue is applied. All main CSS rules are scoped under this. Removing it instantly disables the entire theme.
- **`darkbluethemex-off`** (OFF class) — Added when the extension is explicitly disabled. Deactivates CSS FOUC prevention rules (`html[data-theme="dark"]:not(.darkbluethemex-off)`). Without this, CSS would continue forcing DarkBlue colors even after the user disables the extension, because `data-theme` reverts to `"dark"`.

Enable flow: add guard class, remove OFF class, set `data-dbtx-intercept="on"` (MAIN world intercept を有効化), `<body>` に `data-theme="dark"` マーカーを付与.
Disable flow (`deactivateTheme()`): set `data-dbtx-intercept="off"`, remove guard class, add OFF class, `restoreDataTheme()` で `data-theme` を復元, `<body>` のマーカーを元値へ復元, restore `<meta name="theme-color">`.

`restoreDataTheme()` は「拡張機能が設定した `data-theme="dim"` を戻す」処理の唯一の定義（合成 dim なら属性削除、そうでなければ `dark` へ）。intercept を OFF にした**後**に呼ぶこと（ON のままだと `dark` 書き込みが `dim` に戻される）。現在値が dim 以外なら過去の復元情報を破棄し、後続テーマへ持ち越さない。

復元の可否は **`_dimAppliedByUs`**（`dark` → `dim` 変換を自分が行ったときだけ true）で決める。この区別が無いと次のどちらかが必ず壊れる:

| 方式 | 黒テーマ利用者が OFF | X 公式 Dim 利用者が OFF |
|---|---|---|
| 無条件に復元（旧実装） | `dark` に戻る ✅ | `dark` に化ける ❌ |
| 復元しない | `dim`（＝X 内蔵 DarkBlue）が残りトグルが効かなく見える ❌ | `dim` のまま ✅ |
| **`_dimAppliedByUs` で判定（現行）** | `dark` に戻る ✅ | `dim` のまま ✅ |

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

前回有効時は content.js が storage.sync 解決前に intercept を ON にするため、X の初期 `dark` 書き込みが先に `dim` へ変換される。この変換元を失わないよう、intercept.js は `THEME_DARK_CONVERTED_EVENT` / `THEME_REMOVED_CONVERTED_EVENT` / `THEME_DIM_SELECTED_EVENT` を同期 dispatch し、content.js が `_dimAppliedByUs` / `_syntheticDim` を更新する。リスナーは楽観的 intercept ON より先に登録すること。公式 Dim の明示では過去の変換履歴を消し、OFF 時に `dark` へ誤復元しない。

`removeAttribute('data-theme')` は「削除して X のリセット」ではなく「`data-theme="dim"` に再設定」するよう変換し、silently 無視による混乱を避ける設計。変換時は削除由来イベントを送り、OFF 時には属性なしへ復元する。

### Theme Detection (data-theme + color-scheme フォールバック)

`getCurrentTheme()` は以下の優先順位でテーマを判定する:
1. `document.documentElement.dataset.theme` が存在すればその値を使用（ただし拡張機能が設定した `"dim"` かつ GUARD_CLASS 付与済みの場合は `color-scheme` を優先確認し、ダークでなければ `null` を返す）
2. `data-theme` がない場合、`<html>` の inline style の `color-scheme` が `dark` 単独なら `"dark"` を返す（X が `data-theme` 属性を廃止した場合への備え。現状の X は inline style を持たず `data-theme` を inline script で設定するため、この経路は将来向けの防御）

   値の取得は `getInlineColorScheme()` に集約し、**CSSOM の `documentElement.style.colorScheme` を使う**（style 属性の生文字列を `includes()` で部分一致させると、区切りの空白有無・プロパティ併記・大文字小文字で検出が外れる。実測で `color-scheme:dark` / `background:red;color-scheme:dark` / `COLOR-SCHEME: DARK` が旧実装では検出漏れしていた）。`only` 修飾子は除去して `only dark` を `dark` と同一視し、`light dark` のような複数値は OS 設定依存なので dark と断定しない。**`getComputedStyle` は使わない** — X の Tailwind CSS が `:root` へ `color-scheme` を宣言しており、外部スタイルシート由来の値まで拾うと「inline 指定の検出」という意味論が変わるため。
3. いずれにも該当しなければ `null`（ライトテーマ等 → deactivate）

判定結果の処理:
- `"dark"` → X の黒テーマ → `data-theme="dim"` を設定して DarkBlue 適用
- `"dim"` → DarkBlue 維持（ガードクラス保持）
- `null` / その他 → deactivate

### MutationObserver Smart Filtering

The observer watches `data-theme`, `class`, and `style` attributes on `<html>` (and `data-theme` on `<body>`). The callback checks current attribute values to determine if a mutation was self-inflicted:
- `chrome.storage.sync` の状態が未解決の間は callback 冒頭で即 return し、暫定 `isEnabled=true` による誤適用を防ぐ。初期化と BFCache 復帰では storage 取得完了後の `evaluateAndApply()` が初回評価を担う。
- `<body>` の `data-theme` 変化: 有効かつ GUARD_CLASS 付与済みなら `markBodyDarkVariant()` で `"dark"` マーカーを貼り直す。既に `"dark"` なら同関数が即 return するため、書き込みの自己ループは発生しない。
- `data-theme` change: **GUARD_CLASS 付与済みの `"dim"`** は自分が設定した値としてスキップ。GUARD_CLASS 未付与の `"dim"` は X 公式 Dim 設定や他拡張由来なので再評価する（この区別を入れないと自己変更誤検知で初期適用が漏れる）。extension 無効時は常にスキップ。
- `class` change: only react if guard class was externally removed while theme is `"dim"`
- `style` change: `color-scheme` の値が前回と異なる場合のみ再評価（X が `data-theme` を廃止し `color-scheme` で管理する方式に移行したため追加）。前回値キャッシュ (`_lastColorScheme`) でフィルタリングし、無関係な style 変更では発火しない。

SPA navigation detection is handled separately by History API hooks and a `popstate` listener — not by the observer. **History のフックは `src/intercept.js` (MAIN world) 側にある**: content.js (isolated world) で `history.pushState` を包んでも、X のルーターが呼ぶのは MAIN world の `history` なので捕捉できない（`setAttribute` intercept を MAIN world に分けたのと同じ世界の壁）。intercept.js が `pushState`/`replaceState` を包み、`CustomEvent('dbtx:locationchange')` を `window` に dispatch して isolated world へ中継する。DOM は両世界で共有されるためイベントは境界を越える（`detail` は構造化複製の制約を避けるため渡さず、URL は受信側が `location` から読む）。content.js はこのイベントと `popstate`（戻る/進む は `pushState` を経由しないため別途必要）を購読して `checkUrlChange()` を呼ぶ。この中継が壊れると「ホーム → 通知」のクライアント遷移で `data-dbtx-page` が更新されず、通知ページ専用 CSS が当たらなくなる。

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
- **Body data-theme マーカー（Tailwind `dark:` バリアント維持）** — X の新しい画面（ログアウト時のランディング / ログインフロー、Grok、jf 系）は Tailwind 製で、`dark:` バリアントが `.dark\:X:where([data-theme=dark], [data-theme=dark] *)` にコンパイルされている。**これらの CSS には `data-theme="dim"` 用の定義が存在しない**ため、`<html>` を dim に変換すると `dark:` が一斉に外れてライト用の色（黒文字・白ダイアログ）だけが残り、そこへ本拡張が背景を DarkBlue に塗るので「ダークブルー背景に黒文字」になる。
  セレクタが子孫 (`[data-theme=dark] *`) も対象にしていることを利用し、`<html data-theme="dim">`（X 内蔵 DarkBlue パレット）と `<body data-theme="dark">`（Tailwind `dark:` 有効化）を**両立**させる。`markBodyDarkVariant()` / `unmarkBodyDarkVariant()` が担当し、`_bodyThemeMarked` / `_bodyThemeOriginal` で「拡張が付けたマーカーか」を追跡して解除時に復元する。X 自身が既に `data-theme="dark"` を設定しているページ（jf 系）では何もせずそのまま活かす。
  body に降ってくる `[data-theme=dark]` の黒系 CSS 変数は、darkblue.css セクション 12・13 が `html.darkbluethemex-active body` スコープで DarkBlue 値へ上書きする（この body セレクタ併記を外すと黒が子孫へ漏れる）。
- **Inline style color override** — CSS `[style*="..."]` attribute selectors in `darkblue.css` override React's hardcoded inline colors instantly (no JS needed). Covers background-color, color, and border-color variants.
- **Theme color meta** — X は theme-color を「media 別の複数 meta（light=`#FFFFFF` / dark=`#000000`）」として持ち、さらにクライアント JS で動的に貼り替える（旧来の単一 meta 前提から仕様変更）。`updateThemeColor()` は**現存する全 `meta[name="theme-color"]` を `_themeColorMetas` 配列で追跡**し、各 meta の元値を退避してから DarkBlue 適用時に全枚 `#15202B` へ上書き、無効化時に元値へ復元する。`document.contains()` で各キャッシュの生存を毎回確認し、外れたものは除去・新規 meta は元値退避付きで登録する。

### State & Storage

- **`chrome.storage.sync`** — Primary toggle state (`darkblue_enabled`), synced across devices. **`chrome.storage.sync` への書き込みは popup.js のみ**; content.js は `storage.onChanged` リスナーで読むだけ。`popup` → `content` のトグル伝播はこの onChanged 経路のみ（旧実装の `'darkblue:toggle'` メッセージ送信は二重発火防止のため削除済み）。
- **`localStorage`** — `LAST_STATE_KEY` を楽観的 FOUC フラグとして使用。content.js の `document_start` 即時ブロック (IIFE 先頭) で `localStorage.getItem(LAST_STATE_KEY) === 'true'` なら `GUARD_CLASS` を即座に付与し、storage.sync の非同期解決を待たずに r-* クラス上書きルールを発動させる。content.js の書き込みはこれを読むためのもの（読み書き対称）。

### Popup ↔ Content Script Communication

1 メッセージ型のみ (hardcoded in both `src/content.js` and `src/popup/popup.js`):
- `'darkblue:getState'` — popup が現在のテーマ状態を問い合わせる（応答用）

トグル自体は `chrome.storage.sync.set` → `storage.onChanged` 経由で全タブに伝播する設計（sendMessage 経由の toggle は二重発火の原因になるため廃止）。

**重複リテラル管理**: `STORAGE_KEY = 'darkblue_enabled'` と `MSG_GET_STATE = 'darkblue:getState'` は content.js と popup.js の両方に、`LOCATION_CHANGE_EVENT` と3つの `THEME_*_EVENT` は content.js と intercept.js の両方に、独立してハードコードされている（Chrome 拡張のコンテキスト分離で共有モジュール不可）。変更時は必ず対になるファイルを同時更新すること。各リテラル定義箇所には対応箇所を**定数名で**コメント併記している（行番号は行ズレで腐るため付さない）。一致は `scripts/check-shared-literals.js`（`pnpm run check-shared-literals`、CI でも実行）が機械検証し、片側更新漏れを CI で検出する。

### File Roles

| File | Role |
|------|------|
| `manifest.json` | Chrome / Edge / Brave 用 manifest, version (single source of truth), permissions, 2 content scripts (isolated + MAIN world) |
| `manifest.firefox.json` | Firefox AMO 用 manifest。主な差分は `browser_specific_settings.gecko` (id / strict_min_version / data_collection_permissions) |
| `src/content.js` | Main theme engine (isolated world) — `data-theme` switching, MutationObserver, intercept ON/OFF 属性制御 |
| `src/intercept.js` | MAIN world から `Element.prototype.setAttribute`/`removeAttribute` を同期的にラップし、変換元をイベント中継 (FOUC 防止最終防衛線) |
| `src/styles/darkblue.css` | Static CSS theme rules, FOUC prevention, scoped under guard class and data-theme selectors |
| `src/popup/popup.html` | Extension popup UI |
| `src/popup/popup.js` | Toggle logic, storage writes, tab state queries, message passing to content script, 問い合わせ用の任意権限要求 |
| `src/popup/popup.css` | Popup styling with DarkBlue palette CSS variables (all swatch colors reference these variables) |
| `src/shared/kagayoi-support-*` | `kagayoi-support-extension` から同期する問い合わせ UI の配布用 JS / CSS。製品固有の上書きは `src/popup/popup.css` に置く |
| `.amo-metadata.json` | Firefox AMO submission の metadata (`categories.firefox: ["appearance"]`, `version.license: "MIT"`)。 `web-ext sign --amo-metadata=` で毎回付与 |
| `vava.config.json` | `/vava` が AMO 掲載情報を更新するときの slug と日英正本ファイルの対応 |

### Repository Layout (Reference)

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
| `webstore/store-listing.firefox.{ja,en}.txt` | Firefox AMO の日英 Summary / Description の正本 |
| `docs/privacy-policy*.md` | プライバシーポリシー (日本語・英語) |
| `debug/` | DevTools Trace などローカルデバッグ用のアーティファクト置き場 (`.gitignore` 対象) |

> `AGENTS.md` をこのリポジトリの唯一の正規エージェントガイドとして維持する。更新はこのファイルに集約し、同内容の別ファイルは作らない。

## Version Update

Version の唯一の真実は `manifest.json` の `"version"` フィールド。popup.js は `chrome.runtime.getManifest().version` で動的取得するため、popup 側の変更は不要。`package.json` の `"version"` は npm エコシステム互換のため保持しているが、`pnpm run check-version` （CI でも実行）で manifest と一致しているかを検証する。`/vava` スキルが両方を同時にインクリメントする。

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
- 3 実行コンテキスト (content.js = isolated world / intercept.js = MAIN world / popup = extension page) は共有モジュール不可。重複定数は `STORAGE_KEY` / `MSG_GET_STATE` (content↔popup)、`LOCATION_CHANGE_EVENT` / `THEME_*_EVENT` (content↔intercept) で、対になるファイルの同時更新必須
- X frequently changes its DOM structure and class names — CSS selectors may need updates when X deploys changes
