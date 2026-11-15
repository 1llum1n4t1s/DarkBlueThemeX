'use strict';

// <html lang> を同期で合わせる（Kagayoi フッターは module で遅延実行され、実行前にこの lang を読む）
Localizer.applyDocumentLang();

/** 表示文言を選択中の言語で取得する（fallback は英語。キー欠落時にだけ見える） */
const t = (key, fallback) => Localizer.t(key, undefined, fallback);

// 注意: 以下の2リテラル (STORAGE_KEY / MSG_GET_STATE) は src/content.js の同名定数と完全同期。
// Chrome 拡張のコンテキスト分離で共有モジュール不可。変更時は両ファイル同時更新必須。
// CI: scripts/check-shared-literals.js が値の一致を機械検証する (行番号併記は行ズレで腐るため廃止)。
const STORAGE_KEY = 'darkblue_enabled'; // content.js の同名定数と一致
const MSG_GET_STATE = 'darkblue:getState'; // content.js の同名定数と一致
const SUPPORT_ORIGIN = 'https://support.kagayoi.com/*';
const SUPPORT_PRODUCT_ID = 'darkblue-theme-x';

// DOM要素キャッシュ
let _toggleSwitch = null;
let _toggleLabel = null;
let _statusDot = null;
let _statusMsg = null;
let _debugLine = null;
let _supportButton = null;
let _supportPermissionStatus = null;
let _supportPopup = null;
let _supportRequestPending = false;

function cacheElements() {
  _toggleSwitch = document.getElementById('toggleSwitch');
  _toggleLabel = document.getElementById('toggleLabel');
  _statusDot = document.getElementById('statusDot');
  _statusMsg = document.getElementById('statusMessage');
  _debugLine = document.getElementById('debugLine');
  _supportButton = document.getElementById('supportButton');
  _supportPermissionStatus = document.getElementById('supportPermissionStatus');

  // manifest.json からバージョンを動的に取得（ハードコード防止）
  const ver = document.getElementById('versionLabel');
  if (ver) ver.textContent = 'v' + chrome.runtime.getManifest().version;
}

/* --------------------------------------------------
   初期化
   -------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  // 保存済みの言語を読み込んでから静的文言を置換し、言語セレクトを組み立てる
  await Localizer.ready;
  await Localizer.ensureFresh(); // 拡張更新後に保存済み辞書を作り直す
  Localizer.localizeDocument();
  Localizer.mountLanguageSelect(document.getElementById('uiLanguage'));

  cacheElements();
  loadSupportFooter();
  initializeSupport().catch(() => {
    setSupportPermissionStatus(t('supportLoadFailed', 'Could not load the contact feature.'));
  });

  let result;
  try {
    result = await chrome.storage.sync.get({ [STORAGE_KEY]: true });
  } catch {
    _toggleLabel.textContent = t('toggleUnknown', 'Unknown');
    setStatus('inactive', t('statusSettingsLoadFailed', 'Could not load settings'));
    return;
  }
  applyToggleUI(result[STORAGE_KEY]);

  _toggleSwitch.addEventListener('change', onToggleChange);
  _toggleSwitch.disabled = false;
  await queryTabState();
});

/* --------------------------------------------------
   お問い合わせ
   -------------------------------------------------- */

/**
 * 共通フッターを読み込む。フッターは生成時に chrome.i18n.getMessage で文言（評価の案内など）を決めるため、
 * Localizer が getMessage を差し替える前（storage 読み込み前）に生成されると、ブラウザ言語の文言で固定されてしまう。
 * Localizer.ready の後に読み込むことで、選択した表示言語の文言にそろえる。
 */
async function loadSupportFooter() {
  try {
    await import('../shared/kagayoi-support-footer.js');
  } catch {
    // フッターが読み込めなくてもテーマ機能と問い合わせボタンには影響しない
  }
}

