/**
 * DarkBlueThemeX - Content Script
 *
 * X(旧Twitter)のダークテーマ(黒)を検出し、
 * DarkBlue(Dim)テーマに変換する。
 *
 * 戦略:
 *   1. ガードクラス方式: html.darkbluethemex-active で darkblue.css を有効化
 *   2. MutationObserver: DOM変更を監視し、CSSクラス由来の黒背景を検出→インラインで上書き
 *   3. スマート定期スキャン: visibilityState + dirtyFlag で効率的に取りこぼし補完
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

  // [A5] isDarkBlueColor用の事前構築済み配列
  const DB_COLOR_LIST = [DB_COLORS.PRIMARY, DB_COLORS.CARD, DB_COLORS.HOVER];

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

  // [A8] Observer抑制フラグ（getOriginalBodyBg内でのDOM変更を無視）
  let _suppressObserver = false;

  // [A1] rAFバッチング用
  let _rafScheduled = false;
  let _pendingNodes = new Set();

  // [A2] スマートスキャン用
  let _dirtyFlag = false;
  let _scanInterval = 5000;
  const SCAN_INTERVAL_IDLE = 10000;
  const SCAN_INTERVAL_ACTIVE = 5000;

  // [A15] debounceタイマーをスコープ外に昇格
  let _evalDebounce = null;
  let _scanDebounce = null;

  // [A9] 処理済み要素追跡用 WeakSet
  const _processedElements = new WeakSet();

  // [A6] 事前コンパイル済み正規表現
  const RE_RGB = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/;

  // [A4] parseRgb結果キャッシュ（Mapベース、サイズ制限付き）
  const _parseCache = new Map();
  const PARSE_CACHE_MAX = 500;

  // [B4] cleanupInlineStyles用: DarkBlue色のRGB正規化値リスト
  const DB_RGB_VALUES = [
    'rgb(21, 32, 43)',    // BG_PRIMARY
    'rgb(25, 39, 52)',    // BG_CARD
    'rgb(34, 48, 60)',    // BG_HOVER
    'rgb(56, 68, 77)',    // BORDER
    'rgb(139, 152, 165)', // TEXT_SUB
  ];

  // ========================================================
  // ユーティリティ
  // ========================================================

  // [B1] rgba()対応 + [A6] 事前コンパイル正規表現 + [A4] キャッシュ
  function parseRgb(str) {
    if (!str) return null;

    // キャッシュヒットチェック
    const cached = _parseCache.get(str);
    if (cached !== undefined) return cached;

    const m = str.match(RE_RGB);
    const result = m ? { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) } : null;

    // キャッシュに保存（上限超過時はクリア）
    if (_parseCache.size >= PARSE_CACHE_MAX) {
      _parseCache.clear();
    }
    _parseCache.set(str, result);

    return result;
  }

  function mapColor(r, g, b, map) {
    for (const entry of map) {
      if (entry.test(r, g, b)) return entry.to;
    }
    return null;
  }

  /**
   * 色がDarkBlueパレットの色かどうかを判定
   * [A5] 事前構築済み配列を使用
   */
  function isDarkBlueColor(r, g, b) {
    for (const c of DB_COLOR_LIST) {
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
   * [A3] 結果キャッシュ + [A8] Observer抑制フラグ
   */
  let _bodyBgCache = null;
  let _bodyBgCacheTime = 0;
  const BODY_BG_CACHE_TTL = 1000; // 1秒キャッシュ

  function getOriginalBodyBg() {
    if (!document.body) return null;

    // キャッシュ有効チェック
    const now = Date.now();
    if (_bodyBgCache !== null && (now - _bodyBgCacheTime) < BODY_BG_CACHE_TTL) {
      return _bodyBgCache;
    }

    // [A8] Observer抑制開始
    _suppressObserver = true;

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

    // [A8] Observer抑制解除
    _suppressObserver = false;

    // キャッシュ更新
    _bodyBgCache = c;
    _bodyBgCacheTime = now;

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
   * [A9] WeakSet による処理済み追跡（style変更時にはリセット）
   */
  function recolorElement(el) {
    if (!el || el.nodeType !== 1) return;
    // ガードクラスが付いていなければスキップ
    if (!document.documentElement.classList.contains(GUARD_CLASS)) return;
    // 自分自身は書き換えない
    if (el === document.documentElement || el === document.head) return;

    // アバターコンテナの内側要素はスキップ
    // （Xはアバター内DIVに rgb(0,0,0) をインラインで設定し、z-index:-1 の背景画像で
    //   アバターを表示する仕組みのため、書き換えると画像が隠れる）
    if (el.closest('[data-testid*="UserAvatar"]')) return;

    // 通知アイテム・通知内cellInnerDiv はスキップ
    // （CSSで transparent に設定しているが、ここでインラインを焼き付けると
    //   CSSの transparent を上書きしてしまい、z-index:-1 のアバター画像が隠れる）
    if (el.dataset?.testid === 'notification') return;
    if (el.dataset?.testid === 'cellInnerDiv' && el.querySelector('[data-testid="notification"]')) return;

    // mentionsページのcellInnerDiv・article・中間DIVもスキップ
    // (data-dbtx-notif="1"でマーキング済み — CSSで transparent に設定)
    if (el.dataset?.dbtxNotif) return;
    if (el.closest('[data-dbtx-notif]') && (el.tagName === 'ARTICLE' || el.tagName === 'DIV')) return;

    // 「新しいポストを表示」バナー背景をスキップ
    // 通知ページの sticky ヘッダー(z:3)内に position:absolute; z-index:-1 で
    // 配置されたバナーの子DIVが不透明背景を持つと、1行目の通知アバター行が隠れる。
    // data-dbtx-skip 属性でマーキング済みの要素はスキップする
    if (el.dataset?.dbtxSkip) return;

    // CSSで:hoverスタイルが管理されている要素はJSでの背景色上書きをスキップ
    // （インラインスタイルを焼き付けると:hoverが効かなくなる）
    const isHoverManaged = el.matches(
      'article[role="article"], [role="tab"], [role="menuitem"], ' +
      '[role="option"], [role="link"], [data-testid="UserCell"], ' +
      'article[role="article"] [role="group"]'
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

    // ボーダー色チェック（幅>0の辺のみ判定、パフォーマンス改善）
    const borderSides = [
      { prop: 'border-top-color', color: computed.borderTopColor, width: computed.borderTopWidth },
      { prop: 'border-bottom-color', color: computed.borderBottomColor, width: computed.borderBottomWidth },
      { prop: 'border-left-color', color: computed.borderLeftColor, width: computed.borderLeftWidth },
      { prop: 'border-right-color', color: computed.borderRightColor, width: computed.borderRightWidth },
    ];
    for (const side of borderSides) {
      if (side.width === '0px' || !side.color) continue;
      const parsed = parseRgb(side.color);
      if (parsed) {
        const mapped = mapColor(parsed.r, parsed.g, parsed.b, BORDER_MAP);
        if (mapped) {
          el.style.setProperty(side.prop, mapped, 'important');
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
      '[data-testid="news_sidebar"], ' +
      '[data-testid="inline_reply_offscreen"]'
    );

    for (const target of targets) {
      recolorElement(target);
      // 深さ2レベルまでスキャン（パフォーマンス改善）
      for (const child of target.children) {
        recolorElement(child);
        for (const grandchild of child.children) {
          recolorElement(grandchild);
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
    // section, aside + 直接の子DIV（ウィジェットコンテナ）をスキャン
    const sidebar = document.querySelector('[data-testid="sidebarColumn"]');
    if (sidebar) {
      recolorElement(sidebar);
      const sidebarTargets = sidebar.querySelectorAll('section, aside');
      for (let i = 0; i < sidebarTargets.length; i++) {
        recolorElement(sidebarTargets[i]);
      }
      // サイドバーのウィジェットコンテナDIV
      // （本日のニュース、速報、おすすめユーザー等 — クラス由来の黒背景）
      // 構造: sidebarColumn > div > div > div > div > div > [ウィジェットDIV]
      const widgetList = sidebar.querySelector(':scope > div > div > div > div > div');
      if (widgetList) {
        for (const child of widgetList.children) {
          recolorElement(child);
        }
      }
    }

    // 通知ページ: 「新しいポストを表示」バナーの背景除去
    // sticky ヘッダー(z:3)内の position:absolute バナーが不透明背景(#15202B)を持つと
    // 1行目通知のアバター行を覆い隠すため、インラインスタイルを除去してCSSの transparent に委ねる
    markNewPostBanner();

    // 通知ページ: cellInnerDiv に data-dbtx-notif マーキング
    // mentionsページの article 形式の通知でもアバターが見えるようにする
    markNotificationCells();

    // スキャン完了: dirtyフラグをリセット
    _dirtyFlag = false;
  }

  /**
   * 「新しいポストを表示」バナー内の不透明背景DIVをマーキングし、
   * インライン背景色を除去する。
   * data-dbtx-skip 属性を付与して recolorElement でのスキップ判定に使う。
   */
  function markNewPostBanner() {
    const primaryCol = document.querySelector('[data-testid="primaryColumn"]');
    if (!primaryCol) return;

    // tablist を含むヘッダーDIVを起点にバナーを探す
    const tablist = primaryCol.querySelector('[role="tablist"]');
    if (!tablist) return;

    // tablist → ... → sticky ヘッダーDIV を辿る
    // sticky ヘッダーは tablist の祖先で primaryColumn の子孫
    let stickyCandidate = tablist.parentElement;
    while (stickyCandidate && stickyCandidate !== primaryCol) {
      if (getComputedStyle(stickyCandidate).position === 'sticky') {
        // sticky ヘッダーの子で、tablist を含まない要素 = バナー候補
        for (const child of stickyCandidate.children) {
          if (!child.contains(tablist)) {
            // バナー候補の中のDIVをマーキング＋インラインで transparent を強制
            // （CSS側のルール(L582等)が高specificityで #15202B を設定するため、
            //   removeProperty ではCSSが再適用される。インライン!importantで確実に上書き）
            child.querySelectorAll('div').forEach(div => {
              div.dataset.dbtxSkip = '1';
              div.style.setProperty('background-color', 'transparent', 'important');
            });
            // バナー自体もマーキング
            child.dataset.dbtxSkip = '1';
            child.style.setProperty('background-color', 'transparent', 'important');
          }
        }
        break;
      }
      stickyCandidate = stickyCandidate.parentElement;
    }
  }

  /**
   * 通知ページ（/notifications, /notifications/mentions）の cellInnerDiv に
   * data-dbtx-notif="1" をマーキングし、CSSで背景色を transparent にできるようにする。
   * mentionsページは data-testid="notification" がなく通常の article 形式のため、
   * 既存のCSS(:has([data-testid="notification"]))では対応できない。
   * URL判定で通知ページを検出し、cellInnerDiv にマーキングする。
   */
  function markNotificationCells() {
    if (!location.pathname.startsWith('/notifications')) return;
    const cells = document.querySelectorAll('[data-testid="cellInnerDiv"]:not([data-dbtx-notif])');
    for (const cell of cells) {
      cell.dataset.dbtxNotif = '1';
    }
  }

  // ========================================================
  // テーマ適用/解除
  // ========================================================

  function evaluateAndApply() {
    if (!document.body) return;

    // [A3] bodyBgキャッシュを無効化（テーマ切替の可能性があるため）
    _bodyBgCache = null;

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
      updateThemeColor(true);
    } else {
      // DarkBlueが既に適用されている場合はガードクラスを維持
      if (isAlreadyDarkBlue() && isEnabled) {
        // 既にDarkBlue化済み - ガードクラスを維持
        if (!document.documentElement.classList.contains(GUARD_CLASS)) {
          document.documentElement.classList.add(GUARD_CLASS);
        }
        // FOUC防止用: 次回ロード時に楽観的に適用するための状態保存
        try { localStorage.setItem(LAST_STATE_KEY, 'true'); } catch (e) {}
        // [B5修正] isAlreadyDarkBlue分岐でもthemeColorを更新
        updateThemeColor(true);
        return;
      }
      document.documentElement.classList.remove(GUARD_CLASS);
      updateThemeColor(false);
    }

    // FOUC防止用: 次回ロード時の楽観的適用の可否を保存
    try { localStorage.setItem(LAST_STATE_KEY, String(shouldApply)); } catch (e) {}
  }

  function updateThemeColor(isDarkBlue) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && isDarkBlue) {
      meta.setAttribute('content', '#15202B');
    }
  }

  // ========================================================
  // MutationObserver: DOM変更監視
  // [A1] rAFバッチング + Set重複排除
  // [A8] _suppressObserver対応
  // [A15] debounce変数スコープ外昇格済み
  // ========================================================

  /**
   * [A1] rAFバッチで保留ノードをまとめて処理
   */
  function _flushPendingNodes() {
    _rafScheduled = false;
    if (!document.documentElement.classList.contains(GUARD_CLASS)) return;

    for (const node of _pendingNodes) {
      if (node.isConnected) {
        recolorElement(node);
        // [A10] TreeWalker で子孫を効率的に走査（上限20要素）
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, null);
        let count = 0;
        let child = walker.firstChild();
        while (child && count < 20) {
          recolorElement(child);
          child = walker.nextNode();
          count++;
        }
        if (count >= 20) _dirtyFlag = true;
      }
    }
    _pendingNodes.clear();

    // バナーが新規追加された場合に備えてマーキングを更新
    markNewPostBanner();
    // 通知ページの新規 cellInnerDiv をマーキング
    markNotificationCells();
  }

  function startObserver() {
    if (domObserver) {
      domObserver.disconnect();
    }

    domObserver = new MutationObserver((mutations) => {
      // [A8] Observer抑制中はスキップ
      if (_suppressObserver) return;

      if (!document.documentElement.classList.contains(GUARD_CLASS)) {
        // テーマ非適用時はbodyの変更のみ監視（テーマ切替検出用）
        for (const m of mutations) {
          if (m.target === document.body && m.type === 'attributes') {
            if (!_evalDebounce) {
              _evalDebounce = setTimeout(() => {
                _evalDebounce = null;
                evaluateAndApply();
              }, 200);
            }
            return;
          }
        }
        return;
      }

      for (const mutation of mutations) {
        // body自体のスタイル/クラス変更 → テーマ変更の可能性
        if (mutation.target === document.body && mutation.type === 'attributes') {
          if (!_evalDebounce) {
            _evalDebounce = setTimeout(() => {
              _evalDebounce = null;
              evaluateAndApply();
            }, 200);
          }
          continue;
        }

        // 子要素追加 → [A1] rAFバッチキューに追加
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              _pendingNodes.add(node);
            }
          }
        }

        // スタイル属性変更 → その要素を再チェック
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          // [A9] style変更時は処理済みマークを解除（色が変わった可能性）
          _processedElements.delete(mutation.target);
          _pendingNodes.add(mutation.target);
        }

        // クラス変更 → 背景色が変わった可能性
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          _processedElements.delete(mutation.target);
          _pendingNodes.add(mutation.target);
        }
      }

      // [A1] rAFでまとめて処理
      if (_pendingNodes.size > 0 && !_rafScheduled) {
        _rafScheduled = true;
        requestAnimationFrame(_flushPendingNodes);
      }

      // 大量の追加があった場合はフルスキャン
      if (_dirtyFlag && !_scanDebounce) {
        _scanDebounce = setTimeout(() => {
          _scanDebounce = null;
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
  // スマート定期スキャン
  // [A2] visibilityState + dirtyFlag + 動的インターバル
  // ========================================================

  function startPeriodicScan() {
    if (scanTimer) clearInterval(scanTimer);

    scanTimer = setInterval(() => {
      // タブが非表示ならスキップ
      if (document.visibilityState === 'hidden') return;
      if (!document.documentElement.classList.contains(GUARD_CLASS)) return;

      // dirtyフラグが立っている場合のみフルスキャン実行
      if (_dirtyFlag) {
        fullScan();
      }
    }, _scanInterval);
  }

  function stopPeriodicScan() {
    if (scanTimer) {
      clearInterval(scanTimer);
      scanTimer = null;
    }
  }

  // [A2] visibilitychange でスキャン間隔を動的調整
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      _scanInterval = SCAN_INTERVAL_ACTIVE;
      _dirtyFlag = true; // タブ復帰時は即スキャン
      if (isEnabled && document.documentElement.classList.contains(GUARD_CLASS)) {
        // タブ復帰時に即座にスキャン実行
        requestAnimationFrame(() => fullScan());
        // インターバルも再設定
        startPeriodicScan();
      }
    } else {
      _scanInterval = SCAN_INTERVAL_IDLE;
      if (scanTimer) {
        // 非表示時はインターバルを延長
        startPeriodicScan();
      }
    }
  });

  // ========================================================
  // 遅延再評価
  // [A7] 5→3回に削減 + 早期終了
  // ========================================================

  function clearReevalTimers() {
    reevalTimers.forEach(clearTimeout);
    reevalTimers = [];
  }

  function scheduleReevaluations() {
    clearReevalTimers();

    [300, 1000, 3000].forEach((delay) => {
      reevalTimers.push(setTimeout(() => {
        // 早期終了: 既にDarkBlueが適用済みなら残りをキャンセル
        if (document.documentElement.classList.contains(GUARD_CLASS) && isAlreadyDarkBlue()) {
          clearReevalTimers();
          return;
        }
        evaluateAndApply();
      }, delay));
    });
  }

  // ========================================================
  // ポップアップとの通信
  // [B10] リスナー重複防止ガード
  // ========================================================

  let _messageListenerRegistered = false;

  function registerMessageListener() {
    if (_messageListenerRegistered) return;
    _messageListenerRegistered = true;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'darkblue:toggle') {
        isEnabled = message.enabled;
        chrome.storage.sync.set({ [STORAGE_KEY]: isEnabled });

        // [B3関連] localStorageにも保存（次回ロード時のFOUC防止判定用）
        try { localStorage.setItem(STORAGE_KEY + '_local', String(isEnabled)); } catch (e) {}

        if (isEnabled) {
          // キャッシュクリアしてから評価
          _bodyBgCache = null;
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
  }

  /**
   * 拡張機能OFF時にインラインスタイルをクリーンアップ
   * [B4] ブラウザが正規化するRGB文字列にも対応
   */
  function cleanupInlineStyles() {
    const all = document.querySelectorAll('[style]');
    for (const el of all) {
      const style = el.getAttribute('style') || '';
      // Hex値チェック（元のロジック）
      const hasHex = style.includes(COLORS.BG_PRIMARY) ||
          style.includes(COLORS.BG_CARD) ||
          style.includes(COLORS.BG_HOVER) ||
          style.includes(COLORS.BORDER) ||
          style.includes(COLORS.TEXT_SUB);

      // [B4] RGB正規化値チェック（ブラウザがhexをrgb()に変換する場合の対応）
      let hasRgb = false;
      if (!hasHex) {
        for (const rgbVal of DB_RGB_VALUES) {
          if (style.includes(rgbVal)) {
            hasRgb = true;
            break;
          }
        }
      }

      if (hasHex || hasRgb) {
        el.style.removeProperty('background-color');
        el.style.removeProperty('border-top-color');
        el.style.removeProperty('border-bottom-color');
        el.style.removeProperty('border-left-color');
        el.style.removeProperty('border-right-color');
        el.style.removeProperty('color');
      }
    }
  }

  // ========================================================
  // 初期化
  // ========================================================

  function init() {
    // [改善] Observer を storage取得前に開始（テーマ切替の即時検出）
    startObserver();

    // メッセージリスナー登録（重複防止付き）
    registerMessageListener();

    chrome.storage.sync.get({ [STORAGE_KEY]: true }, (result) => {
      isEnabled = result[STORAGE_KEY];
      evaluateAndApply();
      scheduleReevaluations();
      if (isEnabled) {
        startPeriodicScan();
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[STORAGE_KEY]) {
        isEnabled = changes[STORAGE_KEY].newValue;
        if (isEnabled) {
          _bodyBgCache = null;
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
  //
  // [B3] 初回訪問(null)時は適用しない（=== 'true' に変更）
  // ========================================================

  try {
    // 前回DarkBlueが適用されていた場合のみ、即座にガードクラスを付与
    if (localStorage.getItem(LAST_STATE_KEY) === 'true') {
      document.documentElement.classList.add(GUARD_CLASS);
    }
  } catch (e) {
    // localStorage アクセス失敗時はフォールバックとして適用しない
    // （ライトテーマユーザーへのFOUCよりも安全側に倒す）
  }

  // [A15] ページアンロード時のクリーンアップ
  window.addEventListener('unload', () => {
    clearReevalTimers();
    stopPeriodicScan();
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
    if (_evalDebounce) { clearTimeout(_evalDebounce); _evalDebounce = null; }
    if (_scanDebounce) { clearTimeout(_scanDebounce); _scanDebounce = null; }
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
