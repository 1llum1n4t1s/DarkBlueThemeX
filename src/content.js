/**
 * DarkBlueThemeX - Content Script
 *
 * X(旧Twitter)の data-theme="dark" を data-theme="dim" に切り替え、
 * X内蔵の DarkBlue(Dim) テーマ CSS カスタムプロパティを有効化する。
 * ハードコードされた r-* クラスとインラインスタイルは darkblue.css で上書き。
 */

(function () {
  'use strict';

  const GUARD_CLASS = 'darkbluethemex-active';
  const STORAGE_KEY = 'darkblue_enabled';
  const LAST_STATE_KEY = 'darkbluethemex_was_active';

  let isEnabled = true;
  let domObserver = null;
  let _scanTimer = null;
  let _metaThemeColor = null;       // キャッシュ: <meta name="theme-color">
  let _originalThemeColor = null;   // 元の theme-color 値（復元用）
  let _bodyThemeFixed = false;      // body の data-theme を変更したかどうか（jf-element 用）
  let _idleCallbackPending = false; // requestIdleCallback の重複防止

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

  /** DOM 全体のインラインスタイルをスキャン修正（body は CSS ルールで管理） */
  function fixAllInlineStyles() {
    // :not(body) でセレクタレベルで除外し、ループ内比較を排除
    const styled = document.querySelectorAll(':not(body)[style]');
    for (let i = 0, len = styled.length; i < len; i++) {
      fixElementStyle(styled[i]);
    }
  }

  /** 定期スキャン開始（React 再レンダリングによるスタイル上書き対策） */
  function startPeriodicScan() {
    if (_scanTimer) return; // 既にスキャン中なら再生成しない
    _scanTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!isEnabled || !document.documentElement.classList.contains(GUARD_CLASS)) return;
      fixAllInlineStyles();
    }, 3000);
  }

  function stopPeriodicScan() {
    // clearInterval(null) は仕様上安全（no-op）
    clearInterval(_scanTimer);
    _scanTimer = null;
  }

  // ========================================================
  // テーマ検出・適用
  // ========================================================

  function getCurrentTheme() {
    return document.documentElement.dataset.theme || null;
  }

  const OFF_CLASS = 'darkbluethemex-off';

  /** DarkBlue テーマを解除し、状態をリセットする共通処理 */
  function deactivateTheme() {
    const docEl = document.documentElement;
    // setAttribute インターセプトを先に無効化（dark への復元を許可）
    deactivateAttributeIntercept();
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
    const theme = getCurrentTheme();

    // 拡張機能が無効 → 解除
    if (!isEnabled) {
      // dataset.theme = 'dark' 代入前にインターセプトを無効化（deactivateTheme 内でも呼ぶが順序上ここで必要）
      deactivateAttributeIntercept();
      if (theme === 'dim' && document.documentElement.classList.contains(GUARD_CLASS)) {
        document.documentElement.dataset.theme = 'dark';
      }
      deactivateTheme();
      return;
    }

    // ダークテーマ(黒) → DarkBlue(dim) に変換
    if (theme === 'dark') {
      document.documentElement.dataset.theme = 'dim';
    }

    // dim テーマ or dark→dim 変換後 → ガードクラス適用
    if (theme === 'dark' || theme === 'dim') {
      // classList.add()/remove() は既存/非存在クラスに対して no-op のためチェック不要
      document.documentElement.classList.add(GUARD_CLASS);
      document.documentElement.classList.remove(OFF_CLASS);
      // setAttribute インターセプト有効化（X の JS が dark に戻すのを阻止）
      installAttributeIntercept();
      // body の data-theme も dim に変換（jf-element 用: body が独自に data-theme="dark" を持つ場合）
      if (document.body && document.body.dataset.theme === 'dark') {
        document.body.dataset.theme = 'dim';
        _bodyThemeFixed = true;
      }
      // body bg は CSS ルール (html.darkbluethemex-active body) で適用
      updateThemeColor(true);
      try { localStorage.setItem(LAST_STATE_KEY, 'true'); } catch (e) { /* ignore */ }
      // 初回スキャンはブラウザアイドル時まで遅延（重複登録防止付き）
      if (!_idleCallbackPending) {
        _idleCallbackPending = true;
        requestIdleCallback(() => {
          _idleCallbackPending = false;
          if (isEnabled && document.documentElement.classList.contains(GUARD_CLASS)) {
            fixAllInlineStyles();
          }
        });
      }
      startPeriodicScan();
      updatePageFlags();
      return;
    }

    // ライトテーマ等 → 何もしない
    deactivateTheme();
  }

  function updateThemeColor(isDarkBlue) {
    if (!_metaThemeColor) {
      _metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (_metaThemeColor) _originalThemeColor = _metaThemeColor.getAttribute('content');
    }
    if (!_metaThemeColor) return;
    if (isDarkBlue) {
      _metaThemeColor.setAttribute('content', '#15202B');
    } else if (_originalThemeColor) {
      // 無効化時に X の元の theme-color を復元
      _metaThemeColor.setAttribute('content', _originalThemeColor);
    }
  }

  // ========================================================
  // SPA ナビゲーション検出 & ページ固有フラグ
  // ========================================================

  let _lastUrl = location.href;

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
      // observe(documentElement) と observe(body) の両方から届くため target チェックが必要
      let needsEval = false;
      const theme = getCurrentTheme();
      const hasGuard = document.documentElement.classList.contains(GUARD_CLASS);

      for (const mutation of mutations) {
        if (mutation.target === document.body) {
          // body の data-theme が外部から dark に戻された場合、dim に再変換
          if (isEnabled && hasGuard && document.body.dataset.theme === 'dark') {
            document.body.dataset.theme = 'dim';
          }
          continue;
        }
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
      // checkUrlChange() は History API フック + popstate で完全にカバー済み
      // data-theme/class 属性変更は URL 変更と無関係なため、ここでの呼び出しは不要
    });

    domObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    // body の data-theme も監視（jf-element 用: Creator Studio 等のページ対応）
    domObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  // ========================================================
  // ポップアップとの通信
  // ========================================================

  function registerMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'darkblue:toggle') {
        isEnabled = message.enabled;
        // storage.sync.set は popup.js 側で実行済み → ここでは不要
        // （二重書き込みは storage.onChanged → evaluateAndApply の余分な発火を招く）
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
  // setAttribute インターセプト
  // X の main.js が data-theme="dark" を再設定するのを同期的に dim に変換。
  // MutationObserver は非同期のため、これがないと黒テーマが一瞬描画される。
  // ========================================================

  // オリジナルのプロトタイプを一度だけキャプチャ（多重ラップ防止）
  const _origSetAttribute = Element.prototype.setAttribute;
  const _origRemoveAttribute = Element.prototype.removeAttribute;
  let _attrInterceptActive = false;
  let _attrInterceptInstalled = false;

  function installAttributeIntercept() {
    _attrInterceptActive = true;
    if (_attrInterceptInstalled) return;
    _attrInterceptInstalled = true;
    const docEl = document.documentElement;

    Element.prototype.setAttribute = function (name, value) {
      if (_attrInterceptActive && this === docEl && name === 'data-theme' && value === 'dark') {
        return _origSetAttribute.call(this, name, 'dim');
      }
      return _origSetAttribute.call(this, name, value);
    };

    Element.prototype.removeAttribute = function (name) {
      if (_attrInterceptActive && this === docEl && name === 'data-theme') {
        return;
      }
      return _origRemoveAttribute.call(this, name);
    };
  }

  function deactivateAttributeIntercept() {
    _attrInterceptActive = false;
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
