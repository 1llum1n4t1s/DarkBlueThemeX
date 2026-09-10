# DarkBlueThemeX 設計

この文書は、リポジトリに実装されているシステム構造と設計上の不変条件を記録する。利用者向けの導入・使い方は [README.md](README.md)、開発時の必須コマンドとリリース手順は [AGENTS.md](AGENTS.md) を正本とする。

## 目的と範囲

DarkBlueThemeX は、X（旧Twitter）の黒（Lights Out）テーマを旧DarkBlue（Dim）配色へ変換するManifest V3ブラウザ拡張機能である。Chrome、Edge、BraveなどのChromium系ブラウザとFirefoxを対象とし、ライトテーマには適用しない。

拡張機能と製品ページは別のリポジトリ・配布経路で管理する。

- `manifest.json`／`manifest.firefox.json`、`src/`、`icons/`から構成するブラウザ拡張機能
- `../vps-web/lp/darkblue/`からVPSへ配信する製品ランディングページ

ランディングページはストアへの導線と静的情報を提供するだけで、拡張機能本体の配布やテーマ処理は担わない。

## 主要コンポーネント

| コンポーネント | 責務 | 境界 |
| --- | --- | --- |
| `manifest.json` | Chromium版の権限、CSP、content scriptの実行順を定義する | バージョンの唯一の正本 |
| `manifest.firefox.json` | Firefox固有のGecko設定と権限宣言を加える | パッケージ時に`manifest.json`として配置する |
| `src/intercept.js` | MAIN worldでテーマ属性の書き換えとHistory APIによるSPA遷移を同期捕捉する | X本体と同じJavaScript worldでのみ有効 |
| `src/content.js` | 有効状態、テーマ判定、DOM状態、復元処理を管理する | isolated worldで動作し、Xのアプリケーション状態を直接所有しない |
| `src/styles/darkblue.css` | FOUC防止、DarkBlueパレット、X固有セレクタとデザイントークンを上書きする | ガードクラスまたは初期dark判定のスコープ内だけで有効 |
| `src/popup/` | トグル操作、現在タブの状態表示、バージョン表示、問い合わせ時の任意権限要求を提供する | 永続的な有効状態を書き込む唯一のUIであり、問い合わせ権限要求の起点 |
| `src/shared/` | Kagayoi Supportの問い合わせポップアップと共通フッターを提供する | `@kagayoi/support-extension`から同期した配布用コードであり、テーマエンジンとは状態を共有せず、API通信は`support.kagayoi.com`に限定する |
| `scripts/`、`zip.ps1`、`zip.sh` | バージョン／共有リテラル検証、アイコン生成、ブラウザ別パッケージ作成を担う | 製品実行時には同梱しない |
| `.github/workflows/publish.yml` | `release/**`を検証し、Chrome Web StoreとFirefox AMOへ提出する | ストア認証情報はGitHub Secretsからのみ受け取る |
| `../vps-web/deploy/caddy-sites/lp-darkblue.caddy` | 許可した静的パスをセキュリティヘッダー付きで返す | 未知のパスは404、許可パスでGET／HEAD以外は405 |

## 実行時データフロー

### テーマ適用

1. ブラウザは`document_start`でCSSを注入し、Xが`data-theme="dark"`を設定している間もDarkBlueのルート色を先行適用する。
2. `intercept.js`がMAIN worldで`Element.prototype.setAttribute`／`removeAttribute`を包み、有効時の`data-theme="dark"`書き込みを同期的に`dim`へ変換する。
3. `content.js`は`localStorage`の前回状態をFOUC防止の楽観値として使い、その後`chrome.storage.sync`の正式な有効状態を取得する。正式状態の解決前はMutationObserverによるテーマ再評価を行わない。
4. 有効かつ黒テーマなら、`<html>`へ`darkbluethemex-active`を付与し、`data-theme`、`<body>`のdarkマーカー、`meta[name="theme-color"]`を整合させる。
5. MutationObserverは`<html>`／`<body>`の関連属性だけを監視し、Xによる再描画やテーマ変更を再評価する。定期的なDOM全走査は行わない。
6. `intercept.js`が`history.pushState`／`replaceState`を捕捉して`dbtx:locationchange`を送出し、`content.js`が通知ページ用の`data-dbtx-page`を更新する。戻る／進むは`popstate`で補完する。

