'use strict';

// 注意: 以下の2リテラルは content.js:28 / content.js:30 と完全同期。
// Chrome 拡張のコンテキスト分離で共有モジュール不可。変更時は両ファイル同時更新必須。
const STORAGE_KEY = 'darkblue_enabled'; // 対応箇所: src/content.js:28
const MSG_GET_STATE = 'darkblue:getState'; // 対応箇所: src/content.js:31

// DOM要素キャッシュ
let _toggleSwitch = null;
let _toggleLabel = null;
let _statusDot = null;
let _statusMsg = null;
let _debugLine = null;

function cacheElements() {
  _toggleSwitch = document.getElementById('toggleSwitch');
  _toggleLabel = document.getElementById('toggleLabel');
  _statusDot = document.getElementById('statusDot');
  _statusMsg = document.getElementById('statusMessage');
  _debugLine = document.getElementById('debugLine');

  // manifest.json からバージョンを動的に取得（ハードコード防止）
  const ver = document.getElementById('versionLabel');
  if (ver) ver.textContent = 'v' + chrome.runtime.getManifest().version;
}

/* --------------------------------------------------
   初期化
   -------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  cacheElements();

  const result = await chrome.storage.sync.get({ [STORAGE_KEY]: true });
  applyToggleUI(result[STORAGE_KEY]);

  _toggleSwitch.addEventListener('change', onToggleChange);
  await queryTabState();
});

/* --------------------------------------------------
   トグル処理
   -------------------------------------------------- */
function applyToggleUI(enabled) {
  _toggleSwitch.checked = enabled;
  _toggleLabel.textContent = enabled ? '有効' : '無効';
}

async function onToggleChange() {
  const enabled = _toggleSwitch.checked;
  // storage.sync.set → content.js の storage.onChanged が全タブで反応する。
  // sendMessage('darkblue:toggle') は二重発火の原因になるため廃止済み。
  await chrome.storage.sync.set({ [STORAGE_KEY]: enabled });
  applyToggleUI(enabled);
  // 状態取得は少し遅延させ、content.js の再評価が完了してから問い合わせる
  setTimeout(() => { queryTabState().catch(() => {}); }, 50);
}

/* --------------------------------------------------
   ステータス表示
   -------------------------------------------------- */

/** タブが X のドメインかどうか判定 */
function isXTab(tab) {
  try {
    const host = new URL(tab?.url || '').hostname.replace(/^www\./, '');
    return host === 'x.com' || host === 'twitter.com';
  } catch {
    return false;
  }
}

async function queryTabState(existingTab) {
  const tab = existingTab ?? await getActiveTab();
  if (!tab || !isXTab(tab)) {
    setStatus('inactive', 'X のページを開いてください');
    setDebug(null);
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: MSG_GET_STATE });
    if (!response) {
      setStatus('inactive', 'X のページを開いてください');
      setDebug(null);
      return;
    }
    handleStateResponse(response);
  } catch {
    setStatus('inactive', 'X のページを開いてください');
    setDebug(null);
  }
}

function handleStateResponse(response) {
  const { isBlackTheme, isDarkBlueApplied, enabled, theme, hasGuard } = response;

  if (isDarkBlueApplied) {
    setStatus('active', 'DarkBlue テーマ適用中');
  } else if (isBlackTheme && !enabled) {
    setStatus('info', '黒テーマを検出（無効中）');
  } else if (isBlackTheme && enabled) {
    setStatus('info', 'DarkBlue テーマを適用中...');
  } else {
    setStatus('info', 'ダークテーマではありません');
  }

  // 診断用: ユーザーがバグ報告しやすいよう data-theme と GUARD_CLASS 有無を表示
  setDebug(`data-theme: ${theme ?? '(none)'} / guard: ${hasGuard ? 'on' : 'off'}`);
}

/* --------------------------------------------------
   ヘルパー
   -------------------------------------------------- */
function setStatus(type, message) {
  _statusDot.classList.remove('active', 'info', 'inactive');
  _statusDot.classList.add(type);
  _statusMsg.textContent = message;
}

function setDebug(text) {
  if (!_debugLine) return;
  if (text) {
    _debugLine.textContent = text;
    _debugLine.hidden = false;
  } else {
    _debugLine.textContent = '';
    _debugLine.hidden = true;
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] ?? null;
}
