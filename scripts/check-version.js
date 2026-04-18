/**
 * package.json と manifest.json の version が一致するかを検証。
 * CLAUDE.md の「バージョンの唯一の真実は manifest.json」原則を CI で担保する。
 * 不一致なら exit 1。
 */
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

if (pkg.version !== manifest.version) {
  console.error(`❌ version 不一致: package.json=${pkg.version} vs manifest.json=${manifest.version}`);
  console.error('   両者を一致させるか、vava スキルを使ってバージョン更新してください。');
  process.exit(1);
}

console.log(`✅ version 一致: ${manifest.version}`);
