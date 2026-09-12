# 帰ってきたDarkBlueテーマ(X)

X（旧Twitter）のダークテーマ(黒/Lights Out)を、かつて存在した **DarkBlue(Dim)テーマ** に変換するブラウザ拡張機能です。**Chrome / Edge / Brave** などの Chromium 系ブラウザと **Firefox** に対応しています。

## 機能

- X のダークテーマ(黒)を旧 DarkBlue テーマに自動変換
- 拡張機能のポップアップからワンタッチで有効/無効を切り替え（デフォルト: ON）
- ライトテーマ利用者には影響しない安全設計
- ページ内の画面遷移や動的コンテンツにも配色を適用

## インストール

### Chrome ウェブストアから（Chrome / Edge / Brave など）
[帰ってきたDarkBlueテーマ(X) - Chrome ウェブストア](https://chromewebstore.google.com/detail/faoeaifiekkencilijamigcljnlaodkg?authuser=0&hl=ja)

### Firefox Add-ons (AMO) から
Firefox 142 以降に対応しています。[帰ってきたDarkBlueテーマ(X) - Firefox Add-ons](https://addons.mozilla.org/ja/firefox/addon/darkblue-theme-x/) からインストールできます。

ソースから導入する場合は [開発用の準備・読み込み手順](AGENTS.md#build--package) を参照してください。

## 使い方

1. X (x.com) でダークテーマ(黒/Lights Out)を設定
2. 拡張機能をインストールすると自動的に DarkBlue テーマが適用される
3. 拡張機能アイコンをクリックしてトグルで ON/OFF を切り替え

## 動作条件

- Google Chrome 110 以上 / Edge / Brave などの Chromium 系
- Firefox 142 以上
- X のダークテーマ(黒)が有効であること
- ライトテーマ設定の場合は適用されません

## 困ったとき・お問い合わせ

- 適用されない場合は、X のテーマが黒（Lights Out）で、拡張機能が「有効」になっていることを確認してください。インストール・更新後は X のページを再読み込みしてください。
- トグルが「確認中」の間は設定を読み込んでいます。「未確認」「設定を読み込めませんでした」と表示された場合は切り替えできません。ポップアップを閉じて開き直し、再度読み込みを試してください。
- OFF にしても青い場合は、ポップアップに「X 公式の Dim テーマを使用中」と表示されていないか確認してください。公式 Dim の選択は維持されます。
- 問題が続く場合は、ポップアップの「お問い合わせ」から連絡できます。表示される権限を許可し、フォームの案内に従ってメール認証と送信を行ってください。権限を拒否してもテーマ変換は利用できます。

## プライバシー

テーマ変換では個人情報を収集しません。利用者がお問い合わせフォームを開いて権限を許可し、送信した場合だけ、入力した情報を Kagayoi Support へ送ります。詳細は [プライバシーポリシー](docs/privacy-policy.md) をご覧ください。

## ライセンス

MIT License