MAIN worldとisolated worldの連携には、共有DOM上の`data-dbtx-intercept`属性とdetailを持たない`CustomEvent`を使う。`intercept.js`はdark変換、属性削除由来の変換、X公式Dim選択を3つのテーマイベントで通知し、`content.js`が`_dimAppliedByUs`／`_syntheticDim`を更新する。実行worldをまたぐ共有JavaScriptモジュールは前提にしない。

### 有効状態の変更

1. popupが`darkblue_enabled`を`chrome.storage.sync`へ書き込む。
2. 各タブの`content.js`が`storage.onChanged`で変更を受け取り、適用または復元を行う。
3. popupの状態照会は`darkblue:getState`メッセージで現在タブのcontent scriptへ問い合わせる。受信側は`sender.id === chrome.runtime.id`を検証する。

トグル伝播をメッセージとstorageの二重経路にせず、`storage.onChanged`を唯一の変更通知経路とする。

### 問い合わせ

利用者が問い合わせボタンを押したときだけ、popupが`permissions.request()`で`support.kagayoi.com`の任意ホスト権限を要求する。Firefoxでは任意のデータ収集権限も同時に要求し、許可された場合だけ`popup.js`が`kagayoi-contact-popup.open()`を呼ぶ。共通フッターは`hide-contact`で内蔵の問い合わせ導線を隠し、製品側のボタンを入口とする。フォームはメール確認コードの要求・検証後に問い合わせを送信する。製品ID、manifest由来の製品名・バージョンを受け取り、送信ペイロードにはバージョンや言語も含む。この製品では`storage`属性を指定しないため、認証セッションは既定の`sessionStorage`へ保存する。問い合わせ状態はテーマの有効状態と分離する。

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
- `STORAGE_KEY`と`MSG_GET_STATE`はcontent／popup間、`LOCATION_CHANGE_EVENT`と3つの`THEME_*_EVENT`はcontent／intercept間で同じ値を保ち、`scripts/check-shared-literals.js`で検証する。
- 問い合わせ用ホスト権限は任意権限とし、利用者の明示操作と許可が完了するまでSupportポップアップを開かない。Firefoxのデータ収集権限も同じ操作で要求する。
- 拡張が作った`dim`だけを復元する。dark由来はdarkへ、属性削除・属性なしのフォールバック由来は属性なしへ戻す。X公式Dimや他の主体が設定した`dim`は復元対象にしない。
- 無効化時はinterceptをOFFにしてからテーマ属性を復元し、CSSの先行適用は`darkbluethemex-off`で抑止する。
- Tailwindの`dark:`バリアント維持用に付けた`<body data-theme="dark">`は、拡張が付与した場合だけ元値へ戻す。
- `meta[name="theme-color"]`は複数存在し得るため、各要素を追跡し、保存された元値があるものを復元する。
- 拡張パッケージには選択したmanifest、`src/`、`icons/`だけを含める。Firefox版ではFirefox manifestを`manifest.json`へ置き換える。
- 製品実行時のnpm依存とbackground／service workerを持たず、すべての実行コードをローカル同梱する。

## テーマ判定と復元の詳細

`getCurrentTheme()`は非空の`data-theme`を優先する。ただし`dim`かつガード付与中は、正規化したinline `color-scheme`が明示的に`light`または`normal`のときだけ解除対象とする。値の欠落や複数値で解除すると、darkへの復元と再適用が循環する可能性があるため、dimを維持する。

属性値がない場合だけ、inline `color-scheme`が`dark`単独ならdarkと判定する。`getInlineColorScheme()`はCSSOMの`style.colorScheme`を小文字化・空白分割し、`only`を除く。`light dark`はdarkと断定しない。外部スタイルの値を含む`getComputedStyle()`は、このinline検出の契約と異なる。

MAIN worldの3つのテーマイベントは、楽観的ONより先に登録されたリスナーへ同期通知される。dark書き込みは通常の復元情報、`removeAttribute('data-theme')`は合成dimの復元情報を残し、明示的なdim選択は両方を消す。`restoreDataTheme()`は現在値がdim以外でも過去の由来情報を破棄し、後続テーマへ持ち越さない。