/** 共通フォームを、manifest の製品情報を付けて初期化する */
async function initializeSupport() {
  await customElements.whenDefined('kagayoi-contact-popup');

  const manifest = chrome.runtime.getManifest();
  _supportPopup = document.createElement('kagayoi-contact-popup');
  _supportPopup.setAttribute('hide-trigger', '');
  _supportPopup.setAttribute('product-id', SUPPORT_PRODUCT_ID);
  _supportPopup.setAttribute('product-name', manifest.name);
  _supportPopup.setAttribute('app-version', manifest.version);
  document.querySelector('.support-footer')?.append(_supportPopup);

  _supportButton.addEventListener('click', onSupportClick);
  _supportButton.disabled = false;
}

/** Chrome の任意ホスト権限、または Firefox の任意データ収集権限を要求する */
async function requestSupportPermission() {
  const manifest = chrome.runtime.getManifest();
  const optionalData = manifest.browser_specific_settings?.gecko?.data_collection_permissions?.optional;
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const request = {};

  if (Array.isArray(optionalData) && optionalData.length > 0) {
    request.data_collection = optionalData;
  }
  if (manifest.optional_host_permissions?.includes(SUPPORT_ORIGIN)) {
    request.origins = [SUPPORT_ORIGIN];
  }
  return Object.keys(request).length === 0 || api.permissions.request(request);
}

async function onSupportClick() {
  if (_supportRequestPending || !_supportPopup) return;

  _supportRequestPending = true;
  _supportButton.disabled = true;
  setSupportPermissionStatus(t('supportPermissionChecking', 'Checking the permissions needed to contact support…'));

  try {
    if (!await requestSupportPermission()) {
      setSupportPermissionStatus(t('supportPermissionDenied', 'To open the contact form, please allow the permission that is shown.'));
      return;
    }
    setSupportPermissionStatus(null);
    _supportPopup.open();
  } catch {
    setSupportPermissionStatus(t('supportPermissionFailed', 'Could not check the permission. Please try again.'));
  } finally {
    _supportRequestPending = false;
    _supportButton.disabled = false;
  }
}

function setSupportPermissionStatus(message) {
  if (!_supportPermissionStatus) return;
  _supportPermissionStatus.textContent = message || '';
  _supportPermissionStatus.hidden = !message;
}

/* --------------------------------------------------
   トグル処理
   -------------------------------------------------- */
function applyToggleUI(enabled) {
  _toggleSwitch.checked = enabled;
  _toggleLabel.textContent = enabled ? t('toggleOn', 'Enabled') : t('toggleOff', 'Disabled');
}

async function onToggleChange() {
  const enabled = _toggleSwitch.checked;
  // storage.sync.set → content.js の storage.onChanged が全タブで反応する。
  // sendMessage('darkblue:toggle') は二重発火の原因になるため廃止済み。
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: enabled });
  } catch {
    // storage 障害 (quota 超過・コンテキスト失効等) → UI を実状態に戻し、失敗を伝える
    applyToggleUI(!enabled);
    setStatus('inactive', t('statusSettingsSaveFailed', 'Could not save settings'));
    return;
  }
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

async function queryTabState() {
  const tab = await getActiveTab();
  if (!tab || !isXTab(tab)) {
    setStatus('inactive', t('statusOpenXPage', 'Open an X page'));
    setDebug(null);
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: MSG_GET_STATE });
    if (!response) {
      setStatus('inactive', t('statusOpenXPage', 'Open an X page'));
      setDebug(null);
      return;
    }
    handleStateResponse(response);
  } catch {
    setStatus('inactive', t('statusOpenXPage', 'Open an X page'));
    setDebug(null);
  }
}

function handleStateResponse(response) {
  const { isBlackTheme, isDarkBlueApplied, isOfficialDim, enabled, theme, hasGuard } = response;

  if (isDarkBlueApplied) {
    setStatus('active', t('statusActive', 'DarkBlue theme applied'));
  } else if (isOfficialDim) {
    setStatus('info', t('statusOfficialDim', "Using X's official Dim theme"));
  } else if (isBlackTheme && !enabled) {
    setStatus('info', t('statusBlackDisabled', 'Black theme detected (disabled)'));
  } else if (isBlackTheme && enabled) {
    setStatus('info', t('statusBlackApplying', 'Applying DarkBlue theme…'));
  } else {
    setStatus('info', t('statusNotDark', 'Not a dark theme'));
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
