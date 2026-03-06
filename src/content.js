/**
 * DarkBlueThemeX - Content Script (v2: CSS Variable Approach)
 *
 * X(旧Twitter)の data-theme="dark" を data-theme="dim" に切り替え、
 * X内蔵の DarkBlue(Dim) テーマ CSS カスタムプロパティを有効化する。
 * ハードコードされた r-* クラスとインラインスタイルは darkblue.css で上書き。
 *
 * v1(力業)からの主な改善:
 *   - getComputedStyle / recolorElement / fullScan を全廃
 *   - MutationObserver は html 属性のみ監視（スマートフィルタリング）
 *   - 定期スキャン不要（rAFバッチ、dirtyFlag、WeakSet 等すべて廃止）
 */

(function () {
  'use strict';

  const GUARD_CLASS = 'darkbluethemex-active';
  const STORAGE_KEY = 'darkblue_enabled';
  const LAST_STATE_KEY = 'darkbluethemex_was_active';

  let isEnabled = true;
  let domObserver = null;
  let _scanTimer = null;

  // ========================================================
  // インラインスタイル色修正（CSS [style*="..."] の代替）
  // Map.get() は O(1) で、CSS の全要素文字列マッチングより高速
  // ========================================================

  const BG_FIXES = new Map([
    ['rgb(0, 0, 0)', '#15202B'],
    ['rgb(22, 24, 28)', '#192734'],
    ['rgb(25, 25, 25)', '#192734'],
    ['rgb(16, 16, 16)', '#192734'],
    ['rgb(15, 15, 15)', '#192734'],
    ['rgb(21, 24, 28)', '#192734'],
    ['rgb(32, 35, 39)', '#22303C'],
    ['rgb(39, 44, 48)', '#22303C'],
    ['rgb(26, 29, 33)', '#22303C'],
  ]);

  const TEXT_FIXES = new Map([
    ['rgb(113, 118, 123)', '#8B98A5'],
  ]);

  const BORDER_FIXES = new Map([
    ['rgb(47, 51, 54)', '#38444D'],
  ]);

  /** 単一要素のインラインスタイルを修正 */
  function fixElementStyle(el) {
    const s = el.style;
    if (!s || !s.cssText) return;

    let fix;
    if ((fix = BG_FIXES.get(s.backgroundColor))) {
      s.setProperty('background-color', fix, 'important');
    }
    if ((fix = TEXT_FIXES.get(s.color))) {
      s.setProperty('color', fix, 'important');
    }
    if ((fix = BORDER_FIXES.get(s.borderColor))) {
      s.setProperty('border-color', fix, 'important');
    }
    if ((fix = BORDER_FIXES.get(s.borderBottomColor))) {
      s.setProperty('border-bottom-color', fix, 'important');
    }
    if ((fix = BORDER_FIXES.get(s.borderTopColor))) {
      s.setProperty('border-top-color', fix, 'important');
    }
  }

  /** DOM 全体のインラインスタイルをスキャン修正（body は observer が管理） */
  function fixAllInlineStyles() {
    const styled = document.querySelectorAll('[style]');
    for (let i = 0, len = styled.length; i < len; i++) {
      if (styled[i] === document.body) continue;
      fixElementStyle(styled[i]);
    }
  }

  /** 定期スキャン開始（React 再レンダリングによるスタイル上書き対策） */
  function startPeriodicScan() {
    stopPeriodicScan();
    _scanTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!isEnabled || !document.documentElement.classList.contains(GUARD_CLASS)) return;
      fixAllInlineStyles();
    }, 3000);
  }

  function stopPeriodicScan() {
    if (_scanTimer) {
      clearInterval(_scanTimer);
      _scanTimer = null;
    }
  }

  // ========================================================
  // テーマ検出・適用
  // ========================================================

  function getCurrentTheme() {
    return document.documentElement.dataset.theme || null;
  }

  /** DarkBlue テーマを解除し、状態をリセットする共通処理 */
  function deactivateTheme() {
    document.documentElement.classList.remove(GUARD_CLASS);
    if (document.body) document.body.style.removeProperty('background-color');
    updateThemeColor(false);
    try { localStorage.setItem(LAST_STATE_KEY, 'false'); } catch (e) { /* ignore */ }
    stopPeriodicScan();
    updatePageFlags();
  }

  /**
   * テーマを評価し、必要に応じて DarkBlue を適用/解除する。
   * - data-theme="dark" → "dim" に変換し DarkBlue 適用
   * - data-theme="dim"  → ガードクラスを維持
   * - その他（light 等）→ DarkBlue を解除
   */
  function evaluateAndApply() {
    let theme = getCurrentTheme();

    // 拡張機能が無効 → 解除
    if (!isEnabled) {
      if (theme === 'dim' && document.documentElement.classList.contains(GUARD_CLASS)) {
        // 自分が dim に変えたものなので dark に戻す
        document.documentElement.dataset.theme = 'dark';
      }
      deactivateTheme();
      return;
    }

    // ダークテーマ(黒) → DarkBlue(dim) に変換
    if (theme === 'dark') {
      document.documentElement.dataset.theme = 'dim';
      theme = 'dim';
    }

    // dim テーマ → ガードクラス適用
    if (theme === 'dim') {
      if (!document.documentElement.classList.contains(GUARD_CLASS)) {
        document.documentElement.classList.add(GUARD_CLASS);
      }
      // body bg は CSS ルール (html.darkbluethemex-active body) で適用
      updateThemeColor(true);
      try { localStorage.setItem(LAST_STATE_KEY, 'true'); } catch (e) { /* ignore */ }
      // 初回スキャンはブラウザアイドル時まで遅延（初期ロードをブロックしない）
      (window.requestIdleCallback || requestAnimationFrame)(() => {
        if (isEnabled && document.documentElement.classList.contains(GUARD_CLASS)) {
          fixAllInlineStyles();
        }
      });
      startPeriodicScan();
      updatePageFlags();
      return;
    }

    // ライトテーマ等 → 何もしない
    deactivateTheme();
  }

  function updateThemeColor(isDarkBlue) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && isDarkBlue) {
      meta.setAttribute('content', '#15202B');
    }
  }

  // ========================================================
  // SPA ナビゲーション検出 & ページ固有フラグ
  // ========================================================

  let _lastUrl = '';

  /**
   * 通知ページ判定フラグを html 要素に設定。
   * CSS で通知ページ固有のスタイル（背景色 transparent 等）を適用するため。
   */
  function updatePageFlags() {
    if (!document.documentElement.classList.contains(GUARD_CLASS)) {
      document.documentElement.removeAttribute('data-dbtx-page');
      return;
    }
    if (location.pathname.startsWith('/notifications')) {
      document.documentElement.setAttribute('data-dbtx-page', 'notifications');
    } else {
      document.documentElement.removeAttribute('data-dbtx-page');
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
  //
  // _suppressObserver フラグは廃止。MutationObserver コールバックは
  // マイクロタスクとして非同期に実行されるため、同期的なフラグ制御では
  // 自分自身の変更を抑制できない（コールバック発火時にはフラグが既に false）。
  // 代わりに、変更後の値を見て自分の変更かどうかを判定する。

  function startObserver() {
    if (domObserver) domObserver.disconnect();

    domObserver = new MutationObserver((mutations) => {
      // attributeFilter + observe(documentElement) により target/type は常に一致 → チェック不要
      let needsEval = false;
      const theme = getCurrentTheme();
      const hasGuard = document.documentElement.classList.contains(GUARD_CLASS);

      for (const mutation of mutations) {
        if (mutation.attributeName === 'data-theme') {
          // dim は自分が設定した値 → 再評価不要
          // !isEnabled 時は外部のテーマ変更に反応しない
          if (theme !== 'dim' && isEnabled) {
            needsEval = true;
            break;
          }
        } else if (mutation.attributeName === 'class') {
          // ガードクラスが外部から除去された場合のみ再適用
          if (isEnabled && theme === 'dim' && !hasGuard) {
            needsEval = true;
            break;
          }
        }
      }

      if (needsEval) evaluateAndApply();

      // SPA ナビゲーション検出
      checkUrlChange();
    });

    domObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
  }

  // ========================================================
  // ポップアップとの通信
  // ========================================================

  let _messageListenerRegistered = false;

  function registerMessageListener() {
    if (_messageListenerRegistered) return;
    _messageListenerRegistered = true;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'darkblue:toggle') {
        isEnabled = message.enabled;
        chrome.storage.sync.set({ [STORAGE_KEY]: isEnabled });
        try { localStorage.setItem(STORAGE_KEY + '_local', String(isEnabled)); } catch (e) { /* ignore */ }
        evaluateAndApply();
        sendResponse({ ok: true });
        return true;
      }

      if (message.type === 'darkblue:getState') {
        const isActive = document.documentElement.classList.contains(GUARD_CLASS);
        const theme = getCurrentTheme();

        sendResponse({
          enabled: isEnabled,
          isBlackTheme: theme === 'dark' || (isActive && theme === 'dim'),
          isDarkBlueApplied: isActive,
        });
        return true;
      }

      return false;
    });
  }

  // ========================================================
  // 初期化
  // ========================================================

  function init() {
    _lastUrl = location.href;
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

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[STORAGE_KEY]) {
        isEnabled = changes[STORAGE_KEY].newValue;
        evaluateAndApply();
      }
    });
  }

  // タブ復帰時に再評価（Xがテーマを変更している可能性）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isEnabled) {
      evaluateAndApply();
    }
  });

  // ========================================================
  // FOUC 防止: document_start 時点で楽観的に data-theme="dim" に変更
  // 前回 DarkBlue が適用されていた場合のみ実行
  // ========================================================

  try {
    if (localStorage.getItem(LAST_STATE_KEY) === 'true') {
      document.documentElement.classList.add(GUARD_CLASS);
      if (document.documentElement.dataset.theme === 'dark') {
        document.documentElement.dataset.theme = 'dim';
      }
    }
  } catch (e) {
    // localStorage アクセス失敗時は適用しない（安全側に倒す）
  }

  // クリーンアップ（unload は非推奨のため pagehide を使用）
  window.addEventListener('pagehide', () => {
    if (domObserver) { domObserver.disconnect(); domObserver = null; }
    stopPeriodicScan();
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
