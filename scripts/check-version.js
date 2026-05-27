/**
 * package.json / manifest.json / manifest.firefox.json の version が三者一致するかを検証。
 * CLAUDE.md の「バージョンの唯一の真実は manifest.json」原則を CI で担保する。
 * 不一致なら exit 1。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const manifestFirefox = JSON.parse(fs.readFileSync(path.join(root, 'manifest.firefox.json'), 'utf8'));

const versions = {
  'package.json': pkg.version,
  'manifest.json': manifest.version,
  'manifest.firefox.json': manifestFirefox.version,
};

const unique = new Set(Object.values(versions));
if (unique.size !== 1) {
  console.error('❌ version 不一致:');
  for (const [file, v] of Object.entries(versions)) {
    console.error(`   ${file}=${v}`);
  }
  console.error('   3 ファイルすべてを一致させるか、/vava スキルでバージョン更新してください。');
  process.exit(1);
}

console.log(`✅ version 一致 (3 ファイル同期): ${manifest.version}`);
