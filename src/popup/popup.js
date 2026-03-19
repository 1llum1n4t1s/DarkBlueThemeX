'use strict';

const STORAGE_KEY = 'darkblue_enabled';

// [A11] DOM要素キャッシュ（関数getterからconst変数に変更）
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
   Initialise popup
   -------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // DOM要素をキャッシュ
  cacheElements();

  // Load saved toggle state (default: enabled)
  chrome.storage.sync.get({ [STORAGE_KEY]: true }, (result) => {
    const enabled = result[STORAGE_KEY];
    applyToggleUI(enabled);
  });

  // Listen for toggle changes
  _toggleSwitch.addEventListener('change', onToggleChange);

  // Query the active tab for current state
  queryTabState();
});

/* --------------------------------------------------
   Toggle handling
   -------------------------------------------------- */
function applyToggleUI(enabled) {
  _toggleSwitch.checked = enabled;
  _toggleLabel.textContent = enabled ? '有効' : '無効';
}

function onToggleChange() {
  const enabled = _toggleSwitch.checked;

  // Persist
  chrome.storage.sync.set({ [STORAGE_KEY]: enabled });

  // Update label (applyToggleUI と統合)
  applyToggleUI(enabled);

  // Notify the active tab
  getActiveTab((tab) => {
    if (!tab) return;
    chrome.tabs.sendMessage(
      tab.id,
      { type: 'darkblue:toggle', enabled },
      () => {
        // Ignore errors when content script is not loaded
        void chrome.runtime.lastError;
        // Refresh status after toggling
        queryTabState();
      }
    );
  });
}

/* --------------------------------------------------
   Status query
   -------------------------------------------------- */
function queryTabState() {
  getActiveTab((tab) => {
    if (!tab) {
      setStatus('inactive', 'X のページを開いてください');
      return;
    }

    // Check if the tab is on X (twitter.com or x.com)
    try {
      const url = new URL(tab.url || '');
      const host = url.hostname.replace(/^www\./, '');
      if (host !== 'x.com' && host !== 'twitter.com') {
        setStatus('inactive', 'X のページを開いてください');
        return;
      }
    } catch {
      setStatus('inactive', 'X のページを開いてください');
      return;
    }

    // Ask the content script for its state
    chrome.tabs.sendMessage(
      tab.id,
      { type: 'darkblue:getState' },
      (response) => {
        if (chrome.runtime.lastError || !response) {
          // Content script not loaded / not responding
          setStatus('inactive', 'X のページを開いてください');
          return;
        }
        handleStateResponse(response);
      }
    );
  });
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
   Helpers
   -------------------------------------------------- */
function setStatus(type, message) {
  // Reset classes
  _statusDot.classList.remove('active', 'info', 'inactive');
  _statusDot.classList.add(type);

  _statusMsg.textContent = message;
}

function getActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    callback(tabs && tabs.length > 0 ? tabs[0] : null);
  });
}
