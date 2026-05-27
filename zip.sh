#!/bin/bash

# 帰ってきたDarkBlueテーマ(X) 拡張機能パッケージ生成スクリプト
# 使い方:
#   ./zip.sh                 # Chrome + Firefox 両方
#   ./zip.sh chrome          # Chrome のみ
#   ./zip.sh firefox         # Firefox のみ
#
# Firefox 版は manifest.firefox.json を manifest.json として同梱し、xpi 拡張子で出力する。
# DarkBlueThemeX は Firefox 非対応 API (offscreen / tabCapture 等) を使っていないため、
# WebRestrictionRemoval のような __FIREFOX_STRIP_*__ マーカー削除処理は不要。

set -euo pipefail
cd "$(dirname "$0")"

TARGET="${1:-both}"
case "$TARGET" in
  chrome|firefox|both) ;;
  *) echo "Usage: $0 [chrome|firefox|both]"; exit 2 ;;
esac

echo "拡張機能パッケージを生成中... (Target: $TARGET)"

if ! command -v zip &> /dev/null; then
  echo "zip をインストールしてください"
  echo "   Linux: sudo apt install zip"
  echo "   macOS: brew install zip"
  exit 1
fi

build_pkg() {
  local variant="$1"           # chrome | firefox
  local manifest_src="$2"      # manifest.json | manifest.firefox.json
  local output="$3"            # DarkBlueThemeX-chrome.zip | DarkBlueThemeX-firefox.xpi

  echo ""
  echo "==== $variant 版をビルド中 ===="
  rm -f "$output"

  local tmp="temp-build-$variant"
  rm -rf "$tmp"
  mkdir -p "$tmp"

  # manifest を variant 用にコピー (Firefox は manifest.firefox.json を manifest.json にリネーム)
  cp "$manifest_src" "$tmp/manifest.json"
  cp -r icons "$tmp/"
  cp -r src "$tmp/"

  # 不要ファイル除去
  find "$tmp" \( -name "*.DS_Store" -o -name "*.swp" -o -name "*~" \) -delete

  # アーカイブ作成 (zip / xpi いずれも zip 形式、拡張子だけが違う)
  (cd "$tmp" && zip -r "../$output" . -x "*.DS_Store" "*.swp" "*~") >/dev/null
  rm -rf "$tmp"

  if [ -f "$output" ]; then
    echo "$variant 版 作成成功: $output ($(ls -lh "$output" | awk '{print $5}'))"
  else
    echo "$variant 版 作成失敗"
    exit 1
  fi
}

# 旧名 zip を掃除 (互換維持のため)
rm -f DarkBlueThemeX.zip

if [ "$TARGET" = "chrome" ] || [ "$TARGET" = "both" ]; then
  build_pkg "chrome" "manifest.json" "DarkBlueThemeX-chrome.zip"
fi
if [ "$TARGET" = "firefox" ] || [ "$TARGET" = "both" ]; then
  build_pkg "firefox" "manifest.firefox.json" "DarkBlueThemeX-firefox.xpi"
fi

echo ""
echo "パッケージング完了"
echo "   Chrome Web Store: https://chrome.google.com/webstore/devconsole"
echo "   Firefox AMO:      https://addons.mozilla.org/developers/"
