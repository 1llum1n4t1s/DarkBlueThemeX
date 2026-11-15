// vitrina（ストア掲載画像キット）の呼び出しラッパー。
// キット（webstore/vitrina/）は逐語コピーで改変禁止。本拡張は background を持たないため、generate / sheet の前に
// 撮影用の作業コピー（debug/vitrina-ext/、空の Service Worker 入り）を作る。
// （キットは Service Worker の無い拡張へ拡張ページ経由で言語を書けるようになったので、store-assets.json の extensionDir を
//   "." に戻して撮影確認ができたら、このラッパーと prepare-extension.mjs は不要になる。）
// --work-dir は未指定ならキットの既定値（Windows は D:\tmp\vitrina-<リポジトリ名>、それ以外は OS の一時フォルダー配下）。
//   bun webstore/run-vitrina.mjs [generate|verify|sheet] [vitrina のオプション...]
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith("--")) args.unshift("generate");

// 撮影用の作業コピー（空の Service Worker を足した拡張）を最新にする。generate / sheet が拡張の _locales を読むため。
if (args[0] === "generate" || args[0] === "sheet") await import("./prepare-extension.mjs");

const proc = Bun.spawnSync([process.execPath, path.join(here, "vitrina", "vitrina.mjs"), ...args], {
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(proc.exitCode ?? 1);
