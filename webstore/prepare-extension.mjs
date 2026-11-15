// ストア画像の撮影用に、拡張機能の作業コピーを debug/vitrina-ext/ へ作る。
//
// 目的: vitrina（画像キット）は拡張の言語・状態を Service Worker 経由で storage へ書くが、
// 本拡張は background を持たない（製品の挙動は変えない）。そこで作業コピーの manifest にだけ
// 何もしない空の Service Worker を足し、キットが接続できるようにする。製品本体・配布物には影響しない。
// 作業コピーは debug/（Git 管理外）に置く。既存ファイルは上書きし、削除は行わない。
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dest = path.join(root, "debug", "vitrina-ext");

fs.mkdirSync(dest, { recursive: true });
// 配布物と同じ内容（variant manifest 以外の実行に必要な全て）を複製する
for (const name of ["_locales", "src", "icons"]) {
  fs.cpSync(path.join(root, name), path.join(dest, name), { recursive: true, force: true });
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
manifest.background = { service_worker: "vitrina-sw.js" };
fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
fs.writeFileSync(path.join(dest, "vitrina-sw.js"), "// vitrina 用の空 Service Worker（撮影用の作業コピーだけに置く）\n");
console.log(`prepare-extension: ${path.relative(root, dest)} を更新しました`);
