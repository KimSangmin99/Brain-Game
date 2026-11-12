import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.env.ARRANGEMENT_BASE_URL || "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("This audit creates local test records; use localhost only.");
fs.mkdirSync("test-results/arrangement-production", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [],
  checks = [];
const permutations = (items) =>
  items.length
    ? items.flatMap((n, i) =>
        permutations(items.filter((_, j) => i !== j)).map((p) => [n, ...p]),
      )
    : [[]];
async function solveVisible(page) {
  const size = await page.locator(".arrangement-palette button").count();
  const clues = await page
    .locator(".arrangement-clues li")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        kind: n.getAttribute("data-kind"),
        a: Number(n.getAttribute("data-a")),
        b: Number(n.getAttribute("data-b")),
        slot: Number(n.getAttribute("data-slot")),
      })),
    );
  const solutions = permutations(
    Array.from({ length: size }, (_, i) => i),
  ).filter((p) =>
    clues.every((c) => {
      const a = p.indexOf(c.a),
        b = p.indexOf(c.b);
      return c.kind === "at"
        ? a === c.slot
        : c.kind === "notAt"
          ? a !== c.slot
          : c.kind === "before"
            ? a < b
            : c.kind === "next"
              ? b - a === 1
              : Math.abs(a - b) === 1;
    }),
  );
  if (solutions.length !== 1)
    throw new Error("Public conditions do not have one solution");
  for (const [slot, item] of solutions[0].entries()) {
    await page.locator(".arrangement-palette button").nth(item).click();
    await page.locator(".arrangement-slot").nth(slot).click();
  }
}
async function open(page, stage) {
  await page.goto(`${base}/games/arrangement/play?stage=${stage}`);
  await page.getByRole("button", { name: "배치 예제로 익히기" }).waitFor();
  if ((stage - 1) % 5 === 0) {
    await page.getByRole("button", { name: "배치 예제로 익히기" }).click();
    await solveVisible(page);
    await page
      .getByRole("button", { name: "예제 조건 확인", exact: true })
      .click();
    await page.getByRole("button", { name: "예제 완료 · 배열 시작" }).click();
  } else
    await page
      .getByRole("button", { name: "바로 도전하기", exact: true })
      .click();
  await page.locator(".arrangement-slot").first().waitFor();
}
async function inspect(page, width, stage, largeType = false) {
  const check = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    touch: [
      ...document.querySelectorAll(
        ".arrangement-slot,.arrangement-palette button",
      ),
    ].every((e) => {
      const r = e.getBoundingClientRect();
      return r.width >= 44 && r.height >= 44;
    }),
    prematureFeedback: !!document.querySelector(
      ".arrangement-condition-status,.arrangement-solution",
    ),
  }));
  checks.push({ width, stage, largeType, ...check });
  if (check.overflow || !check.touch || check.prematureFeedback)
    throw new Error(JSON.stringify(checks.at(-1)));
  await page.screenshot({
    path: `test-results/arrangement-production/${width}-stage-${stage}${largeType ? "-large" : ""}.png`,
    fullPage: true,
  });
}
try {
  const desktop = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    page = await desktop.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  // Reach each stage through real local guest gameplay. Only rendered public conditions are used.
  for (let stage = 1; stage <= 30; stage++) {
    await open(page, stage);
    await solveVisible(page);
    await inspect(page, 1280, stage);
    if (stage === 26)
      await page.screenshot({
        path: "docs/games/arrangement-desktop.png",
        fullPage: true,
      });
    await page.getByRole("button", { name: "배치 확정", exact: true }).click();
    await page.locator(".result-panel").waitFor();
    if (!(await page.locator(".result-score").innerText()).includes("10,000"))
      throw new Error(`Stage ${stage} score`);
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
      await solveVisible(page);
      await inspect(page, width, stage);
      if (width === 360 && stage === 30) {
        await page.evaluate(() =>
          localStorage.setItem("brain-large-type", "true"),
        );
        await page.reload();
        await page.getByRole("button", { name: "이 배치로 이어가기" }).click();
        await inspect(page, width, stage, true);
        await page.screenshot({
          path: "docs/games/arrangement-mobile.png",
          fullPage: true,
        });
      }
      await page
        .getByRole("button", { name: "이번 배열 건너뛰기", exact: true })
        .click();
      await page.locator(".result-panel").waitFor();
    }
    await context.close();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  fs.writeFileSync(
    "test-results/arrangement-production/audit.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    `Arrangement production audit passed: ${checks.length} screen states; all 30 stages solved through public conditions.`,
  );
} finally {
  await browser.close();
}
