/**
 * DarkBlueThemeX - Content Script (v2: CSS Variable Approach)
 *
 * X(旧Twitter)の data-theme="dark" を data-theme="dim" に切り替え、
 * X内蔵の DarkBlue(Dim) テーマ CSS カスタムプロパティを有効化する。
 * ハードコードされた r-* クラスとインラインスタイルは darkblue.css で上書き。
 *
 * v1(力業)からの主な改善:
 *   - getComputedStyle / recolorElement / fullScan を全廃
 *   - MutationObserver は html 属性 + body スタイルのみ監視
 *   - 定期スキャン不要（rAFバッチ、dirtyFlag、WeakSet 等すべて廃止）
 */

(function () {
  'use strict';

  const GUARD_CLASS = 'darkbluethemex-active';
  const STORAGE_KEY = 'darkblue_enabled';
  const LAST_STATE_KEY = 'darkbluethemex_was_active';

  let isEnabled = true;
  let domObserver = null;
  let inlineObserver = null;
  let _suppressObserver = false;
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

  /** DOM 全体のインラインスタイルをスキャン修正 */
  function fixAllInlineStyles() {
    const styled = document.querySelectorAll('[style]');
    for (let i = 0, len = styled.length; i < len; i++) {
      fixElementStyle(styled[i]);
    }
  }

  // --- インラインスタイル監視（新規ノード用） ---

  let _pendingNodes = [];
  let _rafPending = false;

  function processPendingNodes() {
    _rafPending = false;
    const nodes = _pendingNodes;
    _pendingNodes = [];
    if (!isEnabled || !document.documentElement.classList.contains(GUARD_CLASS)) return;
    for (const node of nodes) {
      if (node.nodeType !== 1) continue;
      fixElementStyle(node);
      const styled = node.querySelectorAll('[style]');
      for (let i = 0, len = styled.length; i < len; i++) {
        fixElementStyle(styled[i]);
      }
    }
  }

  function startInlineObserver() {
    if (inlineObserver || !document.body) return;
    inlineObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== 'childList') continue;
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) _pendingNodes.push(node);
        }
      }
      if (_pendingNodes.length > 0 && !_rafPending) {
        _rafPending = true;
        requestAnimationFrame(processPendingNodes);
      }
    });
    inlineObserver.observe(document.body, { childList: true, subtree: true });
  }

  function stopInlineObserver() {
    if (inlineObserver) {
      inlineObserver.disconnect();
      inlineObserver = null;
    }
    _pendingNodes = [];
    _rafPending = false;
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

  /**
   * テーマを評価し、必要に応じて DarkBlue を適用/解除する。
   * - data-theme="dark" → "dim" に変換し DarkBlue 適用
   * - data-theme="dim"  → ガードクラスを維持
   * - その他（light 等）→ DarkBlue を解除
   */
  function evaluateAndApply() {
    const theme = getCurrentTheme();

    // 拡張機能が無効 → 解除
    if (!isEnabled) {
      _suppressObserver = true;
      if (theme === 'dim' && document.documentElement.classList.contains(GUARD_CLASS)) {
        // 自分が dim に変えたものなので dark に戻す
        document.documentElement.dataset.theme = 'dark';
      }
      document.documentElement.classList.remove(GUARD_CLASS);
      if (document.body) document.body.style.removeProperty('background-color');
      updateThemeColor(false);
      try { localStorage.setItem(LAST_STATE_KEY, 'false'); } catch (e) { /* ignore */ }
      _suppressObserver = false;
      stopInlineObserver();
      stopPeriodicScan();
      updatePageFlags();
      return;
    }

    // ダークテーマ(黒) → DarkBlue(dim) に変換
    if (theme === 'dark') {
      _suppressObserver = true;
      document.documentElement.dataset.theme = 'dim';
      _suppressObserver = false;
    }

    // dim テーマ → ガードクラス適用
    if (getCurrentTheme() === 'dim') {
      if (!document.documentElement.classList.contains(GUARD_CLASS)) {
        document.documentElement.classList.add(GUARD_CLASS);
      }
      if (document.body) {
        document.body.style.setProperty('background-color', '#15202B', 'important');
      }
      updateThemeColor(true);
      try { localStorage.setItem(LAST_STATE_KEY, 'true'); } catch (e) { /* ignore */ }
      fixAllInlineStyles();
      startInlineObserver();
      startPeriodicScan();
      updatePageFlags();
      return;
    }

    // ライトテーマ等 → 何もしない
    document.documentElement.classList.remove(GUARD_CLASS);
    if (document.body) document.body.style.removeProperty('background-color');
    updateThemeColor(false);
    try { localStorage.setItem(LAST_STATE_KEY, 'false'); } catch (e) { /* ignore */ }
    stopInlineObserver();
    stopPeriodicScan();
    updatePageFlags();
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
  // MutationObserver: html 属性 + body スタイルのみ監視
  // ========================================================

  function startObserver() {
    if (domObserver) domObserver.disconnect();

    domObserver = new MutationObserver((mutations) => {
      if (_suppressObserver) return;

      for (const mutation of mutations) {
        // html の data-theme / class 変更 → テーマ再評価
        if (mutation.target === document.documentElement && mutation.type === 'attributes') {
          if (mutation.attributeName === 'data-theme' || mutation.attributeName === 'class') {
            evaluateAndApply();
          }
        }

        // body の style 変更 → React が bg 色を再設定した場合に上書き
        if (mutation.target === document.body &&
            mutation.type === 'attributes' &&
            mutation.attributeName === 'style') {
          if (isEnabled && document.documentElement.classList.contains(GUARD_CLASS)) {
            document.body.style.setProperty('background-color', '#15202B', 'important');
          }
        }
      }

      // SPA ナビゲーション検出
      checkUrlChange();
    });

    // html 要素の属性変更を監視（childList 不要: body 待機は waitForBody で処理）
    domObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });

    // body の style 変更を監視
    if (document.body) {
      domObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['style'],
      });
    }
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

  // クリーンアップ
  window.addEventListener('unload', () => {
    if (domObserver) { domObserver.disconnect(); domObserver = null; }
    stopInlineObserver();
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
