const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// DarkBlueThemeX は manifest.json で "icon16.png" / "icon48.png" / "icon128.png"
// のハイフン無し命名を使っているためそれに合わせる
const sizes = [16, 48, 128];
const svgPath = path.join(__dirname, '../icons/icon.svg');
const iconsDir = path.join(__dirname, '../icons');

async function generateIcons() {
  console.log('🎨 アイコン生成を開始します...\n');

  if (!fs.existsSync(svgPath)) {
    console.error('❌ エラー: icon.svg が見つかりません');
    process.exit(1);
  }

  fs.mkdirSync(iconsDir, { recursive: true });

  // 生成 PNG は .gitignore 対象でリポジトリに存在せず、CI (package / publish-firefox ジョブ) は
  // 毎回ここでの生成物に依存する。個別サイズの失敗を握り潰すと exit 0 のまま zip/xpi 化へ進み、
  // manifest.json が参照するアイコンを欠いたパッケージがストアへ提出されうるため、必ず失敗させる。
  const results = await Promise.allSettled(sizes.map(async (size) => {
    const outputPath = path.join(iconsDir, `icon${size}.png`);
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`✅ ${size}x${size} アイコンを生成しました: ${path.basename(outputPath)}`);
  }));

  const failures = results
    .map((r, i) => ({ size: sizes[i], reason: r.reason }))
    .filter((r) => r.reason !== undefined);

  if (failures.length > 0) {
    for (const { size, reason } of failures) {
      console.error(`❌ ${size}x${size} アイコンの生成に失敗しました:`, reason && reason.message ? reason.message : reason);
    }
    throw new Error(`${failures.length} 個のアイコン生成に失敗しました`);
  }

  // 書き込み自体が無言で空ファイルを作る事故 (ディスク full 等) まで含めて弾く
  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `icon${size}.png`);
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error(`アイコンが生成されていないか空です: ${path.basename(outputPath)}`);
    }
  }

  console.log('\n🎉 アイコン生成が完了しました！');
}

generateIcons().catch(error => {
  console.error('❌ エラーが発生しました:', error);
  process.exit(1);
});
