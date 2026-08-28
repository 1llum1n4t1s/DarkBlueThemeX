# DarkBlueThemeX 設計

この文書は、リポジトリに実装されているシステム構造と設計上の不変条件を記録する。利用者向けの導入・使い方は [README.md](README.md)、開発時の必須コマンドとリリース手順は [AGENTS.md](AGENTS.md) を正本とする。

## 目的と範囲

DarkBlueThemeX は、X（旧Twitter）の黒（Lights Out）テーマを旧DarkBlue（Dim）配色へ変換するManifest V3ブラウザ拡張機能である。Chrome、Edge、BraveなどのChromium系ブラウザとFirefoxを対象とし、ライトテーマには適用しない。

リポジトリには次の2つの配布単位がある。

- `manifest.json`／`manifest.firefox.json`、`src/`、`icons/`から構成するブラウザ拡張機能
- `web/`から構成する製品ランディングページ用Cloudflare Worker

ランディングページはストアへの導線と静的情報を提供するだけで、拡張機能本体の配布やテーマ処理は担わない。

## 主要コンポーネント

| コンポーネント | 責務 | 境界 |
| --- | --- | --- |
| `manifest.json` | Chromium版の権限、CSP、content scriptの実行順を定義する | バージョンの唯一の正本 |
| `manifest.firefox.json` | Firefox固有のGecko設定と権限宣言を加える | パッケージ時に`manifest.json`として配置する |
| `src/intercept.js` | MAIN worldでテーマ属性の書き換えとHistory APIによるSPA遷移を同期捕捉する | X本体と同じJavaScript worldでのみ有効 |
| `src/content.js` | 有効状態、テーマ判定、DOM状態、復元処理を管理する | isolated worldで動作し、Xのアプリケーション状態を直接所有しない |
| `src/styles/darkblue.css` | FOUC防止、DarkBlueパレット、X固有セレクタとデザイントークンを上書きする | ガードクラスまたは初期dark判定のスコープ内だけで有効 |
| `src/popup/` | トグル操作、現在タブの状態表示、バージョン表示を提供する | 永続的な有効状態を書き込む唯一のUI |
| `src/shared/` | Kagayoi Supportの問い合わせポップアップと共通フッターを提供する | テーマエンジンとは状態を共有せず、API通信は`support.kagayoi.com`に限定する |
| `scripts/`、`zip.ps1`、`zip.sh` | バージョン／共有リテラル検証、アイコン生成、ブラウザ別パッケージ作成を担う | 製品実行時には同梱しない |
| `.github/workflows/publish.yml` | `release/**`を検証し、Chrome Web StoreとFirefox AMOへ提出する | ストア認証情報はGitHub Secretsからのみ受け取る |
| `web/worker.js` | 許可した静的パスをセキュリティヘッダー付きで返す | 未知のパスは404、GET／HEAD以外は405 |

## 実行時データフロー

### テーマ適用

1. ブラウザは`document_start`でCSSを注入し、Xが`data-theme="dark"`を設定している間もDarkBlueのルート色を先行適用する。
2. `intercept.js`がMAIN worldで`Element.prototype.setAttribute`／`removeAttribute`を包み、有効時の`data-theme="dark"`書き込みを同期的に`dim`へ変換する。
3. `content.js`は`localStorage`の前回状態をFOUC防止の楽観値として使い、その後`chrome.storage.sync`の正式な有効状態を取得する。
4. 有効かつ黒テーマなら、`<html>`へ`darkbluethemex-active`を付与し、`data-theme`、`<body>`のdarkマーカー、`meta[name="theme-color"]`を整合させる。
5. MutationObserverは`<html>`／`<body>`の関連属性だけを監視し、Xによる再描画やテーマ変更を再評価する。定期的なDOM全走査は行わない。
6. `intercept.js`が`history.pushState`／`replaceState`を捕捉して`dbtx:locationchange`を送出し、`content.js`が通知ページ用の`data-dbtx-page`を更新する。戻る／進むは`popstate`で補完する。

MAIN worldとisolated worldの連携には、共有DOM上の`data-dbtx-intercept`属性とdetailを持たない`CustomEvent`を使う。実行worldをまたぐ共有JavaScriptモジュールは前提にしない。

### 有効状態の変更

1. popupが`darkblue_enabled`を`chrome.storage.sync`へ書き込む。
2. 各タブの`content.js`が`storage.onChanged`で変更を受け取り、適用または復元を行う。
3. popupの状態照会は`darkblue:getState`メッセージで現在タブのcontent scriptへ問い合わせる。受信側は`sender.id === chrome.runtime.id`を検証する。

トグル伝播をメッセージとstorageの二重経路にせず、`storage.onChanged`を唯一の変更通知経路とする。

