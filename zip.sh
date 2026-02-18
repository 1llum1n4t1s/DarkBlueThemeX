#!/bin/bash

# 帰ってきたDarkBlueテーマ(X) 拡張機能パッケージ生成スクリプト

# スクリプトのディレクトリに移動
cd "$(dirname "$0")" || exit 1

echo "拡張機能パッケージを生成中..."
echo ""

# 古いZIPファイルを削除
rm -f ./DarkBlueThemeX.zip
echo "既存のZIPファイルを削除しました"

echo "ZIPファイルを作成中..."

# zipコマンドの確認
if ! command -v zip &> /dev/null; then
  echo "zipをインストールしてください"
  echo "   Linux: sudo apt install zip"
  echo "   macOS: brew install zip"
  exit 1
fi

# 必要なファイルのみをZIPに含める
zip -r ./DarkBlueThemeX.zip \
  manifest.json \
  src/ \
  icons/ \
  -x "*.DS_Store" "*.swp" "*~"

if [ $? -eq 0 ]; then
  echo "ZIPファイルを作成しました: DarkBlueThemeX.zip"
  echo ""
  echo "ファイルサイズ:"
  ls -lh ./DarkBlueThemeX.zip
  echo ""
  echo "含まれているファイル:"
  unzip -l ./DarkBlueThemeX.zip
else
  echo "ZIPファイルの作成に失敗しました"
  exit 1
fi
