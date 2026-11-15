// 撮影前の操作（vitrina から呼ばれる）。
import fs from "node:fs";
import path from "node:path";
import { fontFamilyCss, toLangTag } from "./vitrina/lib/config.mjs";

const FIXTURE_URL = "https://x.com/home";

/**
 * popup はタブとして開くため、拡張が「現在のタブ」として見るのは popup 自身になり「Xのページを開いてください」と出てしまう。
 * 実際の使われ方（X を開いた状態でアイコンを押す）に合わせるため、骨組みの固定ページを x.com として別タブに開き、
 * popup の「現在のタブ」の取得だけをそのタブへ向けて、実際の content script の応答から状態表示を出す。
 */
async function popupWithXTab({ page, cap, session }) {
  // <html lang> は拡張ページ自身の localStorage の控え（前回の表示言語）から決まるため、storage だけ書き換えた直後の初回表示は
  // 前のロケールの lang で描かれる（書体・フッターの文言がずれる）。実利用の「2 回目以降の表示」に合わせて 1 回再読み込みし、
  // 寸法も測り直す。
  await page.reload({ waitUntil: "load" });
  await new Promise((resolve) => setTimeout(resolve, 600));
  const size = await page.evaluate(() => {
    const r = document.body.getBoundingClientRect();
    return { w: Math.ceil(r.width), h: Math.ceil(Math.max(document.body.scrollHeight, r.height)) };
  });
  await page.setViewport({ width: size.w, height: Math.min(size.h, 600), deviceScaleFactor: cap.scale ?? 2 });
  const html = fs.readFileSync(path.join(session.cfg.fixturesDir, "timeline.html"), "utf8");
  const bg = await session.browser.newPage();
  try {
    await bg.setRequestInterception(true);
    bg.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("data:") || url.startsWith("chrome-extension:") || url.startsWith("blob:") || url.startsWith("about:")) return request.continue();
      if (request.isNavigationRequest() && new URL(url).origin === "https://x.com") return request.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html });
      return request.respond({ status: 404, contentType: "text/plain", body: "" });
    });
    await bg.goto(FIXTURE_URL, { waitUntil: "load" });
    // content script が状態を確定するまで待つ（有効: darkbluethemex-active / 無効: darkbluethemex-off）
    await bg.waitForFunction(() => document.documentElement.classList.contains("darkbluethemex-active") || document.documentElement.classList.contains("darkbluethemex-off"), { timeout: 15000 });
    await page.bringToFront();
    const tabId = await page.evaluate(async () => (await chrome.tabs.query({ url: "https://x.com/*" }))[0]?.id);
    if (tabId == null) throw new Error("x.com の固定ページのタブが見つかりません");
    await page.evaluate(async (id, url) => {
      chrome.tabs.query = async () => [{ id, url }];
      await window.queryTabState(); // popup.js の状態取得（実際の content script へ sendMessage する）
    }, tabId, FIXTURE_URL);
  } finally {
    await bg.close().catch(() => {});
  }
}

export default {
  "popup-on": popupWithXTab,
  "popup-off": popupWithXTab,

  // 変更前／変更後の列の見出しに、拡張自身の「無効」「有効」の文言（_locales の toggleOff / toggleOn）を置く
  "before-after": async ({ page, locale, session }) => {
    const m = session.messages[locale];
    await page.evaluate((labels, font, lang) => {
      document.documentElement.lang = lang;
      document.body.style.fontFamily = font;
      for (const [id, text] of Object.entries(labels)) {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.innerHTML = "<i></i>";
        pill.append(text);
        document.querySelector(`#${id} .slot`).replaceWith(pill);
      }
    }, { before: m.toggleOff.message, after: m.toggleOn.message }, fontFamilyCss(locale), toLangTag(locale));
  },
};