### 問い合わせ

`kagayoi-support-footer`が共通ポップアップを開き、利用者が明示送信した内容だけを`kagayoi-support-popup`がKagayoi Support APIへ送る。APIアクセスとデータ収集の許可範囲は各manifestを正本とし、セッション情報はコンポーネントの設定に応じて`sessionStorage`または`localStorage`へ保存する。問い合わせ状態はテーマの有効状態と分離する。

## 状態の所有権

| 状態 | 所有者 | 用途 |
| --- | --- | --- |
| `chrome.storage.sync.darkblue_enabled` | popupが書き込み、content scriptが読み取り | デバイス間同期される正式なトグル状態 |
| `localStorage.darkbluethemex_was_active` | content script | storage解決前のFOUC抑制用キャッシュ |
| `darkbluethemex-active`／`darkbluethemex-off` | content script | CSSの適用範囲と明示OFF状態 |
| `data-dbtx-intercept` | content script | MAIN world interceptのON／OFF制御 |
| `_dimAppliedByUs`／`_syntheticDim` | content script内メモリ | 拡張が作った`dim`だけを安全に復元するための由来情報 |
| `data-dbtx-page` | content script | SPA上のページ種別をCSSへ通知 |
| Supportセッション | 共通問い合わせコンポーネント | 認証済み問い合わせ送信の継続 |

## 重要な不変条件

- `manifest.json`、`manifest.firefox.json`、`package.json`のversionは一致させる。popupはmanifestから動的に表示する。
- `STORAGE_KEY`と`MSG_GET_STATE`はcontent／popup間、`LOCATION_CHANGE_EVENT`はcontent／intercept間で同じ値を保ち、`scripts/check-shared-literals.js`で検証する。
- 拡張が変換した`dark → dim`だけを復元する。X公式Dimや他の主体が設定した`dim`は変更しない。
- 無効化時はinterceptをOFFにしてからテーマ属性を復元し、CSSの先行適用は`darkbluethemex-off`で抑止する。
- Tailwindの`dark:`バリアント維持用に付けた`<body data-theme="dark">`は、拡張が付与した場合だけ元値へ戻す。
- `meta[name="theme-color"]`は複数存在し得るため、各要素の元値を個別に保持して復元する。
- 拡張パッケージには選択したmanifest、`src/`、`icons/`だけを含める。Firefox版ではFirefox manifestを`manifest.json`へ置き換える。
- 製品実行時のnpm依存とbackground／service workerを持たず、すべての実行コードをローカル同梱する。

## 採用済みの設計判断

### CSSとJavaScriptのハイブリッド

CSSはスクリプト実行前の黒フラッシュを抑え、JavaScriptはXが後から変更するテーマ属性とSPA状態を維持する。CSSだけでは動的な再設定と復元を扱えず、JavaScriptだけでは初期描画に間に合わないため、責務を分けている。

### MAIN worldでの同期intercept

MutationObserverは非同期であり、isolated worldのprototype変更はX本体へ届かない。このため最小範囲の属性操作とHistory APIだけをMAIN worldで包む。代償としてプラットフォームAPIへの介入点が増えるため、二重インストール防止印とDOM属性による明示的なON／OFF境界を置く。

### 二つのガードクラス

`darkbluethemex-active`は適用後のCSSを有効化し、`darkbluethemex-off`はCSSが先行適用する条件を明示的に遮断する。単一クラスでは、OFF後も`data-theme="dark"`向けFOUCルールが残るため役割を分離している。

### 監視対象を限定したMutationObserver

XのDOMは頻繁に変化するため、要素全体の周期走査ではなくテーマに関係する属性だけを監視する。style変更は`color-scheme`の実値が変化した場合だけ再評価し、自己変更や無関係な更新を除外する。

### 実行コンテキストごとの重複定数

content script、MAIN world、extension pageは共有モジュール化せず、必要なリテラルを各コンテキストに置く。単純な配布構成と早期実行を維持できる一方で更新漏れが起きるため、CIで値の一致を機械検証する。

### ブラウザ別manifestと共通ソース

Firefox固有設定だけを別manifestに分離し、JavaScriptとCSSは共通化する。ビルド時変換やブラウザ別ソース分岐を増やさず、パッケージ工程でmanifestだけを選択する。

## 検証と配布の境界

ローカル検証とパッケージコマンドは[AGENTS.md](AGENTS.md)を参照する。CIは`release/**`でversion整合と共有リテラルを検証し、同一パッケージ工程の成果物をChrome／Firefoxの独立ジョブへ渡す。公開処理は直列化し、進行中の提出をキャンセルしない。ランディングページの配備はこのストア公開ワークフローに含まれない。