### 属性監視とライフサイクル

- htmlの`data-theme`変更は、有効時にガード付きdim以外を再評価する。`class`変更は有効かつdimでガードが失われた場合を対象にする。
- htmlの`style`変更は、inline color-schemeの分類（dark／その他）が前回と変わったときだけ再評価する。
- bodyの`data-theme`変更は、有効かつガード付きならdarkマーカーを貼り直す。既にdarkなら書き込まない。
- storage未解決時は属性監視と表示復帰イベントによる評価を抑止する。`pagehide`で監視を切り、BFCache復帰時にURLと監視を再同期し、storageを再取得して評価する。取得できない場合はメモリ上の状態で継続する。
- `evaluateAndApply()`は最初のフリップから1秒の窓で50回を超える適用／解除を検知すると、そのドキュメントで以後の評価を停止する。これは発振による資源消費を止める最後の防御である。

### 配色の補助処理

`<html data-theme="dim">`でX内蔵パレットを利用し、`<body data-theme="dark">`でTailwindの`dark:`バリアントを維持する。後者がないと黒文字や白ダイアログが残るため、body側に降りる変数もCSSセクション12・13で上書きする。元からdarkのbodyは復元対象にせず、拡張が付けたマーカーだけ元値へ戻す。

通知ページは`data-dbtx-page="notifications"`でアバター周辺の透明背景を切り替える。HistoryイベントはinterceptのON/OFFによらず通知し、content側でガードとURLを判定する。

`updateThemeColor()`は適用・解除時に現存する全theme-color metaを走査し、切り離された要素をキャッシュから外して新要素を登録する。meta自体の変更は常時監視しない。元値が未指定または既にDarkBlue色なら復元値を持たず、それ以外を個別に復元する。

カラーパレットの値の正本は`src/popup/popup.css`のCSS変数であり、`src/styles/darkblue.css`とcontentの`BG_PRIMARY`を対応させる。CSSはr-*クラス、inline style属性、Xのデザイントークンを上書きするため、色の周期的なJS走査は不要である。

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

### 問い合わせ共通部品を配布用コードへ同期

`@kagayoi/support-extension`を開発時の正本として、同期コマンドで問い合わせ用JS／CSSを`src/shared/`へコピーする。拡張機能は同期済みファイルをローカル同梱するため、実行時のnpmモジュール解決やリモートコードに依存せず、Manifest V3の配布境界を維持できる。共通仕様は上流パッケージ、DarkBlueThemeX固有の調整はpopup側のCSSへ分離する。

### ブラウザ別manifestと共通ソース

Firefox固有設定だけを別manifestに分離し、JavaScriptとCSSは共通化する。ビルド時変換やブラウザ別ソース分岐を増やさず、パッケージ工程でmanifestだけを選択する。

## 検証と配布の境界

ローカル検証とパッケージコマンドは[AGENTS.md](AGENTS.md)を参照する。CIは`release/**`でversion整合、共有リテラル、問い合わせ権限、テーマ復元契約を検証し、packageジョブで両ブラウザのアーカイブを作成する。ChromeジョブはZIP artifactを使用し、Firefoxジョブは同じソースから`firefox-build/`を再構築して`web-ext sign`へ渡す。両公開ジョブはpackage成功を条件とする独立ジョブである。公開処理は同じreleaseブランチ内で直列化し、進行中の提出をキャンセルしない。同期生成物の一致確認はローカル必須検証であり、現行CIは同期コマンドや`--check`を実行しない。ランディングページの配備はこのストア公開ワークフローに含まれない。

## 製品ページの配信先

製品ページの配信HTMLは `../vps-web/lp/darkblue/`（編集元は `../vps-web/tools/lp/templates/`）、公開実体はVPSの `/srv/www/lp/darkblue/`。
直接配信の設定は `../vps-web/deploy/caddy-sites/lp-darkblue.caddy` に置く。
静的ファイルの配備は別リポジトリの `../vps-web/deploy/deploy-lp.ps1` が担う。
