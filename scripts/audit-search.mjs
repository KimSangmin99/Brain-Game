import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.env.SEARCH_BASE_URL || "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("This audit creates local test records; use localhost only.");
fs.mkdirSync("test-results/search-production", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const checks = [],
  errors = [];
let completedBoards = 0;
async function choose(page) {
  const goal = page.locator(".search-goal"),
    shape = await goal.getAttribute("data-target-shape"),
    mark = await goal.getAttribute("data-target-mark");
  const targets = await page
    .locator(".search-cell")
    .evaluateAll(
      (nodes, target) =>
        nodes
          .filter(
            (n) =>
              (target.shape === "" ||
                n.getAttribute("data-shape") === target.shape) &&
              (target.mark === "" ||
                n.getAttribute("data-mark") === target.mark),
          )
          .map((n) => Number(n.getAttribute("data-cell"))),
      { shape, mark },
    );
  if (!targets.length) throw new Error("No target on rendered board");
  for (const cell of targets)
    await page.locator(`.search-cell[data-cell="${cell}"]`).click();
}
async function open(page, stage) {
  await page.goto(`${base}/games/search/play?stage=${stage}`);
  await page.getByRole("button", { name: "탐색 예제로 익히기" }).waitFor();
  if ((stage - 1) % 5 === 0) {
    await page.getByRole("button", { name: "탐색 예제로 익히기" }).click();
    await choose(page);
    await page
      .getByRole("button", { name: "예제 조건 확인", exact: true })
      .click();
    await page.getByRole("button", { name: "예제 완료 · 탐색 시작" }).click();
  } else
    await page
      .getByRole("button", { name: "바로 도전하기", exact: true })
      .click();
  await page.locator(".search-cell").first().waitFor();
}
async function inspect(page, width, stage, largeType = false) {
  const check = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    touch: [...document.querySelectorAll(".search-cell")].every((e) => {
      const r = e.getBoundingClientRect();
      return r.width >= 44 && r.height >= 44;
    }),
    prematureFeedback: !!document.querySelector(
      ".search-feedback,.search-cell.missed,.search-cell.correct-selected,.search-cell.false-positive",
    ),
  }));
  checks.push({ width, stage, largeType, ...check });
  if (check.overflow || !check.touch || check.prematureFeedback)
    throw new Error(JSON.stringify(checks.at(-1)));
  await page.screenshot({
    path: `test-results/search-production/${width}-stage-${stage}${largeType ? "-large" : ""}.png`,
    fullPage: true,
  });
}
async function confirm(page) {
  await page.getByRole("button", { name: /^선택 확정 \(/ }).click();
  await page.locator(".search-feedback").waitFor();
  if (
    !(await page.locator(".search-board-score").innerText()).includes("10,000")
  )
    throw new Error("Public-property matcher did not score 10000");
  const safe = await page.evaluate(
    () =>
      document.documentElement.scrollWidth <= innerWidth &&
      [...document.querySelectorAll(".search-cell")].every(
        (e) =>
          e.getBoundingClientRect().width >= 44 &&
          e.getBoundingClientRect().height >= 44,
      ),
  );
  if (!safe) throw new Error("Feedback layout is not usable");
  completedBoards++;
}
try {
  const desktop = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    page = await desktop.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  // Play all 90 scored boards using only public target and signal properties.
  for (let stage = 1; stage <= 30; stage++) {
    await open(page, stage);
    for (let round = 0; round < 3; round++) {
      await choose(page);
      if (round === 0) {
        await inspect(page, 1280, stage);
        if (stage === 26)
          await page.screenshot({
            path: "docs/games/search-desktop.png",
            fullPage: true,
          });
      }
      await confirm(page);
      await page
        .getByRole("button", {
          name: round === 2 ? "결과 확인" : "다음 보드",
          exact: true,
        })
        .click();
    }
    await page.locator(".result-panel").waitFor();
    if (!(await page.locator(".result-score").innerText()).includes("10,000"))
      throw new Error(`Stage ${stage} mean score`);
    await page.waitForFunction(
      () =>
        document.querySelector(".save-status")?.textContent === "기기에 저장됨",
    );
  }
  const records = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("brain-game-guest", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result,
            read = db.transaction("attempts").objectStore("attempts").getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result.filter((r) => r.phase === "result"));
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
  await desktop.close();
  for (const width of [360, 768]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
      }),
      page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.evaluate(
      async (rows) =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open("brain-game-guest", 1);
          req.onupgradeneeded = () =>
            req.result.createObjectStore("attempts", { keyPath: "id" });
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result,
              tx = db.transaction("attempts", "readwrite");
            rows.forEach((r) => tx.objectStore("attempts").put(r));
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
      records,
    );
    for (const stage of [1, 6, 11, 16, 21, 26, 30]) {
      await open(page, stage);
      await choose(page);
      await inspect(page, width, stage);
      if (width === 360 && stage === 30) {
        await page.waitForFunction(
          () =>
            document.querySelector(".save-status")?.textContent ===
            "기기에 저장됨",
        );
        await page.evaluate(() =>
          localStorage.setItem("brain-large-type", "true"),
        );
        await page.reload();
        await page
          .getByRole("button", { name: "새 탐색판으로 이어가기" })
          .click();
        await choose(page);
        await inspect(page, width, stage, true);
        await page.screenshot({
          path: "docs/games/search-mobile.png",
          fullPage: true,
        });
      }
      await confirm(page);
      await page
        .getByRole("button", { name: "다음 보드", exact: true })
        .click();
      for (let n = 1; n < 3; n++) {
        await page
          .getByRole("button", { name: "이번 보드 건너뛰기", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: n === 2 ? "결과 확인" : "다음 보드",
            exact: true,
          })
          .click();
      }
      await page.locator(".result-panel").waitFor();
    }
    await context.close();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  fs.writeFileSync(
    "test-results/search-production/audit.json",
    JSON.stringify({ checks, completedBoards, errors }, null, 2),
  );
  console.log(
    `Search production audit passed: ${checks.length} input screen states, ${completedBoards} perfect boards, all 30 stages completed.`,
  );
} finally {
  await browser.close();
}
