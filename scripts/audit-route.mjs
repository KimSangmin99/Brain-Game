import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.env.ROUTE_BASE_URL || "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("This audit creates local test records; use localhost only.");
fs.mkdirSync("test-results/route-production", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const checks = [],
  errors = [];
async function publicPath(page) {
  const board = page.locator(".route-board"),
    size = Number(await board.getAttribute("data-size")),
    ordered = (await board.getAttribute("data-ordered")) === "true",
    rawLimit = await board.getAttribute("data-limit"),
    limit = rawLimit ? Number(rawLimit) : null;
  const cells = await board
    .locator(".route-cell")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        cell: Number(n.getAttribute("data-cell")),
        wall: n.getAttribute("data-wall") === "true",
        start: n.getAttribute("data-start") === "true",
        goal: n.getAttribute("data-goal") === "true",
        point: n.hasAttribute("data-point")
          ? Number(n.getAttribute("data-point"))
          : null,
      })),
    );
  const start = cells.find((c) => c.start).cell,
    goal = cells.find((c) => c.goal).cell,
    walls = cells.filter((c) => c.wall).map((c) => c.cell),
    required = cells
      .filter((c) => c.point !== null)
      .sort((a, b) => a.point - b.point)
      .map((c) => c.cell),
    queue = [[start]];
  // Independent simple-path BFS uses the visible public map and retains visited cells.
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i],
      at = path.at(-1);
    if (at === goal) {
      if (
        required.every((c) => path.includes(c)) &&
        (!ordered ||
          path
            .filter((c) => required.includes(c))
            .every((c, j) => c === required[j])) &&
        (limit === null || path.length - 1 <= limit)
      )
        return path;
      continue;
    }
    if (limit !== null && path.length - 1 >= limit) continue;
    const r = Math.floor(at / size),
      c = at % size;
    for (const [y, x] of [
      [r + 1, c],
      [r - 1, c],
      [r, c + 1],
      [r, c - 1],
    ])
      if (y >= 0 && x >= 0 && y < size && x < size) {
        const next = y * size + x;
        if (!walls.includes(next) && !path.includes(next))
          queue.push([...path, next]);
      }
  }
  throw new Error("No valid simple path in rendered map");
}
async function draw(page, path) {
  for (const cell of path.slice(1))
    await page.locator(`.route-cell[data-cell="${cell}"]`).click();
}
async function open(page, stage) {
  await page.goto(`${base}/games/route/play?stage=${stage}`);
  await page.getByRole("button", { name: "지도 예제로 익히기" }).waitFor();
  if ((stage - 1) % 5 === 0) {
    await page.getByRole("button", { name: "지도 예제로 익히기" }).click();
    await draw(page, await publicPath(page));
    await page
      .getByRole("button", { name: "예제 조건 확인", exact: true })
      .click();
    await page.getByRole("button", { name: "예제 완료 · 경로 시작" }).click();
  } else
    await page
      .getByRole("button", { name: "바로 도전하기", exact: true })
      .click();
  await page.locator(".route-cell[data-current=true]").waitFor();
}
async function inspect(page, width, stage, largeType = false) {
  const check = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    touch: [
      ...document.querySelectorAll(".route-cell,.route-direction-pad button"),
    ].every((e) => {
      const r = e.getBoundingClientRect();
      return r.width >= 44 && r.height >= 44;
    }),
    prematureFeedback: !!document.querySelector(
      ".route-feedback-list,.route-review",
    ),
  }));
  checks.push({ width, stage, largeType, ...check });
  if (check.overflow || !check.touch || check.prematureFeedback)
    throw new Error(JSON.stringify(checks.at(-1)));
  await page.screenshot({
    path: `test-results/route-production/${width}-stage-${stage}${largeType ? "-large" : ""}.png`,
    fullPage: true,
  });
}
try {
  const desktop = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    page = await desktop.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  for (let stage = 1; stage <= 30; stage++) {
    await open(page, stage);
    await draw(page, await publicPath(page));
    await inspect(page, 1280, stage);
    if (stage === 26)
      await page.screenshot({
        path: "docs/games/route-desktop.png",
        fullPage: true,
      });
    await page.getByRole("button", { name: "경로 확정", exact: true }).click();
    await page.locator(".result-panel").waitFor();
    if (!(await page.locator(".result-score").innerText()).includes("10,000"))
      throw new Error(`Stage ${stage} shortest-path score`);
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
      await draw(page, await publicPath(page));
      await inspect(page, width, stage);
      if (width === 360 && stage === 30) {
        await page.evaluate(() =>
          localStorage.setItem("brain-large-type", "true"),
        );
        await page.reload();
        await page.getByRole("button", { name: "이 경로로 이어가기" }).click();
        await inspect(page, width, stage, true);
        await page.screenshot({
          path: "docs/games/route-mobile.png",
          fullPage: true,
        });
      }
      await page
        .getByRole("button", { name: "이번 경로 건너뛰기", exact: true })
        .click();
      await page.locator(".result-panel").waitFor();
    }
    await context.close();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  fs.writeFileSync(
    "test-results/route-production/audit.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    `Route production audit passed: ${checks.length} input screen states; all 30 stages solved from the public map.`,
  );
} finally {
  await browser.close();
}
