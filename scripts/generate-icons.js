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

  await Promise.all(sizes.map(async (size) => {
    const outputPath = path.join(iconsDir, `icon${size}.png`);
    try {
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(outputPath);

      console.log(`✅ ${size}x${size} アイコンを生成しました: ${path.basename(outputPath)}`);
    } catch (error) {
      console.error(`❌ ${size}x${size} アイコンの生成に失敗しました:`, error.message);
    }
  }));

  console.log('\n🎉 アイコン生成が完了しました！');
}

generateIcons().catch(error => {
  console.error('❌ エラーが発生しました:', error);
  process.exit(1);
});
