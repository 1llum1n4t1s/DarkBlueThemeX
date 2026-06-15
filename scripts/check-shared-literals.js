/**
 * content.js と popup.js に重複ハードコードされた共有リテラル
 * (STORAGE_KEY / MSG_GET_STATE) の値が一致するかを検証する。
 *
 * Chrome 拡張のコンテキスト分離 (isolated world / extension page) で共有モジュール不可のため、
 * これらの定数は両ファイルに重複定義されている。片側更新漏れ (特に改名時) が起きると
 * popup ↔ content のトグル伝播がサイレント停止する (例外もログも出ない) 事故になる。
 * 従来はコメントの行番号併記で同期を担保していたが行ズレで腐るため、CI で機械検証する。
 * 不一致なら exit 1。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SHARED_KEYS = ['STORAGE_KEY', 'MSG_GET_STATE'];
const FILES = {
  'src/content.js': fs.readFileSync(path.join(root, 'src', 'content.js'), 'utf8'),
  'src/popup/popup.js': fs.readFileSync(path.join(root, 'src', 'popup', 'popup.js'), 'utf8'),
};

/** `const NAME = 'value';` から value を抽出（最初の定義のみ。シングル/ダブルクォート両対応）。 */
function extractLiteral(source, name) {
  const re = new RegExp('const\\s+' + name + "\\s*=\\s*(['\"])(.*?)\\1");
  const m = source.match(re);
  return m ? m[2] : null;
}

let failed = false;
for (const key of SHARED_KEYS) {
  const values = {};
  for (const [file, source] of Object.entries(FILES)) {
    values[file] = extractLiteral(source, key);
  }

  if (Object.values(values).some((v) => v === null)) {
    console.error(`❌ ${key}: 定義が見つからないファイルがあります`);
    for (const [file, v] of Object.entries(values)) {
      console.error(`   ${file}=${v === null ? '(未検出)' : `'${v}'`}`);
    }
    failed = true;
    continue;
  }

  const unique = new Set(Object.values(values));
  if (unique.size !== 1) {
    console.error(`❌ ${key} 不一致:`);
    for (const [file, v] of Object.entries(values)) {
      console.error(`   ${file}='${v}'`);
    }
    failed = true;
  }
}

if (failed) {
  console.error('   content.js と popup.js の共有リテラルを一致させてください。');
  process.exit(1);
}

console.log(`✅ 共有リテラル一致 (content.js ↔ popup.js): ${SHARED_KEYS.join(' / ')}`);
