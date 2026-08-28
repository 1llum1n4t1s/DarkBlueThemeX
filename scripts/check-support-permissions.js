'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const supportOrigin = 'https://support.kagayoi.com/*';
const optionalData = [
  'personallyIdentifyingInfo',
  'authenticationInfo',
  'personalCommunications',
  'technicalAndInteraction',
];
const popupSource = fs.readFileSync(path.join(root, 'src/popup/popup.js'), 'utf8');
const chromeManifest = readJson('manifest.json');
const firefoxManifest = readJson('manifest.firefox.json');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function verifyManifestContracts() {
  assert(!chromeManifest.host_permissions.includes(supportOrigin), 'Chrome の必須ホスト権限に Support API を含めないこと');
  assert(chromeManifest.optional_host_permissions.includes(supportOrigin), 'Chrome の任意ホスト権限に Support API を含めること');
  assert(!firefoxManifest.host_permissions.includes(supportOrigin), 'Firefox の必須ホスト権限に Support API を含めないこと');
  assert(firefoxManifest.optional_host_permissions.includes(supportOrigin), 'Firefox の任意ホスト権限に Support API を含めること');
  assert.deepEqual(
    firefoxManifest.browser_specific_settings.gecko.data_collection_permissions,
    { required: ['none'], optional: optionalData },
    'Firefox の問い合わせデータは任意同意として宣言すること',
  );
}

function fakeElement() {
  const listeners = new Map();
  const attributes = new Map();
  const classes = new Set();
  return {
    listeners,
    attributes,
    classes,
    checked: false,
    disabled: false,
    hidden: false,
    textContent: '',
    classList: {
      add(...names) { for (const name of names) classes.add(name); },
      remove(...names) { for (const name of names) classes.delete(name); },
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    setAttribute(name, value) { attributes.set(name, String(value)); },
  };
}

async function runPopupScenario({ manifest, exposeBrowser = false, granted, tabResponse = null, clickSupport = true }) {
  const ids = new Map([
    ['toggleSwitch', fakeElement()],
    ['toggleLabel', fakeElement()],
    ['statusDot', fakeElement()],
    ['statusMessage', fakeElement()],
    ['debugLine', fakeElement()],
    ['versionLabel', fakeElement()],
    ['supportButton', fakeElement()],
    ['supportPermissionStatus', fakeElement()],
  ]);
  const pageListeners = new Map();
  const permissionRequests = [];
  let supportPopup = null;
  let popupOpened = false;

  const api = {
    runtime: { getManifest: () => manifest },
    storage: {
      sync: {
        get: async (defaults) => defaults,
        set: async () => undefined,
      },
    },
    tabs: {
      query: async () => tabResponse ? [{ id: 1, url: 'https://x.com/home' }] : [],
      sendMessage: async () => tabResponse,
    },
    permissions: {
      request: async (request) => {
        permissionRequests.push(JSON.parse(JSON.stringify(request)));
        return granted;
      },
    },
  };

  const document = {
    addEventListener(type, listener) { pageListeners.set(type, listener); },
    getElementById(id) { return ids.get(id) ?? null; },
    querySelector(selector) {
      if (selector !== '.support-footer') return null;
      return { append(element) { supportPopup = element; } };
    },
    createElement(name) {
      assert.equal(name, 'kagayoi-contact-popup');
      const element = fakeElement();
      element.open = () => { popupOpened = true; };
      return element;
    },
  };

  const context = {
    chrome: api,
    console,
    customElements: { whenDefined: async () => undefined },
    document,
    setTimeout,
    URL,
  };
  if (exposeBrowser) context.browser = api;

  vm.runInNewContext(popupSource, context, { filename: 'src/popup/popup.js' });
  await pageListeners.get('DOMContentLoaded')();
  await new Promise((resolve) => setImmediate(resolve));

  const supportButton = ids.get('supportButton');
  assert.equal(typeof supportButton.listeners.get('click'), 'function', '問い合わせボタンを初期化すること');
  assert(supportPopup, '共通問い合わせフォームを生成すること');
  if (clickSupport) await supportButton.listeners.get('click')();

  return {
    permissionRequests,
    popupOpened,
    permissionStatus: ids.get('supportPermissionStatus'),
    statusMessage: ids.get('statusMessage').textContent,
    statusClasses: ids.get('statusDot').classes,
  };
}

async function main() {
  verifyManifestContracts();

  const chromeGranted = await runPopupScenario({ manifest: chromeManifest, granted: true });
  assert.deepEqual(chromeGranted.permissionRequests, [{ origins: [supportOrigin] }]);
  assert.equal(chromeGranted.popupOpened, true, 'Chrome はホスト権限の許可後にフォームを開くこと');

  const firefoxGranted = await runPopupScenario({ manifest: firefoxManifest, exposeBrowser: true, granted: true });
  assert.deepEqual(firefoxGranted.permissionRequests, [{ data_collection: optionalData, origins: [supportOrigin] }]);
  assert.equal(firefoxGranted.popupOpened, true, 'Firefox はホスト権限とデータ収集同意後にフォームを開くこと');

  const chromeDenied = await runPopupScenario({ manifest: chromeManifest, granted: false });
  assert.equal(chromeDenied.popupOpened, false, '権限拒否時はフォームを開かないこと');
  assert.equal(chromeDenied.permissionStatus.hidden, false, '権限拒否時は案内を表示すること');

  const officialDim = await runPopupScenario({
    manifest: chromeManifest,
    granted: false,
    clickSupport: false,
    tabResponse: {
      enabled: false,
      isBlackTheme: false,
      isDarkBlueApplied: false,
      isOfficialDim: true,
      theme: 'dim',
      hasGuard: false,
    },
  });
  assert.equal(officialDim.statusMessage, 'X 公式の Dim テーマを使用中');
  assert(officialDim.statusClasses.has('info'), 'X 公式 Dim は情報状態として表示すること');

  console.log('✅ popup 契約一致 (Chrome optional host / Firefox optional data / X 公式 Dim 表示)');
}

main().catch((error) => {
  console.error(`❌ お問い合わせ権限契約エラー: ${error.message}`);
  process.exitCode = 1;
});
