/**
 * DarkBlueThemeX - Content Script (isolated world)
 *
 * X(旧Twitter)の data-theme="dark" を data-theme="dim" に切り替え、
 * X内蔵の DarkBlue(Dim) テーマ CSS カスタムプロパティを有効化する。
 * ハードコードされた r-* クラスとインラインスタイルは darkblue.css で上書き。
 *
 * 同期的な setAttribute/removeAttribute の intercept は src/intercept.js (MAIN world) で実装。
 * この content.js からは <html data-dbtx-intercept="on|off"> 属性で ON/OFF を切り替える。
 */

(function () {
  'use strict';

  // 拡張機能の二重注入防止（ホットリロード等で IIFE が複数回評価される事態に備える）
  if (window.__dbtx_content_installed__) return;
  window.__dbtx_content_installed__ = true;

  // ---- 状態クラス名（GUARD_CLASS と OFF_CLASS はペア、ここに集約）----
  const GUARD_CLASS = 'darkbluethemex-active';
  const OFF_CLASS = 'darkbluethemex-off';

  // ---- ストレージキー（STORAGE_KEY は popup.js の同名定数と同期。変更時は両ファイル同時更新必須。
  //      CI: scripts/check-shared-literals.js が値の一致を機械検証する）----
  const STORAGE_KEY = 'darkblue_enabled';
  const LAST_STATE_KEY = 'darkbluethemex_was_active';

  // ---- メッセージ型（MSG_GET_STATE は popup.js の同名定数と同期。CI: check-shared-literals.js）----
  const MSG_GET_STATE = 'darkblue:getState';

  // ---- SPA ナビゲーション通知イベント名（intercept.js の同名定数と同期。CI: check-shared-literals.js）----
  const LOCATION_CHANGE_EVENT = 'dbtx:locationchange';

  // ---- MAIN world での data-theme 操作通知（intercept.js の同名定数と同期。CI: check-shared-literals.js）----
  const THEME_DARK_CONVERTED_EVENT = 'dbtx:themedarkconverted';
  const THEME_REMOVED_CONVERTED_EVENT = 'dbtx:themeremovedconverted';
  const THEME_DIM_SELECTED_EVENT = 'dbtx:themedimselected';

  // ---- カラー定数（darkblue.css ヘッダと popup.css 変数を正として同期）----
  const BG_PRIMARY = '#15202B';

  // ---- intercept 制御属性（src/intercept.js が読む）----
  const INTERCEPT_ATTR = 'data-dbtx-intercept';

  let isEnabled = true;
  let domObserver = null;
  let _themeColorMetas = [];        // 追跡: [{el, original}] <meta name="theme-color"> 群（X は media 別に複数枚 + JS で動的貼り替え）
  let _bodyThemeMarked = false;     // body に data-theme="dark" マーカーを付与したか（Tailwind dark: バリアント維持用）
  let _bodyThemeOriginal = null;    // マーカー付与前の body[data-theme] 元値（解除時の復元用、無属性なら null）
  let _lastStoredState = null;      // localStorage 重複書き込み抑制用
  let _lastColorScheme = null;      // style 属性変化のフィルタリング用
  let _syntheticDim = false;        // color-scheme フォールバックで合成した dim（無効化時に属性削除 vs dark 復元を区別）
  let _dimAppliedByUs = false;      // dark→dim 変換を自分が行ったか（X 公式 Dim / 他拡張由来の dim を戻さないため）
  let _stateResolved = false;       // storage.sync.get が解決済みか（未解決中の observer/visibilitychange/pageshow 誤適用を防ぐ）

  // ---- 発振ブレーカ（OOM 最終防衛線）----
  // evaluateAndApply が「適用↔解除」を短時間に FLIP_LIMIT 回超えてフリップしたら、以降の適用を停止する。
  // 自己誘発の無限フリップ（属性書き込み・querySelectorAll・MutationRecord を量産してメモリを食い潰し、
  // 初期ロードが永久に完了しなくなる＝Brave で観測された OutOfMemory）を物理的に断つための保険。
  let _flipCount = 0;
  let _flipResetTimer = null;
  let _loopBroken = false;
  const FLIP_LIMIT = 50;

  // ---- デバッグログ（既定 OFF。localStorage 'dbtx_debug'==='1' で有効化。本番コンソールを汚さない）----
  // X の DOM 変更でテーマが壊れたとき、状態遷移を DevTools コンソールから観測できるようにする。
  let DEBUG = false;
  try { DEBUG = localStorage.getItem('dbtx_debug') === '1'; } catch (e) { /* 取得不可なら既定 OFF のまま */ }
  function dlog(...args) { if (DEBUG) console.debug('[dbtx]', ...args); }

  // MAIN world の intercept が変換した dim の復元元を同期イベントで受け取る。
  // リスナーを楽観的 intercept ON より先に登録し、document_start の初期 dark 書き込みも取りこぼさない。
  window.addEventListener(THEME_DARK_CONVERTED_EVENT, () => {
    _syntheticDim = false;
    _dimAppliedByUs = true;
  });
  window.addEventListener(THEME_REMOVED_CONVERTED_EVENT, () => {
    _syntheticDim = true;
    _dimAppliedByUs = true;
  });
  window.addEventListener(THEME_DIM_SELECTED_EVENT, () => {
    // X が公式 Dim を明示した場合は、過去の dark→dim 変換履歴を現在値へ持ち越さない。
    _syntheticDim = false;
    _dimAppliedByUs = false;
  });

  // ---- localStorage 早期読み込みによる楽観的 GUARD_CLASS 付与（FOUC 防止強化）----
  // storage.sync の非同期解決を待たずに、前回セッションで有効だったなら即 GUARD_CLASS を付ける。
  // ミスマッチ（前回有効・今回無効）の場合は init 内の evaluateAndApply で解除される。
  try {
    const wasActive = localStorage.getItem(LAST_STATE_KEY);
    if (wasActive === 'true') {
      document.documentElement.classList.add(GUARD_CLASS);
      document.documentElement.classList.remove(OFF_CLASS);
      document.documentElement.setAttribute(INTERCEPT_ATTR, 'on');
      _lastStoredState = 'true';
    } else if (wasActive === 'false') {
      document.documentElement.classList.add(OFF_CLASS);
      _lastStoredState = 'false';
    }
  } catch (e) { dlog('localStorage 読み取り不可 (プライバシーモード等)', e); }

  // ========================================================
  // テーマ検出・適用
  // ========================================================

  /**
   * <html> の inline style に指定された color-scheme を正規化して返す（未指定なら空文字）。
   *
   * style 属性の生文字列を includes() で部分一致させると、区切りの空白有無・プロパティ順・
   * 大文字小文字といった書式ゆれで判定が外れる。CSSOM の標準アクセサ
   * (CSSStyleDeclaration.colorScheme) はブラウザがパース済みの値を返すため、
   * X 側の出力形式が変わっても壊れない。この経路は「X が data-theme を廃止した場合」の
   * 将来向け防御であり、書式を予測できないぶん標準アクセサの方が適する。
   *
   * getComputedStyle を使わないのは意図的: X の Tailwind CSS が :root へ color-scheme を
   * 宣言しており、外部スタイルシート由来の値まで拾うと inline 指定の検出という意味論が変わるため。
   */
  function getInlineColorScheme() {
    // 'only' は「OS 設定による上書きを許さない」修飾子で配色そのものではないため除去し、
    // 'only dark' を 'dark' と同一視する。
    return (document.documentElement.style.colorScheme || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token && token !== 'only')
      .join(' ');
  }

  function getCurrentTheme() {
    const docEl = document.documentElement;
    const scheme = getInlineColorScheme();

    const dataTheme = docEl.dataset.theme;
    if (dataTheme) {
      // 拡張機能が設定した dim が color-scheme の実態を隠さないようにする:
      // ユーザーがライトテーマに切り替えた場合、dim を無視してテーマ解除へ。
      // ただし「color-scheme: dark の単なる欠落」では解除しない。明示的に light/normal の
      // ときだけ null を返す。X の初期ロード中や Brave Shields による color-scheme 設定の
      // 遅延・阻害で dark が一時的に欠落しただけのときに解除してしまうと、
      // deactivate→data-theme="dark" 復元→再適用→… の無限フリップ（メモリ暴走・
      // 初期ロード未完）に陥るため（Brave で観測された OOM の根本原因）。
      if (dataTheme === 'dim' && docEl.classList.contains(GUARD_CLASS)) {
        const isLightScheme = scheme === 'light' || scheme === 'normal';
        return isLightScheme ? null : 'dim';
      }
      return dataTheme;
    }
    // X が data-theme 属性を廃止した場合の代替検出:
    // html の inline style が color-scheme: dark 単独 → 黒テーマと判断。
    // "light dark" のような複数値はユーザーの OS 設定次第で決まるため dark と断定しない。
    if (scheme === 'dark') return 'dark';
    return null;
  }

  /**
   * body に data-theme="dark" マーカーを付与する（Tailwind の dark: バリアント維持）。
   *
   * X の新しい画面（ログアウト時のランディング／ログインフロー、Grok、jf 系）は Tailwind 製で、
   * dark: バリアントが `.dark\:X:where([data-theme=dark], [data-theme=dark] *)` にコンパイル
   * されている。html を dim に書き換えると dark: が一斉に外れてライト用の色（黒文字・白背景）
   * だけが残り、そこへ本拡張が背景を DarkBlue に塗るため「ダークブルー背景に黒文字」になる。
   * これらの CSS には data-theme="dim" 用の定義が一切無いため、dim では成立しない。
   *
   * セレクタが子孫（[data-theme=dark] *）も対象にしていることを利用し、html は dim のまま
   * body に data-theme="dark" を残すことで、X 内蔵の DarkBlue(Dim) パレットと Tailwind の
   * dark: ユーティリティを両立させる。body 側に降ってくる黒系の CSS 変数は darkblue.css の
   * セクション 12・13 が DarkBlue 値へ上書きする。
   */
  function markBodyDarkVariant() {
    const body = document.body;
    if (!body) return;
    if (body.dataset.theme === 'dark') return;   // X 自身が dark を設定済み（jf 系）→ そのまま活かす
    if (!_bodyThemeMarked) _bodyThemeOriginal = body.getAttribute('data-theme');
    body.dataset.theme = 'dark';
    _bodyThemeMarked = true;
  }

  /** markBodyDarkVariant が付けたマーカーを外し、元の状態へ戻す */
  function unmarkBodyDarkVariant() {
    const body = document.body;
    if (!body || !_bodyThemeMarked) return;
    if (_bodyThemeOriginal === null) {
      body.removeAttribute('data-theme');
    } else {
      body.setAttribute('data-theme', _bodyThemeOriginal);
    }
    _bodyThemeMarked = false;
    _bodyThemeOriginal = null;
  }

  /** 状態変化時のみ localStorage に書き込む（同期 I/O 削減） */
  function writeLastState(active) {
    const next = active ? 'true' : 'false';
    if (_lastStoredState === next) return;
    try {
      localStorage.setItem(LAST_STATE_KEY, next);
      _lastStoredState = next;
    } catch (e) { dlog('localStorage 書き込み不可', e); }
  }

  /**
   * 拡張機能が dark から変換した data-theme="dim" を元の状態へ戻す。
   * 合成 dim（元々 data-theme 属性が無かった）なら属性ごと削除し、そうでなければ dark へ戻す。
   *
   * `_dimAppliedByUs` で「自分が変換した dim か」を判定するのが要点。
   * X 公式 Dim 設定や他拡張由来の dim を dark へ書き換えると、拡張機能を無効にした利用者に
   * 意図しない黒テーマを見せてしまうため、その場合は何もしない。
   * 逆に「戻さない」方針にすると、本拡張の主対象である黒テーマ利用者が OFF にしたときに
   * dim（＝X 内蔵 DarkBlue）が残り続け、トグルが効かないように見えるので採らない。
   *
   * 呼び出し前に intercept を OFF にしておくこと（ON のままだと dark 書き込みが dim に戻される）。
   */
  function restoreDataTheme() {
    const docEl = document.documentElement;
    if (docEl.dataset.theme !== 'dim') {
      // X が light 等へ切り替えた後に、過去の dim 復元情報を次のテーマへ持ち越さない。
      _syntheticDim = false;
      _dimAppliedByUs = false;
      return;
    }
    if (!_dimAppliedByUs) return;
    if (_syntheticDim) {
      docEl.removeAttribute('data-theme');
    } else {
      docEl.dataset.theme = 'dark';
    }
    _syntheticDim = false;
    _dimAppliedByUs = false;
  }

  /** DarkBlue テーマを解除し、状態をリセットする共通処理 */
  function deactivateTheme() {
    const docEl = document.documentElement;
    // intercept を先に OFF (dark 再設定の解禁)
    docEl.setAttribute(INTERCEPT_ATTR, 'off');
    docEl.classList.remove(GUARD_CLASS);
    // CSS FOUC ルール無効化
    docEl.classList.add(OFF_CLASS);
    restoreDataTheme();
    unmarkBodyDarkVariant();
    updateThemeColor(false);
    writeLastState(false);
    updatePageFlags();
  }

  /**
   * テーマを評価し、必要に応じて DarkBlue を適用/解除する（発振ブレーカ付きラッパ）。
   * 自己誘発の「適用↔解除」フリップが短時間に FLIP_LIMIT を超えたら以降の適用を停止し、
   * 無限ループによる OOM・初期ロード未完を遮断する（最終防衛線）。
   */
  function evaluateAndApply() {
    if (_loopBroken) return;
    const before = document.documentElement.classList.contains(GUARD_CLASS);
    _evaluateAndApplyImpl();
    const after = document.documentElement.classList.contains(GUARD_CLASS);
    if (before === after) return; // 適用状態が変わっていなければフリップではない
    _flipCount++;
    if (_flipResetTimer === null) {
      _flipResetTimer = setTimeout(() => { _flipCount = 0; _flipResetTimer = null; }, 1000);
    }
    if (_flipCount > FLIP_LIMIT) {
      _loopBroken = true;
      dlog('発振検知: 適用↔解除フリップが閾値超過。ループを遮断し以降の適用を停止', _flipCount);
    }
  }

  /**
   * テーマを評価し、必要に応じて DarkBlue を適用/解除する。
   * - data-theme="dark" → "dim" に変換し DarkBlue 適用
   * - data-theme="dim"  → ガードクラスを維持
   * - その他（light 等）→ DarkBlue を解除
   */
  function _evaluateAndApplyImpl() {
    const docEl = document.documentElement;
    const theme = getCurrentTheme();

    // 拡張機能が無効 → 解除（intercept OFF と data-theme 復元は deactivateTheme が担う）
    if (!isEnabled) {
      deactivateTheme();
      return;
    }

    // ダークテーマ(黒) → DarkBlue(dim) に変換
    if (theme === 'dark') {
      // レガシー（data-theme 属性あり）vs 合成（color-scheme フォールバック）を記録
      _syntheticDim = !docEl.hasAttribute('data-theme');
      // 変換したのは自分だと記録（解除時にこの dim だけを戻す。既存の dim には触らない）
      _dimAppliedByUs = true;
      docEl.dataset.theme = 'dim';
    }

    // dim テーマ or dark→dim 変換後 → ガードクラス適用
    if (theme === 'dark' || theme === 'dim') {
      docEl.classList.add(GUARD_CLASS);
      docEl.classList.remove(OFF_CLASS);
      docEl.setAttribute(INTERCEPT_ATTR, 'on');
      // body には data-theme="dark" を残す（Tailwind の dark: バリアント維持。詳細は関数コメント）
      markBodyDarkVariant();
      updateThemeColor(true);
      writeLastState(true);
      updatePageFlags();
      return;
    }

    // ライトテーマ等 → 何もしない
    deactivateTheme();
  }

  function updateThemeColor(isDarkBlue) {
    // X は theme-color を「media 別の複数 meta（light=#FFFFFF / dark=#000000）」として持ち、
    // さらにクライアント JS で動的に貼り替えるようになった（旧来の単一 meta 前提から仕様変更）。
    // 「最初の1枚だけ querySelector で上書き」だと的を外すため、現存する全 meta を対象にする。
    // DOM から外れたキャッシュは除去（SPA が貼り替えるため）。
    _themeColorMetas = _themeColorMetas.filter((m) => document.contains(m.el));
    const known = new Set(_themeColorMetas.map((m) => m.el));
    // 未追跡の meta を元値退避付きで登録（拡張が設定した #15202B は original 扱いしない）
    for (const el of document.querySelectorAll('meta[name="theme-color"]')) {
      if (known.has(el)) continue;
      const cur = el.getAttribute('content');
      _themeColorMetas.push({ el, original: cur === BG_PRIMARY ? null : cur });
    }
    for (const m of _themeColorMetas) {
      if (isDarkBlue) {
        m.el.setAttribute('content', BG_PRIMARY);
      } else if (m.original != null) {
        m.el.setAttribute('content', m.original);
      }
    }
  }

  // ========================================================
  // SPA ナビゲーション検出 & ページ固有フラグ
  // ========================================================

  let _lastUrl = location.href;

  /** 通知ページ判定フラグを html 要素に設定（CSS の :has() 範囲限定に使用） */
  function updatePageFlags() {
    const docEl = document.documentElement;
    if (!docEl.classList.contains(GUARD_CLASS)) {
      docEl.removeAttribute('data-dbtx-page');
      return;
    }
    if (location.pathname.startsWith('/notifications')) {
      docEl.setAttribute('data-dbtx-page', 'notifications');
    } else {
      docEl.removeAttribute('data-dbtx-page');
    }
  }

  function checkUrlChange() {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;
      updatePageFlags();
    }
  }

  // ========================================================
  // MutationObserver: html 属性のみ監視（スマートフィルタリング）
  // ========================================================

  function startObserver() {
    if (domObserver) domObserver.disconnect();

    domObserver = new MutationObserver((mutations) => {
      // storage の状態が確定するまでは暫定 isEnabled=true でテーマを誤適用しない。
      // 初期適用と BFCache 復帰時の再適用は storage 取得後の evaluateAndApply() が担う。
      if (!_stateResolved) return;

      const docEl = document.documentElement;
      const theme = getCurrentTheme();
      const hasGuard = docEl.classList.contains(GUARD_CLASS);
      let needsEval = false;

      for (const mutation of mutations) {
        if (mutation.target === document.body) {
          // body の data-theme が外部から書き換えられた場合、dark マーカーを貼り直す。
          // 既に dark なら markBodyDarkVariant が即 return するため、書き込みの自己ループは発生しない。
          if (isEnabled && hasGuard) markBodyDarkVariant();
          continue;
        }
        if (mutation.attributeName === 'data-theme') {
          // 「dim かつ GUARD_CLASS 付与済み」なら自分が設定した値 → 再評価不要
          // GUARD_CLASS 未付与の dim は X 公式 Dim 設定や別拡張由来なので再評価が必要
          if (!isEnabled) continue;
          if (theme === 'dim' && hasGuard) continue;
          needsEval = true;
          break;
        } else if (mutation.attributeName === 'class') {
          // ガードクラスが外部から除去された場合のみ再適用
          if (isEnabled && theme === 'dim' && !hasGuard) {
            needsEval = true;
            break;
          }
        } else if (mutation.attributeName === 'style') {
          // color-scheme の変化を検出（X がテーマを切り替えた場合）
          const currentScheme = getInlineColorScheme() === 'dark' ? 'dark' : 'other';
          if (currentScheme !== _lastColorScheme) {
            _lastColorScheme = currentScheme;
            if (!isEnabled) continue;
            needsEval = true;
            break;
          }
        }
      }

      if (needsEval) evaluateAndApply();
      // checkUrlChange() は intercept.js (MAIN world) の History フック中継 + popstate でカバー済み
    });

    domObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
    // body の data-theme も監視（jf-element 用: Creator Studio 等のページ対応）
    // 防御的 null ガード（通常は waitForBody 経由で body 確定後に呼ばれる）
    if (document.body) {
      domObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    }
  }

  // ========================================================
  // ポップアップとの通信
  // ========================================================

  function registerMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // sender.id !== runtime.id なら他拡張機能からの偽装。即拒否。
      if (!sender || sender.id !== chrome.runtime.id) return false;

      if (message && message.type === MSG_GET_STATE) {
        const isActive = document.documentElement.classList.contains(GUARD_CLASS);
        const theme = getCurrentTheme();
        sendResponse({
          enabled: isEnabled,
          isBlackTheme: theme === 'dark' || (isActive && theme === 'dim'),
          isDarkBlueApplied: isActive,
          isOfficialDim: theme === 'dim' && !isActive,
          theme,                                  // デバッグ表示用
          hasGuard: isActive,
        });
        return false; // 同期応答のため false（旧コードの `return true` は誤用）
      }

      return false;
    });
  }

  // ========================================================
  // 初期化
  // ========================================================

  let _initialized = false;

  function init() {
    if (_initialized) return; // bfcache 復元等での再呼び出し保険
    _initialized = true;

    startObserver();
    registerMessageListener();

    // SPA ナビゲーション検出。
    // history.pushState/replaceState のフックは intercept.js (MAIN world) 側にある。
    // ここ (isolated world) で history を包んでも X のルーターは MAIN world の history を呼ぶため
    // 捕捉できない (setAttribute intercept を MAIN world に分けたのと同じ世界の壁)。
    // intercept.js が CustomEvent で中継してくるので、それを受けて URL 変化を反映する。
    window.addEventListener(LOCATION_CHANGE_EVENT, checkUrlChange);
    // 戻る/進む は pushState を経由せず popstate で飛んでくるため別途購読する。
    window.addEventListener('popstate', checkUrlChange);

    chrome.storage.sync.get({ [STORAGE_KEY]: true }, (result) => {
      if (chrome.runtime.lastError) {
        // storage 障害時は既定値 (true) で続行し、無言にしない
        dlog('storage.sync.get 失敗、既定値で続行', chrome.runtime.lastError);
        isEnabled = true;
      } else {
        isEnabled = result[STORAGE_KEY];
      }
      _stateResolved = true;
      evaluateAndApply();
    });

    // storage.onChanged は「popup でのトグル」および「他タブからの同期」の唯一の経路。
    // popup.js からの sendMessage('darkblue:toggle') は廃止済み（二重発火の原因だった）。
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[STORAGE_KEY]) {
        // キー削除時 newValue は undefined になる。そのまま代入すると isEnabled が真偽値でなくなり、
        // 暗黙の falsy として解除され (init の既定 true と食い違う)、getState 応答の enabled も
        // undefined を返してしまう。init の get({[STORAGE_KEY]: true}) と同じ既定へ正規化する。
        const nextEnabled = changes[STORAGE_KEY].newValue !== false;
        if (nextEnabled === isEnabled) return; // 既に同値ならスキップ
        isEnabled = nextEnabled;
        evaluateAndApply();
      }
    });
  }

  // タブ復帰時に再評価（X がテーマを変更している可能性）
  document.addEventListener('visibilitychange', () => {
    // storage 解決前 (isEnabled が暫定 true) は評価しない。初期適用は init の get コールバックが担う。
    if (document.visibilityState === 'visible' && _stateResolved && isEnabled) {
      evaluateAndApply();
    }
  });

  // bfcache からの復元時、MutationObserver が disconnect されている可能性がある
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && _initialized && !domObserver) {
      _stateResolved = false;
      // bfcache 復元直後は URL が変わっている可能性 → ページフラグを再同期してから再評価。
      _lastUrl = location.href;
      updatePageFlags();
      startObserver();
      // サスペンド中は storage.onChanged を取りこぼすため、復元時に最新状態を再取得してから再評価する。
      // 拡張更新後などコンテキスト失効時は chrome.storage が無効化され、get が throw / undefined になりうる。
      // 二重防御 (存在ガード + try/catch) で、取得不可でもメモリ上の状態で適用を継続する。
      const resolveAndApply = () => { _stateResolved = true; evaluateAndApply(); };
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        try {
          chrome.storage.sync.get({ [STORAGE_KEY]: true }, (result) => {
            if (!chrome.runtime?.lastError && result) {
              isEnabled = result[STORAGE_KEY];
            }
            resolveAndApply();
          });
        } catch (e) {
          dlog('bfcache 復元時の storage.sync.get が失効、メモリ状態で続行', e);
          resolveAndApply();
        }
      } else {
        resolveAndApply();
      }
    }
  });

  // クリーンアップ（unload は非推奨のため pagehide を使用）
  window.addEventListener('pagehide', () => {
    if (domObserver) { domObserver.disconnect(); domObserver = null; }
  });

  function waitForBody() {
    if (document.body) {
      init();
      return;
    }
    const bodyObserver = new MutationObserver(() => {
      if (document.body) {
        bodyObserver.disconnect();
        init();
      }
    });
    bodyObserver.observe(document.documentElement, { childList: true });
  }

  waitForBody();
})();
