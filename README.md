# 帰ってきたDarkBlueテーマ(X)

X（旧Twitter）のダークテーマ(黒/Lights Out)を、かつて存在した **DarkBlue(Dim)テーマ** に変換するブラウザ拡張機能です。**Chrome / Edge / Brave** などの Chromium 系ブラウザと **Firefox** に対応しています。

## 機能

- X のダークテーマ(黒)を旧 DarkBlue テーマに自動変換
- 拡張機能のポップアップからワンタッチで有効/無効を切り替え（デフォルト: ON）
- ライトテーマ利用者には影響しない安全設計
- SPA ナビゲーション・動的コンテンツに完全対応

## DarkBlue カラーパレット

| 用途 | カラー |
|------|--------|
| 背景（メイン） | `#15202B` |
| 背景（カード/モーダル） | `#192734` |
| 背景（ホバー） | `#22303C` |
| ボーダー | `#38444D` |
| テキスト（メイン） | `#E7E9EA` |
| テキスト（サブ） | `#8B98A5` |
| アクセント | `#1D9BF0` |

## インストール

### Chrome ウェブストアから（Chrome / Edge / Brave など）
[帰ってきたDarkBlueテーマ(X) - Chrome ウェブストア](https://chromewebstore.google.com/detail/faoeaifiekkencilijamigcljnlaodkg?authuser=0&hl=ja)

### Firefox Add-ons (AMO) から
Firefox 142 以降に対応しています。[帰ってきたDarkBlueテーマ(X) - Firefox Add-ons](https://addons.mozilla.org/ja/firefox/addon/darkblue-theme-x/) からインストールできます。

### 開発者モード（ソースから導入する場合）

**Chrome / Edge / Brave**:
1. このリポジトリをクローンまたはダウンロード
2. `chrome://extensions` を開く
3. 右上の「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. ダウンロードしたフォルダを選択

**Firefox**:
1. このリポジトリをクローンし、`bash zip.sh firefox` でビルド (`DarkBlueThemeX-firefox.xpi` が生成される)
2. Firefox で `about:debugging#/runtime/this-firefox` を開く
3. 「一時的なアドオンを読み込む...」をクリックして `DarkBlueThemeX-firefox.xpi` を選択
   - Firefox の一時アドオンはセッションごとに読み込み直しが必要
   - 恒久インストールには AMO 公開版か、Developer Edition / Nightly で `xpinstall.signatures.required = false` 設定が必要

## 使い方

1. X (x.com) でダークテーマ(黒/Lights Out)を設定
2. 拡張機能をインストールすると自動的に DarkBlue テーマが適用される
3. 拡張機能アイコンをクリックしてトグルで ON/OFF を切り替え

## 動作条件

- Google Chrome 110 以上 / Edge / Brave などの Chromium 系
- Firefox 142 以上
- X のダークテーマ(黒)が有効であること
- ライトテーマ設定の場合は適用されません

## プライバシー

テーマ変換では個人情報を収集しません。利用者がお問い合わせフォームを開いて権限を許可し、送信した場合だけ、入力した情報を Kagayoi Support へ送ります。詳細は [プライバシーポリシー](docs/privacy-policy.md) をご覧ください。

## ライセンス

MIT License
