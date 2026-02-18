/**
 * DarkBlueThemeX - Content Script
 *
 * X(旧Twitter)のダークテーマ(黒)を検出し、
 * DarkBlue(Dim)テーマに変換する。
 *
 * 戦略:
 *   1. ガードクラス方式: html.darkbluethemex-active で darkblue.css を有効化
 *   2. MutationObserver: DOM変更を監視し、CSSクラス由来の黒背景を検出→インラインで上書き
 *   3. 定期スキャン: 取りこぼし要素を定期的にスキャンして補完
 */

(function () {
  'use strict';

  const GUARD_CLASS = 'darkbluethemex-active';
  const STORAGE_KEY = 'darkblue_enabled';
  const LAST_STATE_KEY = 'darkbluethemex_was_active';

  // DarkBlue カラーパレット
  const COLORS = {
    BG_PRIMARY: '#15202B',     // rgb(21, 32, 43)
    BG_CARD: '#192734',        // rgb(25, 39, 52)
    BG_HOVER: '#22303C',       // rgb(34, 48, 60)
    BORDER: '#38444D',         // rgb(56, 68, 77)
    TEXT_SUB: '#8B98A5',       // rgb(139, 152, 165)
  };

  // DarkBlueの色RGB値（自分が設定した色を検出するため）
  const DB_COLORS = {
    PRIMARY: { r: 21, g: 32, b: 43 },
    CARD: { r: 25, g: 39, b: 52 },
    HOVER: { r: 34, g: 48, b: 60 },
  };

  // 黒テーマで使われる背景色 → DarkBlue変換マップ
  const COLOR_MAP = [
    // 純黒 → メイン背景
    { test: (r, g, b) => r <= 5 && g <= 5 && b <= 5, to: COLORS.BG_PRIMARY },
    // 近黒（低） → メイン背景
    { test: (r, g, b) => r <= 18 && g <= 18 && b <= 18, to: COLORS.BG_PRIMARY },
    // 近黒（中） → カード背景
    { test: (r, g, b) => r <= 28 && g <= 30 && b <= 34, to: COLORS.BG_CARD },
    // 近黒（高） → ホバー背景
    { test: (r, g, b) => r <= 42 && g <= 48 && b <= 52, to: COLORS.BG_HOVER },
  ];

  // ボーダー色マップ
  const BORDER_MAP = [
    // rgb(47, 51, 54) → DarkBlue ボーダー
    { test: (r, g, b) => r >= 44 && r <= 50 && g >= 48 && g <= 54 && b >= 51 && b <= 57, to: COLORS.BORDER },
  ];

  // テキスト色マップ
  const TEXT_MAP = [
    // rgb(113, 118, 123) → DarkBlue サブテキスト
    { test: (r, g, b) => r >= 110 && r <= 116 && g >= 115 && g <= 121 && b >= 120 && b <= 126, to: COLORS.TEXT_SUB },
  ];

  let isEnabled = true;
  let domObserver = null;
  let reevalTimers = [];
  let scanTimer = null;

  // ========================================================
  // ユーティリティ
  // ========================================================

  function parseRgb(str) {
    const m = str.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return null;
    return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) };
  }

  function mapColor(r, g, b, map) {
    for (const entry of map) {
      if (entry.test(r, g, b)) return entry.to;
    }
    return null;
  }

  /**
   * 色がDarkBlueパレットの色かどうかを判定
   */
  function isDarkBlueColor(r, g, b) {
    for (const c of [DB_COLORS.PRIMARY, DB_COLORS.CARD, DB_COLORS.HOVER]) {
      if (Math.abs(r - c.r) <= 2 && Math.abs(g - c.g) <= 2 && Math.abs(b - c.b) <= 2) {
        return true;
      }
    }
    return false;
  }

  // ========================================================
  // テーマ検出
  // ========================================================

  /**
   * bodyのネイティブ背景色を取得（拡張機能のインラインスタイルを除外）
   */
  function getOriginalBodyBg() {
    if (!document.body) return null;

    // bodyのインラインbackground-colorを一時退避
    const savedBg = document.body.style.getPropertyValue('background-color');
    const savedPriority = document.body.style.getPropertyPriority('background-color');
    document.body.style.removeProperty('background-color');

    // ガードクラスも一時除去してCSSの影響を排除
    const hadGuard = document.documentElement.classList.contains(GUARD_CLASS);
    if (hadGuard) {
      document.documentElement.classList.remove(GUARD_CLASS);
    }

    void document.body.offsetHeight; // force reflow

    const bg = getComputedStyle(document.body).backgroundColor;
    const c = parseRgb(bg);

    // 元に戻す
    if (hadGuard) {
      document.documentElement.classList.add(GUARD_CLASS);
    }
    if (savedBg) {
      document.body.style.setProperty('background-color', savedBg, savedPriority || '');
    }

    return c;
  }

  function isBlackThemeActive() {
    const c = getOriginalBodyBg();
    if (!c) return false;
    // 黒テーマ: RGB各値<=5
    return c.r <= 5 && c.g <= 5 && c.b <= 5;
  }

  function isAlreadyDarkBlue() {
    if (!document.body) return false;
    const bg = getComputedStyle(document.body).backgroundColor;
    const c = parseRgb(bg);
    if (!c) return false;
    return isDarkBlueColor(c.r, c.g, c.b);
  }

  // ========================================================
  // 要素の背景色を書き換え
  // ========================================================

  /**
   * 1つの要素の computedStyle を確認し、黒系の背景色を DarkBlue に書き換える
   */
  function recolorElement(el) {
    if (!el || el.nodeType !== 1) return;
    // ガードクラスが付いていなければスキップ
    if (!document.documentElement.classList.contains(GUARD_CLASS)) return;
    // 自分自身は書き換えない
    if (el === document.documentElement || el === document.head) return;

    // CSSで:hoverスタイルが管理されている要素はJSでの背景色上書きをスキップ
    // （インラインスタイルを焼き付けると:hoverが効かなくなる）
    const isHoverManaged = el.matches(
      'article[role="article"], [role="tab"], [role="menuitem"], ' +
      '[role="option"], [role="link"], [data-testid="UserCell"]'
    );

    const computed = getComputedStyle(el);

    // 背景色チェック
    if (!isHoverManaged) {
      const bgStr = computed.backgroundColor;
      if (bgStr && bgStr !== 'rgba(0, 0, 0, 0)' && bgStr !== 'transparent') {
        const bg = parseRgb(bgStr);
        if (bg) {
          // 既にDarkBlue色なら再変換しない
          if (!isDarkBlueColor(bg.r, bg.g, bg.b)) {
            const mapped = mapColor(bg.r, bg.g, bg.b, COLOR_MAP);
            if (mapped) {
              el.style.setProperty('background-color', mapped, 'important');
            }
          }
        }
      }
    }

    // ボーダー色チェック
    const borderColors = [
      computed.borderTopColor,
      computed.borderBottomColor,
      computed.borderLeftColor,
      computed.borderRightColor,
    ];
    for (const bc of borderColors) {
      if (bc) {
        const parsed = parseRgb(bc);
        if (parsed) {
          const mapped = mapColor(parsed.r, parsed.g, parsed.b, BORDER_MAP);
          if (mapped) {
            el.style.setProperty('border-color', mapped, 'important');
            break; // 1つマッチすれば全ボーダーに適用
          }
        }
      }
    }

    // テキスト色チェック
    const colorStr = computed.color;
    if (colorStr) {
      const col = parseRgb(colorStr);
      if (col) {
        const mapped = mapColor(col.r, col.g, col.b, TEXT_MAP);
        if (mapped) {
          el.style.setProperty('color', mapped, 'important');
        }
      }
    }
  }

  /**
   * ページ全体をスキャン
   */
  function fullScan() {
    if (!document.documentElement.classList.contains(GUARD_CLASS)) return;
    if (!document.body) return;

    // body自体
    recolorElement(document.body);

    // 主要コンテナとその子孫をスキャン
    const targets = document.querySelectorAll(
      '#react-root, ' +
      '#react-root > div, ' +
      '#react-root > div > div, ' +
      'header[role="banner"], ' +
      'nav[role="navigation"], ' +
      '[data-testid="primaryColumn"], ' +
      '[data-testid="sidebarColumn"], ' +
      '[role="main"], ' +
      '[role="complementary"], ' +
      '[role="dialog"], ' +
      '[role="menu"], ' +
      '[aria-modal="true"], ' +
      '[data-testid="DMDrawer"], ' +
      '[data-testid="cellInnerDiv"], ' +
      'article[role="article"], ' +
      '[role="tablist"], ' +
      '#layers, ' +
      '[data-testid="toolBar"], ' +
      '[data-testid="tweetTextarea_0"], ' +
      '[data-testid="renew-subscription-module"], ' +
      '[data-testid="news_sidebar"]'
    );

    for (const target of targets) {
      recolorElement(target);
      // 深さ4レベルまでスキャン
      for (const child of target.children) {
        recolorElement(child);
        for (const grandchild of child.children) {
          recolorElement(grandchild);
          for (const great of grandchild.children) {
            recolorElement(great);
          }
        }
      }
    }

    // ページヘッダーの半透明黒背景をDarkBlue化（プロフィール、ブックマーク等）
    // CSSで .r-5zmot を上書きしているが、クラス名変更時のフォールバックとして
    // backdrop-filter:blur を持つ要素を検出して rgba(0,0,0,X) → rgba(21,32,43,X) に変換
    const primaryCol = document.querySelector('[data-testid="primaryColumn"]');
    if (primaryCol) {
      const headerCandidates = primaryCol.querySelectorAll('div');
      for (let i = 0; i < Math.min(headerCandidates.length, 50); i++) {
        const el = headerCandidates[i];
        const cs = getComputedStyle(el);
        const bf = cs.backdropFilter || cs.webkitBackdropFilter;
        if (bf && bf.includes('blur')) {
          const bg = cs.backgroundColor;
          if (bg.startsWith('rgba(0, 0, 0,') && bg !== 'rgba(0, 0, 0, 0)') {
            const alpha = bg.match(/rgba\(0,\s*0,\s*0,\s*([\d.]+)/);
            if (alpha) {
              el.style.setProperty('background-color', 'rgba(21, 32, 43, ' + alpha[1] + ')', 'important');
            }
          }
        }
      }
    }

    // ツールバーの祖先DIVを明示的に書き換え（:has()が効かない場合のフォールバック）
    const toolbar = document.querySelector('[data-testid="toolBar"]');
    if (toolbar) {
      let el = toolbar.parentElement;
      for (let i = 0; i < 5 && el && el !== document.body; i++) {
        const bg = getComputedStyle(el).backgroundColor;
        const c = parseRgb(bg);
        if (c && c.r <= 5 && c.g <= 5 && c.b <= 5) {
          el.style.setProperty('background-color', COLORS.BG_PRIMARY, 'important');
        }
        el = el.parentElement;
      }
    }

    // サイドバー: 黒背景要素を検出して適切なDarkBlue色に変換
    const sidebar = document.querySelector('[data-testid="sidebarColumn"]');
    if (sidebar) {
      recolorElement(sidebar);
      // ターゲットを絞ったセレクタでスキャン（'*' の代わり）
      const sidebarTargets = sidebar.querySelectorAll(
        'div, section, aside, nav, header'
      );
      for (let i = 0; i < sidebarTargets.length; i++) {
        const el = sidebarTargets[i];
        // ホバー管理対象要素はスキップ（CSSの:hoverを壊さないため）
        if (el.dataset.testid === 'UserCell' || el.getAttribute('role') === 'link') continue;
        // Note: FORM要素自体はCSSで透明にしている（querySelectorにも含まれない）
        // 既にインラインでDarkBlue色が設定済みならスキップ
        const inlineBg = el.style.backgroundColor;
        if (inlineBg) {
          const ic = parseRgb(inlineBg);
          if (ic && isDarkBlueColor(ic.r, ic.g, ic.b)) continue;
        }
        const bg = getComputedStyle(el).backgroundColor;
        // 透明ならスキップ
        if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
        const c = parseRgb(bg);
        if (!c) continue;
        // 既にDarkBlue色ならスキップ
        if (isDarkBlueColor(c.r, c.g, c.b)) continue;
        // 黒背景 → プライマリ色に統一
        if (c.r <= 5 && c.g <= 5 && c.b <= 5) {
          el.style.setProperty('background-color', COLORS.BG_PRIMARY, 'important');
        }
      }
    }
  }

  // ========================================================
  // テーマ適用/解除
  // ========================================================

  function evaluateAndApply() {
    if (!document.body) return;

    // isBlackThemeActive() は内部でガードクラスとインラインスタイルを
    // 一時除去してネイティブ背景を判定するので、ここでの除去は不要
    const shouldApply = isEnabled && isBlackThemeActive();

    if (shouldApply) {
      if (!document.documentElement.classList.contains(GUARD_CLASS)) {
        document.documentElement.classList.add(GUARD_CLASS);
      }
      // CSS適用後にJSでの色置換も実行
      requestAnimationFrame(() => {
        fullScan();
      });
    } else {
      // DarkBlueが既に適用されている場合はガードクラスを維持
      if (isAlreadyDarkBlue() && isEnabled) {
        // 既にDarkBlue化済み - ガードクラスを維持
        if (!document.documentElement.classList.contains(GUARD_CLASS)) {
          document.documentElement.classList.add(GUARD_CLASS);
        }
        // FOUC防止用: 次回ロード時に楽観的に適用するための状態保存
        try { localStorage.setItem(LAST_STATE_KEY, 'true'); } catch (e) {}
        return;
      }
      document.documentElement.classList.remove(GUARD_CLASS);
    }

    // FOUC防止用: 次回ロード時の楽観的適用の可否を保存
    try { localStorage.setItem(LAST_STATE_KEY, String(shouldApply)); } catch (e) {}

    updateThemeColor(shouldApply);
  }

  function updateThemeColor(isDarkBlue) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && isDarkBlue) {
      meta.setAttribute('content', '#15202B');
    }
  }

  // ========================================================
  // MutationObserver: DOM変更監視
  // ========================================================

  function startObserver() {
    if (domObserver) {
      domObserver.disconnect();
    }

    let evalDebounce = null;
    let scanDebounce = null;

    domObserver = new MutationObserver((mutations) => {
      if (!document.documentElement.classList.contains(GUARD_CLASS)) {
        // テーマ非適用時はbodyの変更のみ監視（テーマ切替検出用）
        for (const m of mutations) {
          if (m.target === document.body && m.type === 'attributes') {
            if (!evalDebounce) {
              evalDebounce = setTimeout(() => {
                evalDebounce = null;
                evaluateAndApply();
              }, 200);
            }
            return;
          }
        }
        return;
      }

      let needsRescan = false;

      for (const mutation of mutations) {
        // body自体のスタイル/クラス変更 → テーマ変更の可能性
        if (mutation.target === document.body && mutation.type === 'attributes') {
          if (!evalDebounce) {
            evalDebounce = setTimeout(() => {
              evalDebounce = null;
              evaluateAndApply();
            }, 200);
          }
          continue;
        }

        // 子要素追加 → 新しい要素を書き換え
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              recolorElement(node);
              // 追加された要素の子も処理
              const inner = node.querySelectorAll ? node.querySelectorAll('*') : [];
              for (let i = 0; i < Math.min(inner.length, 100); i++) {
                recolorElement(inner[i]);
              }
              if (inner.length > 100) needsRescan = true;
            }
          }
        }

        // スタイル属性変更 → その要素を再チェック
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          recolorElement(mutation.target);
        }

        // クラス変更 → 背景色が変わった可能性
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          recolorElement(mutation.target);
        }
      }

      // 大量の追加があった場合はフルスキャン
      if (needsRescan && !scanDebounce) {
        scanDebounce = setTimeout(() => {
          scanDebounce = null;
          fullScan();
        }, 300);
      }
    });

    // body全体を監視
    if (document.body) {
      domObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    }

    // html の直接変更も監視（テーマ切替）
    domObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      childList: true,
    });
  }

  // ========================================================
  // 定期スキャン
  // ========================================================

  function startPeriodicScan() {
    if (scanTimer) clearInterval(scanTimer);
    // 5秒ごとにフルスキャン（取りこぼし補完）
    scanTimer = setInterval(() => {
      if (document.documentElement.classList.contains(GUARD_CLASS)) {
        fullScan();
      }
    }, 5000);
  }

  function stopPeriodicScan() {
    if (scanTimer) {
      clearInterval(scanTimer);
      scanTimer = null;
    }
  }

  // ========================================================
  // 遅延再評価
  // ========================================================

  function scheduleReevaluations() {
    reevalTimers.forEach(clearTimeout);
    reevalTimers = [];

    [300, 800, 1500, 3000, 6000].forEach((delay) => {
      reevalTimers.push(setTimeout(() => {
        evaluateAndApply();
      }, delay));
    });
  }

  // ========================================================
  // ポップアップとの通信
  // ========================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'darkblue:toggle') {
      isEnabled = message.enabled;
      chrome.storage.sync.set({ [STORAGE_KEY]: isEnabled });

      if (isEnabled) {
        evaluateAndApply();
        startPeriodicScan();
      } else {
        document.documentElement.classList.remove(GUARD_CLASS);
        stopPeriodicScan();
        cleanupInlineStyles();
        try { localStorage.setItem(LAST_STATE_KEY, 'false'); } catch (e) {}
      }

      sendResponse({ ok: true });
      return true;
    }

    if (message.type === 'darkblue:getState') {
      const isActive = document.documentElement.classList.contains(GUARD_CLASS);

      sendResponse({
        enabled: isEnabled,
        isBlackTheme: isActive ? true : isBlackThemeActive(),
        isDarkBlueApplied: isActive,
      });
      return true;
    }

    return false;
  });

  /**
   * 拡張機能OFF時にインラインスタイルをクリーンアップ
   */
  function cleanupInlineStyles() {
    const all = document.querySelectorAll('[style]');
    for (const el of all) {
      const style = el.getAttribute('style') || '';
      if (style.includes(COLORS.BG_PRIMARY) ||
          style.includes(COLORS.BG_CARD) ||
          style.includes(COLORS.BG_HOVER) ||
          style.includes(COLORS.BORDER) ||
          style.includes(COLORS.TEXT_SUB)) {
        el.style.removeProperty('background-color');
        el.style.removeProperty('border-color');
        el.style.removeProperty('color');
      }
    }
  }

  // ========================================================
  // 初期化
  // ========================================================

  function init() {
    chrome.storage.sync.get({ [STORAGE_KEY]: true }, (result) => {
      isEnabled = result[STORAGE_KEY];
      evaluateAndApply();
      startObserver();
      scheduleReevaluations();
      if (isEnabled) {
        startPeriodicScan();
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[STORAGE_KEY]) {
        isEnabled = changes[STORAGE_KEY].newValue;
        if (isEnabled) {
          evaluateAndApply();
          startPeriodicScan();
        } else {
          document.documentElement.classList.remove(GUARD_CLASS);
          stopPeriodicScan();
          cleanupInlineStyles();
          try { localStorage.setItem(LAST_STATE_KEY, 'false'); } catch (e) {}
        }
      }
    });
  }

  // ========================================================
  // FOUC防止: document_start 時点で楽観的にガードクラスを適用
  // storage取得やbody出現を待たず、即座にCSSを有効化する。
  // 後から「ライトテーマだった」「無効設定だった」場合に除去する。
  //
  // localStorage に前回の適用状態を保存し、前回適用していた場合のみ
  // 楽観的に適用する（ライトテーマユーザーへの誤適用を防止）。
  // ========================================================

  try {
    // 前回DarkBlueが適用されていた場合のみ、即座にガードクラスを付与
    if (localStorage.getItem(LAST_STATE_KEY) !== 'false') {
      document.documentElement.classList.add(GUARD_CLASS);
    }
  } catch (e) {
    // localStorage アクセス失敗時はフォールバック（適用する）
    document.documentElement.classList.add(GUARD_CLASS);
  }

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
