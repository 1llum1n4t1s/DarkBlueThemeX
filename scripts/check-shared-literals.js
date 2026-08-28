/**
 * 実行コンテキストを跨いで重複ハードコードされた共有リテラルの値が一致するかを検証する。
 *
 * Chrome 拡張のコンテキスト分離 (isolated world / MAIN world / extension page) で共有モジュール
 * 不可のため、これらの定数は複数ファイルに重複定義されている。片側更新漏れ (特に改名時) が
 * 起きると、例外もログも出ないまま機能だけがサイレント停止する事故になる:
 *   - STORAGE_KEY / MSG_GET_STATE (content ↔ popup): トグル伝播が止まる
 *   - LOCATION_CHANGE_EVENT (content ↔ intercept): SPA 遷移の検出が止まり、
 *     通知ページ専用 CSS が当たらなくなる
 *   - THEME_*_EVENT (content ↔ intercept): dim の変換元を失い、OFF 時の復元先を誤る
 * 従来はコメントの行番号併記で同期を担保していたが行ズレで腐るため、CI で機械検証する。
 * 不一致なら exit 1。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

/** 検証グループ: 同じ値を持つべき定数名と、それを重複定義しているファイル群 */
const GROUPS = [
  { keys: ['STORAGE_KEY', 'MSG_GET_STATE'], files: ['src/content.js', 'src/popup/popup.js'] },
  {
    keys: [
      'LOCATION_CHANGE_EVENT',
      'THEME_DARK_CONVERTED_EVENT',
      'THEME_REMOVED_CONVERTED_EVENT',
      'THEME_DIM_SELECTED_EVENT',
    ],
    files: ['src/content.js', 'src/intercept.js'],
  },
];

const sourceCache = new Map();
function readSource(relPath) {
  if (!sourceCache.has(relPath)) {
    sourceCache.set(relPath, fs.readFileSync(path.join(root, relPath), 'utf8'));
  }
  return sourceCache.get(relPath);
}

/** `const NAME = 'value';` から value を抽出（最初の定義のみ。シングル/ダブルクォート両対応）。 */
function extractLiteral(source, name) {
  // 行頭アンカー (^[ \t]*) + m フラグで、コメントアウト行 (// const ...) の誤検出を防ぐ。
  const re = new RegExp('^[ \\t]*const\\s+' + name + "\\s*=\\s*(['\"])(.*?)\\1", 'm');
  const m = source.match(re);
  return m ? m[2] : null;
}

let failed = false;
for (const group of GROUPS) {
  for (const key of group.keys) {
    const values = {};
    for (const file of group.files) {
      values[file] = extractLiteral(readSource(file), key);
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
}

if (failed) {
  console.error('   重複定義された共有リテラルを全ファイルで一致させてください。');
  process.exit(1);
}

for (const group of GROUPS) {
  console.log(`✅ 共有リテラル一致 (${group.files.join(' ↔ ')}): ${group.keys.join(' / ')}`);
}
