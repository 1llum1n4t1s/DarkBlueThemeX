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

  // ---- カラー定数（darkblue.css ヘッダと popup.css 変数を正として同期）----
  const BG_PRIMARY = '#15202B';

  // ---- intercept 制御属性（src/intercept.js が読む）----
  const INTERCEPT_ATTR = 'data-dbtx-intercept';

  let isEnabled = true;
  let domObserver = null;
  let _themeColorMetas = [];        // 追跡: [{el, original}] <meta name="theme-color"> 群（X は media 別に複数枚 + JS で動的貼り替え）
  let _bodyThemeFixed = false;      // body の data-theme を変更したかどうか（jf-element 用）
  let _lastStoredState = null;      // localStorage 重複書き込み抑制用
  let _lastColorScheme = null;      // style 属性変化のフィルタリング用
  let _syntheticDim = false;        // color-scheme フォールバックで合成した dim（無効化時に属性削除 vs dark 復元を区別）
  let _stateResolved = false;       // storage.sync.get が解決済みか（解決前の visibilitychange/pageshow で誤適用しないため）

  // ---- デバッグログ（既定 OFF。localStorage 'dbtx_debug'==='1' で有効化。本番コンソールを汚さない）----
  // X の DOM 変更でテーマが壊れたとき、状態遷移を DevTools コンソールから観測できるようにする。
  let DEBUG = false;
  try { DEBUG = localStorage.getItem('dbtx_debug') === '1'; } catch (e) { /* 取得不可なら既定 OFF のまま */ }
  function dlog(...args) { if (DEBUG) console.debug('[dbtx]', ...args); }

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

  function getCurrentTheme() {
    const docEl = document.documentElement;
    const style = docEl.getAttribute('style') || '';
    const isDarkScheme = style.includes('color-scheme: dark');

    const dataTheme = docEl.dataset.theme;
    if (dataTheme) {
      // 拡張機能が設定した dim が color-scheme の実態を隠さないようにする:
      // ユーザーがライトテーマに切り替えた場合、dim を無視してテーマ解除へ
      if (dataTheme === 'dim' && docEl.classList.contains(GUARD_CLASS) && !isDarkScheme) {
        return null;
      }
      return dataTheme;
    }
    // X が data-theme 属性を廃止した場合の代替検出:
    // html の inline style に color-scheme: dark が含まれる → 黒テーマと判断
    if (isDarkScheme) return 'dark';
    return null;
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

  /** DarkBlue テーマを解除し、状態をリセットする共通処理 */
  function deactivateTheme() {
    const docEl = document.documentElement;
    // intercept を先に OFF (dark 再設定の解禁)
    docEl.setAttribute(INTERCEPT_ATTR, 'off');
    docEl.classList.remove(GUARD_CLASS);
    // CSS FOUC ルール無効化
    docEl.classList.add(OFF_CLASS);
    // 拡張機能が設定した data-theme="dim" を復元/削除
    if (docEl.dataset.theme === 'dim') {
      if (_syntheticDim) {
        docEl.removeAttribute('data-theme');
      } else {
        docEl.dataset.theme = 'dark';
      }
      _syntheticDim = false;
    }
    if (document.body) {
      if (_bodyThemeFixed) {
        document.body.dataset.theme = 'dark';
        _bodyThemeFixed = false;
      }
    }
    updateThemeColor(false);
    writeLastState(false);
    updatePageFlags();
  }

  /**
   * テーマを評価し、必要に応じて DarkBlue を適用/解除する。
   * - data-theme="dark" → "dim" に変換し DarkBlue 適用
   * - data-theme="dim"  → ガードクラスを維持
   * - その他（light 等）→ DarkBlue を解除
   */
  function evaluateAndApply() {
    const docEl = document.documentElement;
    const theme = getCurrentTheme();

    // 拡張機能が無効 → 解除
    if (!isEnabled) {
      docEl.setAttribute(INTERCEPT_ATTR, 'off');
      // 拡張機能が設定した data-theme="dim" を復元/削除
      if (docEl.dataset.theme === 'dim' && docEl.classList.contains(GUARD_CLASS)) {
        if (_syntheticDim) {
          docEl.removeAttribute('data-theme');
        } else {
          docEl.dataset.theme = 'dark';
        }
      }
      deactivateTheme();
      return;
    }

    // ダークテーマ(黒) → DarkBlue(dim) に変換
    if (theme === 'dark') {
      // レガシー（data-theme 属性あり）vs 合成（color-scheme フォールバック）を記録
      _syntheticDim = !docEl.hasAttribute('data-theme');
      docEl.dataset.theme = 'dim';
    }

    // dim テーマ or dark→dim 変換後 → ガードクラス適用
    if (theme === 'dark' || theme === 'dim') {
      docEl.classList.add(GUARD_CLASS);
      docEl.classList.remove(OFF_CLASS);
      docEl.setAttribute(INTERCEPT_ATTR, 'on');
      // body の data-theme も dim に変換（jf-element 用: Creator Studio 等で body が独自に持つ場合）
      if (document.body && document.body.dataset.theme === 'dark') {
        document.body.dataset.theme = 'dim';
        _bodyThemeFixed = true;
      }
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
      const docEl = document.documentElement;
      const theme = getCurrentTheme();
      const hasGuard = docEl.classList.contains(GUARD_CLASS);
      let needsEval = false;

      for (const mutation of mutations) {
        if (mutation.target === document.body) {
          // body の data-theme が外部から dark に戻された場合、dim に再変換
          if (isEnabled && hasGuard && document.body.dataset.theme === 'dark') {
            document.body.dataset.theme = 'dim';
            _bodyThemeFixed = true;
          }
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
          const style = docEl.getAttribute('style') || '';
          const currentScheme = style.includes('color-scheme: dark') ? 'dark' : 'other';
          if (currentScheme !== _lastColorScheme) {
            _lastColorScheme = currentScheme;
            if (!isEnabled) continue;
            needsEval = true;
            break;
          }
        }
      }

      if (needsEval) evaluateAndApply();
      // checkUrlChange() は History API フック + popstate で完全にカバー済み
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

    // SPA ナビゲーション検出: History API をフック
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;
    history.pushState = function (...args) {
      origPushState.apply(this, args);
      checkUrlChange();
    };
    history.replaceState = function (...args) {
      origReplaceState.apply(this, args);
      checkUrlChange();
    };
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
        const newVal = changes[STORAGE_KEY].newValue;
        if (newVal === isEnabled) return; // 既に同値ならスキップ
        isEnabled = newVal;
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
