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

  // ---- ストレージキー（STORAGE_KEY は popup.js:3 と同期。変更時は両方同時更新必須）----
  const STORAGE_KEY = 'darkblue_enabled';
  const LAST_STATE_KEY = 'darkbluethemex_was_active';

  // ---- メッセージ型（popup.js 内の対応リテラルと同期。変更時は両方同時更新必須）----
  const MSG_GET_STATE = 'darkblue:getState'; // popup.js:80 と一致

  // ---- カラー定数（darkblue.css ヘッダと popup.css 変数を正として同期）----
  const BG_PRIMARY = '#15202B';

  // ---- intercept 制御属性（src/intercept.js が読む）----
  const INTERCEPT_ATTR = 'data-dbtx-intercept';

  let isEnabled = true;
  let domObserver = null;
  let _metaThemeColor = null;       // キャッシュ: <meta name="theme-color">
  let _originalThemeColor = null;   // 元の theme-color 値（復元用）
  let _bodyThemeFixed = false;      // body の data-theme を変更したかどうか（jf-element 用）
  let _lastStoredState = null;      // localStorage 重複書き込み抑制用

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
  } catch (e) { /* ignore (プライバシーモード等) */ }

  // ========================================================
  // テーマ検出・適用
  // ========================================================

  function getCurrentTheme() {
    return document.documentElement.dataset.theme || null;
  }

  /** 状態変化時のみ localStorage に書き込む（同期 I/O 削減） */
  function writeLastState(active) {
    const next = active ? 'true' : 'false';
    if (_lastStoredState === next) return;
    try {
      localStorage.setItem(LAST_STATE_KEY, next);
      _lastStoredState = next;
    } catch (e) { /* ignore */ }
  }

  /** DarkBlue テーマを解除し、状態をリセットする共通処理 */
  function deactivateTheme() {
    const docEl = document.documentElement;
    // intercept を先に OFF (dark 再設定の解禁)
    docEl.setAttribute(INTERCEPT_ATTR, 'off');
    docEl.classList.remove(GUARD_CLASS);
    // CSS FOUC ルール (html[data-theme="dark"]:not(.darkbluethemex-off)) を無効化。
    // これがないと data-theme="dark" に戻しても CSS が DarkBlue 背景を強制してしまう。
    docEl.classList.add(OFF_CLASS);
    if (document.body) {
      // body の data-theme を元に戻す（jf-element 用）
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
      if (theme === 'dim' && docEl.classList.contains(GUARD_CLASS)) {
        docEl.dataset.theme = 'dark';
      }
      deactivateTheme();
      return;
    }

    // ダークテーマ(黒) → DarkBlue(dim) に変換
    if (theme === 'dark') {
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
    // キャッシュ済みノードが DOM から外れている場合は再クエリ（X の SPA が <meta> を差し替える可能性）
    if (_metaThemeColor && !document.contains(_metaThemeColor)) {
      _metaThemeColor = null;
    }
    if (!_metaThemeColor) {
      _metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (_metaThemeColor && _originalThemeColor === null) {
        _originalThemeColor = _metaThemeColor.getAttribute('content');
      }
    }
    if (!_metaThemeColor) return;
    if (isDarkBlue) {
      _metaThemeColor.setAttribute('content', BG_PRIMARY);
    } else if (_originalThemeColor) {
      _metaThemeColor.setAttribute('content', _originalThemeColor);
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
        }
      }

      if (needsEval) evaluateAndApply();
      // checkUrlChange() は History API フック + popstate で完全にカバー済み
    });

    domObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
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
      isEnabled = result[STORAGE_KEY];
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
    if (document.visibilityState === 'visible' && isEnabled) {
      evaluateAndApply();
    }
  });

  // bfcache からの復元時、MutationObserver が disconnect されている可能性がある
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && _initialized && !domObserver) {
      startObserver();
      if (isEnabled) evaluateAndApply();
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
