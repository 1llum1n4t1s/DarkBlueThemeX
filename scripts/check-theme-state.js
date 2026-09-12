/**
 * MAIN world と isolated world 間の dim 変換元、および非同期 storage 状態の順序を検証する。
 *
 * 両 world で Element.prototype は分離しつつ DOM 状態とイベントだけを共有する fake DOM を構築し、
 * 実際の src/intercept.js / src/content.js を VM 上でそのまま実行する。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const interceptSource = fs.readFileSync(path.join(root, 'src/intercept.js'), 'utf8');
const contentSource = fs.readFileSync(path.join(root, 'src/content.js'), 'utf8');

function createHarness({ lastState = null, initialTheme = null } = {}) {
  const htmlState = { attributes: new Map(), classes: new Set(), style: { colorScheme: '' } };
  const bodyState = { attributes: new Map(), classes: new Set(), style: { colorScheme: '' } };
  if (initialTheme !== null) htmlState.attributes.set('data-theme', initialTheme);

  class FakeClassList {
    constructor(state) { this.values = state.classes; }
    add(...names) { for (const name of names) this.values.add(name); }
    remove(...names) { for (const name of names) this.values.delete(name); }
    contains(name) { return this.values.has(name); }
  }

  function createElementClass() {
    return class FakeElement {
      constructor(state) {
        this.state = state;
        this.classList = new FakeClassList(state);
        this.style = state.style;
        this.dataset = new Proxy({}, {
          get: (_target, key) => this.getAttribute(`data-${String(key)}`) ?? undefined,
          set: (_target, key, value) => {
            this.setAttribute(`data-${String(key)}`, String(value));
            return true;
          },
        });
      }

      setAttribute(name, value) { this.state.attributes.set(name, String(value)); }
      getAttribute(name) { return this.state.attributes.get(name) ?? null; }
      hasAttribute(name) { return this.state.attributes.has(name); }
      removeAttribute(name) { this.state.attributes.delete(name); }
    };
  }

  const MainElement = createElementClass();
  const IsolatedElement = createElementClass();
  const mainDocumentElement = new MainElement(htmlState);
  const isolatedDocumentElement = new IsolatedElement(htmlState);
  const isolatedBody = new IsolatedElement(bodyState);

  const eventListeners = new Map();
  function createWindow() {
    return {
      addEventListener(type, listener) {
        if (!eventListeners.has(type)) eventListeners.set(type, []);
        eventListeners.get(type).push(listener);
      },
      dispatchEvent(event) {
        for (const listener of eventListeners.get(event.type) ?? []) listener(event);
        return true;
      },
    };
  }

  const mainWindow = createWindow();
  const isolatedWindow = createWindow();
  const mainDocument = { documentElement: mainDocumentElement };
  const documentListeners = new Map();
  const isolatedDocument = {
    documentElement: isolatedDocumentElement,
    body: isolatedBody,
    visibilityState: 'hidden',
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    querySelectorAll() { return []; },
    contains() { return true; },
  };

  const storageGetCallbacks = [];
  let storageChangeListener = null;
  let runtimeMessageListener = null;
  const chrome = {
    runtime: {
      id: 'darkbluethemex-test',
      lastError: null,
      onMessage: { addListener(listener) { runtimeMessageListener = listener; } },
    },
    storage: {
      sync: {
        get(_defaults, callback) { storageGetCallbacks.push(callback); },
      },
      onChanged: {
        addListener(listener) { storageChangeListener = listener; },
      },
    },
  };

  const storage = new Map();
  if (lastState !== null) storage.set('darkbluethemex_was_active', lastState);
  const localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
  };

  const mutationObservers = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.observations = [];
      mutationObservers.push(this);
    }
    observe(target, options) { this.observations.push({ target, options }); }
    disconnect() { this.observations = []; }
  }

  function flushAttributeMutation(target, attributeName) {
    for (const observer of mutationObservers) {
      const observesAttribute = observer.observations.some(({ target: observedTarget, options }) => (
        observedTarget === target
        && options.attributes
        && (!options.attributeFilter || options.attributeFilter.includes(attributeName))
      ));
      if (observesAttribute) observer.callback([{ target, attributeName }]);
    }
  }

  class FakeCustomEvent {
    constructor(type) { this.type = type; }
  }

  const location = { href: 'https://x.com/home', pathname: '/home' };
  const mainHistory = {
    pushState() {},
    replaceState() {},
  };
  vm.runInContext(interceptSource, vm.createContext({
    window: mainWindow,
    document: mainDocument,
    Element: MainElement,
    CustomEvent: FakeCustomEvent,
    history: mainHistory,
    console,
  }), { filename: 'src/intercept.js' });

  vm.runInContext(contentSource, vm.createContext({
    window: isolatedWindow,
    document: isolatedDocument,
    Element: IsolatedElement,
    MutationObserver: FakeMutationObserver,
    CustomEvent: FakeCustomEvent,
    chrome,
    localStorage,
    location,
    history: { pushState() {}, replaceState() {} },
    console,
    setTimeout() { return 1; },
    clearTimeout() {},
  }), { filename: 'src/content.js' });

  assert.equal(storageGetCallbacks.length, 1, 'storage.sync.get の callback が登録されること');
  assert.equal(typeof storageChangeListener, 'function', 'storage.onChanged の listener が登録されること');
  assert.equal(typeof runtimeMessageListener, 'function', 'runtime.onMessage の listener が登録されること');

  return {
    get theme() { return htmlState.attributes.get('data-theme') ?? null; },
    get intercept() { return htmlState.attributes.get('data-dbtx-intercept') ?? null; },
    get hasGuard() { return htmlState.classes.has('darkbluethemex-active'); },
    get lastState() { return storage.get('darkbluethemex_was_active') ?? null; },
    xSetTheme(theme) { mainDocumentElement.setAttribute('data-theme', theme); },
    xRemoveTheme() { mainDocumentElement.removeAttribute('data-theme'); },
    xSetColorScheme(scheme) {
      htmlState.style.colorScheme = scheme;
      flushAttributeMutation(isolatedDocumentElement, 'style');
    },
    flushHtmlMutation(attributeName = 'data-theme') {
      flushAttributeMutation(isolatedDocumentElement, attributeName);
    },
    pageHide() { isolatedWindow.dispatchEvent({ type: 'pagehide' }); },
    pageShowPersisted() { isolatedWindow.dispatchEvent({ type: 'pageshow', persisted: true }); },
    resolveStorage(enabled, requestIndex = 0) {
      const [callback] = storageGetCallbacks.splice(requestIndex, 1);
      assert.equal(typeof callback, 'function', '指定した storage.sync.get の callback が存在すること');
      callback({ darkblue_enabled: enabled });
    },
    setEnabled(enabled) {
      storageChangeListener({ darkblue_enabled: { newValue: enabled } }, 'sync');
    },
    getState() {
      let response = null;
      const handled = runtimeMessageListener(
        { type: 'darkblue:getState' },
        { id: chrome.runtime.id },
        (value) => { response = value; },
      );
      assert.equal(handled, false, '状態問い合わせは同期応答すること');
      return response;
    },
  };
}

{
  const harness = createHarness({ lastState: 'false' });
  harness.xSetTheme('dark');
  harness.flushHtmlMutation();
  assert.equal(harness.theme, 'dark', 'storage 解決前の dark 変化では暫定 true を適用しないこと');
  assert.equal(harness.lastState, 'false', 'storage 解決前に楽観フラグを true へ書き換えないこと');
  harness.resolveStorage(false);
  assert.equal(harness.theme, 'dark', 'storage が OFF と確定した後も dark のまま維持すること');
}

{
  const harness = createHarness({ initialTheme: 'dark' });
  harness.setEnabled(false);
  harness.resolveStorage(true);
  assert.equal(harness.theme, 'dark', '初期 get より先に確定した OFF を古い get 結果で巻き戻さないこと');
  assert.equal(harness.getState().enabled, false, '初期 get 後着時も確定済みの OFF を返すこと');
}

{
  const harness = createHarness({ initialTheme: 'dark' });
  harness.setEnabled(true);
  harness.resolveStorage(false);
  assert.equal(harness.theme, 'dim', '暫定値と同じ ON 通知も初期 get より優先して適用すること');
  assert.equal(harness.getState().enabled, true, '初期 get 後着時も確定済みの ON を返すこと');
}

{
  const harness = createHarness({ lastState: 'true' });
  harness.xSetTheme('dark');
  harness.resolveStorage(true);
  harness.pageHide();
  harness.pageShowPersisted();
  harness.xSetTheme('light');
  harness.flushHtmlMutation();
  assert.equal(harness.lastState, 'true', 'BFCache 復帰時の storage 再取得前は古い状態で再評価しないこと');
  harness.resolveStorage(false);
  assert.equal(harness.lastState, 'false', 'BFCache 復帰時は storage の最新 OFF 状態を反映すること');
}

{
  const harness = createHarness({ initialTheme: 'dark' });
  harness.resolveStorage(true);
  harness.pageHide();
  harness.pageShowPersisted();
  harness.setEnabled(false);
  harness.resolveStorage(true);
  assert.equal(harness.theme, 'dark', 'BFCache get より先に確定した OFF を古い get 結果で巻き戻さないこと');
  assert.equal(harness.getState().enabled, false, 'BFCache get 後着時も確定済みの OFF を返すこと');
}

{
  const harness = createHarness({ initialTheme: 'dark' });
  harness.resolveStorage(true);
  harness.pageHide();
  harness.pageShowPersisted();
  harness.setEnabled(true);
  harness.resolveStorage(false);
  assert.equal(harness.theme, 'dim', 'BFCache 中の状態と同じ ON 通知も古い get 結果より優先すること');
  assert.equal(harness.getState().enabled, true, 'BFCache get 後着時も確定済みの ON を返すこと');
}

{
  const harness = createHarness({ initialTheme: 'dark' });
  harness.pageHide();
  harness.pageShowPersisted();
  harness.resolveStorage(false, 1);
  harness.resolveStorage(true);
  assert.equal(harness.theme, 'dark', '新しい BFCache get を古い初期 get の後着結果で巻き戻さないこと');
  assert.equal(harness.getState().enabled, false, '複数 get の完了順が逆でも新しい結果を返すこと');
}

{
  const harness = createHarness({ lastState: 'true' });
  assert.equal(harness.intercept, 'on');
  harness.xSetTheme('dark');
  assert.equal(harness.theme, 'dim', '再訪時の dark は同期的に dim へ変換されること');
  harness.resolveStorage(true);
  harness.setEnabled(false);
  assert.equal(harness.theme, 'dark', '再訪時に変換した dim は OFF で dark へ戻ること');
}

{
  const harness = createHarness({ lastState: 'true' });
  harness.xSetTheme('dark');
  harness.resolveStorage(false);
  assert.equal(harness.theme, 'dark', '楽観状態とstorageが不一致でも初回解除で dark へ戻ること');
}

{
  const harness = createHarness({ lastState: 'true' });
  harness.xSetTheme('dim');
  harness.resolveStorage(true);
  harness.setEnabled(false);
  assert.equal(harness.theme, 'dim', 'X 公式 Dim は OFF でも dim のまま維持すること');
  assert.equal(harness.getState().isOfficialDim, true, 'OFF 時の X 公式 Dim を明示的に返すこと');
}

{
  const harness = createHarness({ lastState: 'true' });
  harness.xSetTheme('dark');
  harness.xSetTheme('dim');
  harness.resolveStorage(true);
  harness.setEnabled(false);
  assert.equal(harness.theme, 'dim', '有効中にX公式Dimへ切り替えた場合も dim を維持すること');
}

{
  const harness = createHarness({ lastState: 'true' });
  harness.xSetTheme('dark');
  harness.xSetTheme('light');
  harness.resolveStorage(true);
  assert.equal(harness.theme, 'light', 'light への遷移ではテーマ変換を解除すること');
  harness.setEnabled(false);
  harness.xSetTheme('dim');
  harness.setEnabled(true);
  harness.setEnabled(false);
  assert.equal(harness.theme, 'dim', '過去の dark 変換情報を後続の公式 Dim へ持ち越さないこと');
}

for (const lightScheme of ['light', 'normal']) {
  const harness = createHarness({ initialTheme: 'dark' });
  harness.resolveStorage(true);
  assert.equal(harness.theme, 'dim', `${lightScheme} 遷移前は DarkBlue を適用すること`);
  harness.xSetColorScheme(lightScheme);
  assert.equal(harness.theme, 'dark', `inline color-scheme が ${lightScheme} なら所有する dim を dark へ復元すること`);
  assert.equal(harness.hasGuard, false, `inline color-scheme が ${lightScheme} ならガードを解除すること`);

  // 実ブラウザでは上の復元で生じた data-theme mutation が次の microtask で配送される。
  // 旧実装は dark→dim→dark を繰り返し、発振ブレーカが評価を停止する。
  for (let i = 0; i < 55; i++) harness.flushHtmlMutation();
  assert.equal(harness.theme, 'dark', `復元した dark の mutation で ${lightScheme} 中に DarkBlue を再適用しないこと`);
  assert.equal(harness.hasGuard, false, `${lightScheme} の間は重複 mutation 後も解除状態を維持すること`);

  harness.xSetColorScheme('dark');
  assert.equal(harness.theme, 'dim', `${lightScheme} から dark に戻ったら評価を再開して DarkBlue を適用すること`);
  assert.equal(harness.hasGuard, true, `${lightScheme} 遷移で発振ブレーカを作動させず再適用できること`);
}

{
  const harness = createHarness({ lastState: 'true' });
  harness.xRemoveTheme();
  assert.equal(harness.theme, 'dim', '有効中の data-theme 削除は同期的に dim へ変換されること');
  harness.resolveStorage(true);
  harness.setEnabled(false);
  assert.equal(harness.theme, null, '属性削除から合成した dim は OFF で属性なしへ戻ること');
}

{
  const harness = createHarness({ initialTheme: 'dark' });
  harness.resolveStorage(true);
  assert.equal(harness.theme, 'dim', '通常初期化では dark を dim へ変換すること');
  harness.setEnabled(false);
  assert.equal(harness.theme, 'dark', '通常初期化で変換した dim は OFF で dark へ戻ること');
}

console.log('✅ テーマ復元契約一致 (storage未解決OFF / storage競合 / BFCache再取得・競合 / 再訪 dark / storage不一致 / 公式 Dim / 途中切替 / light・normal遷移 / 属性削除 / 通常初期化)');
