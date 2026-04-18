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
 */

(function () {
  'use strict';

  // 二重ラップ防止: 拡張リロード等で本ファイルが再注入されても多重ラップしない。
  // IIFE スコープのフラグだけでは不十分 (新 IIFE スコープでは false に戻る) なので、
  // `window` （= MAIN world グローバル）に印を残して判定する。
  if (window.__dbtx_intercept_installed__) return;
  window.__dbtx_intercept_installed__ = true;

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
})();
