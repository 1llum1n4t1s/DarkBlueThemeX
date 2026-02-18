'use strict';

const STORAGE_KEY = 'darkblue_enabled';

const toggleSwitch = () => document.getElementById('toggleSwitch');
const toggleLabel  = () => document.getElementById('toggleLabel');
const statusDot    = () => document.getElementById('statusDot');
const statusMsg    = () => document.getElementById('statusMessage');

/* --------------------------------------------------
   Initialise popup
   -------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // Load saved toggle state (default: enabled)
  chrome.storage.sync.get({ [STORAGE_KEY]: true }, (result) => {
    const enabled = result[STORAGE_KEY];
    applyToggleUI(enabled);
  });

  // Listen for toggle changes
  toggleSwitch().addEventListener('change', onToggleChange);

  // Query the active tab for current state
  queryTabState();
});

/* --------------------------------------------------
   Toggle handling
   -------------------------------------------------- */
function applyToggleUI(enabled) {
  toggleSwitch().checked = enabled;
  toggleLabel().textContent = enabled ? '有効' : '無効';
}

function onToggleChange() {
  const enabled = toggleSwitch().checked;

  // Persist
  chrome.storage.sync.set({ [STORAGE_KEY]: enabled });

  // Update label
  toggleLabel().textContent = enabled ? '有効' : '無効';

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
    // Theme is actively applied
    setStatus('active', 'DarkBlue テーマ適用中');
  } else if (isBlackTheme && !enabled) {
    // Black dark theme detected but extension is disabled
    setStatus('info', '黒テーマを検出（無効中）');
  } else if (!isBlackTheme) {
    // Page is not using a dark theme at all
    setStatus('info', 'ダークテーマではありません');
  } else {
    setStatus('inactive', '状態を確認中...');
  }
}

/* --------------------------------------------------
   Helpers
   -------------------------------------------------- */
function setStatus(type, message) {
  const dot = statusDot();
  const msg = statusMsg();

  // Reset classes
  dot.classList.remove('active', 'info', 'inactive');
  dot.classList.add(type);

  msg.textContent = message;
}

function getActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    callback(tabs && tabs.length > 0 ? tabs[0] : null);
  });
}
