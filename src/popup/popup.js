'use strict';

const STORAGE_KEY = 'darkblue_enabled';

// DOM要素キャッシュ
let _toggleSwitch = null;
let _toggleLabel = null;
let _statusDot = null;
let _statusMsg = null;

function cacheElements() {
  _toggleSwitch = document.getElementById('toggleSwitch');
  _toggleLabel = document.getElementById('toggleLabel');
  _statusDot = document.getElementById('statusDot');
  _statusMsg = document.getElementById('statusMessage');

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
  await chrome.storage.sync.set({ [STORAGE_KEY]: enabled });
  applyToggleUI(enabled);

  const tab = await getActiveTab();
  if (!tab) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'darkblue:toggle', enabled });
  } catch {
    // コンテンツスクリプト未ロード時は無視
  }
  await queryTabState(tab);
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
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'darkblue:getState' });
    if (!response) {
      setStatus('inactive', 'X のページを開いてください');
      return;
    }
    handleStateResponse(response);
  } catch {
    setStatus('inactive', 'X のページを開いてください');
  }
}

function handleStateResponse(response) {
  const { isBlackTheme, isDarkBlueApplied, enabled } = response;

  if (isDarkBlueApplied) {
    setStatus('active', 'DarkBlue テーマ適用中');
  } else if (isBlackTheme && !enabled) {
    setStatus('info', '黒テーマを検出（無効中）');
  } else if (isBlackTheme && enabled) {
    setStatus('info', 'DarkBlue テーマを適用中...');
  } else {
    setStatus('info', 'ダークテーマではありません');
  }
}

/* --------------------------------------------------
   ヘルパー
   -------------------------------------------------- */
function setStatus(type, message) {
  _statusDot.classList.remove('active', 'info', 'inactive');
  _statusDot.classList.add(type);
  _statusMsg.textContent = message;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] ?? null;
}
