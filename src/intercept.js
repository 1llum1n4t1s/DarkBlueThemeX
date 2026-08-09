/**
 * DarkBlueThemeX - setAttribute Intercept (MAIN world)
 *
 * X の main.js が `data-theme="dark"` を同期的に再設定するのを、さらに同期的に `"dim"` に変換する。
 * MutationObserver は非同期（マイクロタスク）のため、同期的な intercept なしでは黒テーマが
 * 一瞬だけ描画されるウィンドウが発生する。
 *
 * 重要: content.js は isolated world で動くため、そこで `Element.prototype.setAttribute` を
 * 置換しても MAIN world (X の main.js) の prototype チェーンは共有されず、効果がない。
 * このファイルは `world: "MAIN"` で注入される必要があり、manifest.json で別 content_script として
 * 登録されている。
 *
 * ON/OFF 制御は content.js (isolated world) から `<html>` の `data-dbtx-intercept` 属性経由で行う。
 * isolated / MAIN は DOM 実体を共有するため、属性値の読み取りは両世界で一致する。
 *
 * 同じ「世界の壁」の理由で、X のルーターが呼ぶ history.pushState/replaceState も MAIN world で
 * しか捕捉できない。本ファイルは SPA ナビゲーションを検知して DOM イベントで isolated world へ
 * 中継する役割も持つ (詳細は末尾の SPA ナビゲーション通知セクション)。
 */

(function () {
  'use strict';

  // 二重ラップ防止: 拡張リロード等で本ファイルが再注入されても多重ラップしない。
  // IIFE スコープのフラグだけでは不十分 (新 IIFE スコープでは false に戻る) なので、
  // `window` （= MAIN world グローバル）に印を残して判定する。
  if (window.__dbtx_intercept_installed__) return;
  window.__dbtx_intercept_installed__ = true;

  // ---- SPA ナビゲーション通知イベント名（content.js の同名定数と同期。変更時は両ファイル同時更新必須。
  //      CI: scripts/check-shared-literals.js が値の一致を機械検証する）----
  const LOCATION_CHANGE_EVENT = 'dbtx:locationchange';

  const origSetAttribute = Element.prototype.setAttribute;
  const origRemoveAttribute = Element.prototype.removeAttribute;

  function isActive() {
    // docEl を毎回参照（document.documentElement は書き換え不可の getter）
    const attr = document.documentElement && document.documentElement.getAttribute('data-dbtx-intercept');
    return attr === 'on';
  }

  Element.prototype.setAttribute = function (name, value) {
    if (
      this === document.documentElement &&
      name === 'data-theme' &&
      value === 'dark' &&
      isActive()
    ) {
      return origSetAttribute.call(this, name, 'dim');
    }
    return origSetAttribute.call(this, name, value);
  };

  Element.prototype.removeAttribute = function (name) {
    if (
      this === document.documentElement &&
      name === 'data-theme' &&
      isActive()
    ) {
      // 削除ではなく "dim" に再設定 (silently 無視だと X や他拡張の前提を破壊するため)
      return origSetAttribute.call(this, 'data-theme', 'dim');
    }
    return origRemoveAttribute.call(this, name);
  };

  // ========================================================
  // SPA ナビゲーション通知 (MAIN world → isolated world)
  // ========================================================
  //
  // content.js 側で history.pushState を包んでも、X のルーターが呼ぶのは MAIN world の history
  // なので捕捉できない (setAttribute と同じ世界の壁)。isolated world が包めるのは自分の世界の
  // wrapper だけで、そこを X が通ることはない。
  // popstate は戻る/進むでしか発火せず、pushState 由来のクライアント遷移では発火しないため、
  // フックが効かないと「ホーム → 通知」の遷移で data-dbtx-page が更新されず、通知ページ専用の
  // CSS (cellInnerDiv / article の透明化) が当たらないままになる。
  //
  // ここで MAIN world の history を包み、DOM イベントとして isolated world へ中継する。
  // DOM は両世界で共有されるためイベントは境界を越える。detail は渡さない
  // (世界を跨ぐオブジェクトは構造化複製の制約を受けるため、URL は受信側が location から読む)。
  //
  // intercept の ON/OFF (data-dbtx-intercept) では分岐しない。ページフラグの要否判定は
  // content.js の updatePageFlags が GUARD_CLASS を見て行うため、通知自体は常に送る。
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;

  function notifyLocationChange() {
    window.dispatchEvent(new CustomEvent(LOCATION_CHANGE_EVENT));
  }

  history.pushState = function (...args) {
    const result = origPushState.apply(this, args);
    notifyLocationChange();
    return result;
  };

  history.replaceState = function (...args) {
    const result = origReplaceState.apply(this, args);
    notifyLocationChange();
    return result;
  };
})();
