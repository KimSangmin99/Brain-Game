import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.env.RULE_BASE_URL || "http://localhost:3100";
fs.mkdirSync("test-results/rule-production", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
async function seed(page) {
  await page.goto(base);
  await page.locator("#home-title").waitFor();
  // Synthetic, local-only completed records unlock test stages; never sent to a server.
  await page.evaluate(async () => {
    const mod = (n) => ((n % 4) + 4) % 4,
      rows = [];
    for (let stage = 1; stage < 30; stage++) {
      const band = Math.floor((stage - 1) / 5),
        role = (stage - 1) % 5;
      const family =
        band === 0
          ? role === 1
            ? "marks"
            : "rotation"
          : band === 1
            ? "count"
            : band === 2
              ? role === 2
                ? "dual-count"
                : "dual-marks"
              : band === 3
                ? role === 2
                  ? "alternate-mark"
                  : "alternate-direction"
                : "combined";
      const questions = [];
      for (let q = 0; q < 5; q++) {
        const direction = q % 4,
          mark = Math.floor(q / 4),
          count = 2,
          sign = stage === 8 ? -1 : 1;
        const term = (i) => {
          const k = Math.floor(i / 2),
            odd = i % 2 === 0;
          if (family === "rotation")
            return { direction: mod(direction + i), mark, count };
          if (family === "marks")
            return { direction, mark: mod(mark + i), count };
          if (family === "count")
            return { direction, mark, count: (sign === 1 ? 1 : 5) + i * sign };
          if (family === "dual-count")
            return { direction: mod(direction + i), mark, count: 1 + i };
          if (family === "dual-marks")
            return {
              direction: mod(direction + i),
              mark: mod(mark + i),
              count,
            };
          if (family === "alternate-direction")
            return {
              direction: mod(direction + (odd ? 0 : 2) + k * (odd ? 1 : -1)),
              mark,
              count,
            };
          if (family === "alternate-mark")
            return {
              direction,
              mark: mod(mark + (odd ? 0 : 1) + k * (odd ? 1 : -1)),
              count,
            };
          return {
            direction: mod(direction + (odd ? 0 : 2) + k * (odd ? 1 : -1)),
            mark: mod(mark + (odd ? 0 : 1) + k),
            count,
          };
        };
        const size =
            family.startsWith("alternate") || family === "combined" ? 6 : 4,
          shown = Array.from({ length: size }, (_, i) => term(i)),
          correct = term(size);
        questions.push({
          id: `rc1:${family}:${shown.map((t) => `${t.direction}${t.count}${t.mark}`).join("-")}`,
          family,
          shown,
          options: [
            correct,
            ...[1, 2, 3].map((step) => ({
              ...correct,
              direction: mod(correct.direction + step),
            })),
          ],
        });
      }
      const now = Date.now() - 100000 + stage * 1000;
      rows.push({
        id: crypto.randomUUID(),
        version: "rule-v1",
        contentVersion: "rule-content-v1",
        stage,
        mode: "stage",
        phase: "result",
        questions,
        round: 4,
        selected: 0,
        answers: questions.map(() => ({
          selected: 0,
          correct: true,
          skipped: false,
          hintLevel: 0,
        })),
        hintLevel: 0,
        assisted: false,
        interrupted: false,
        createdAt: now,
        updatedAt: now,
        revision: 25,
      });
    }
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("brain-game-guest", 1);
      r.onupgradeneeded = () =>
        r.result.createObjectStore("attempts", { keyPath: "id" });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("attempts", "readwrite");
      for (const row of rows) tx.objectStore("attempts").put(row);
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
  });
}
async function choose(page) {
  const family = await page.locator(".rule-scope").getAttribute("data-family");
  const read = (locator) =>
    locator.evaluateAll((nodes) =>
      nodes.map((n) => ({
        direction: Number(n.dataset.direction),
        count: Number(n.dataset.count),
        mark: Number(n.dataset.mark),
      })),
    );
  const shown = await read(page.locator(".rule-sequence .rule-term")),
    alternating = family.startsWith("alternate") || family === "combined",
    a = shown[alternating ? 2 : shown.length - 2],
    b = shown[alternating ? 4 : shown.length - 1],
    expected = {
      direction: (((2 * b.direction - a.direction) % 4) + 4) % 4,
      mark: (((2 * b.mark - a.mark) % 4) + 4) % 4,
      count: 2 * b.count - a.count,
    };
  const options = await read(page.locator(".rule-options .rule-term")),
    index = options.findIndex(
      (o) =>
        o.direction === expected.direction &&
        o.count === expected.count &&
        o.mark === expected.mark,
    );
  if (index < 0) throw Error("No valid next option");
  await page.getByRole("radio").nth(index).click();
}
let checked = 0;
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
        viewport: { width, height: width === 1280 ? 720 : 900 },
        reducedMotion: "reduce",
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await seed(page);
    for (const stage of [1, 7, 8, 13, 16, 18, 21, 30]) {
      await page.goto(`${base}/games/rule/play?stage=${stage}`);
      await page.getByRole("button", { name: "예제로 규칙 익히기" }).click();
      await choose(page);
      await page.getByRole("button", { name: "연습 완료 · 도전 시작" }).click();
      for (let i = 0; i < 4; i++) await page.getByRole("radio").nth(i).click();
      await choose(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      if (overflow) throw Error(`Overflow ${stage} ${width}`);
      const sizes = await page
        .getByRole("radio")
        .evaluateAll((nodes) =>
          nodes.map((n) => ({
            w: n.getBoundingClientRect().width,
            h: n.getBoundingClientRect().height,
          })),
        );
      if (sizes.some((s) => s.w < 44 || s.h < 44))
        throw Error("Small controls");
      if (width === 1280) {
        const bounds = await page.locator(".rule-sequence").boundingBox();
        if (!bounds || bounds.y < 0 || bounds.y + bounds.height > 720)
          throw Error("Clues not visible while selecting");
      }
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({
        path: `test-results/rule-production/stage-${stage}-${width}.png`,
        fullPage: true,
      });
      checked++;
      await page
        .getByRole("button", { name: "선택 확정", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "규칙을 정확히 찾았어요!" })
        .waitFor();
    }
    if (errors.length) throw Error(errors.join("\n"));
    await context.close();
  }
  const context = await browser.newContext({
      viewport: { width: 360, height: 900 },
      reducedMotion: "reduce",
    }),
    page = await context.newPage();
  await seed(page);
  await page.evaluate(() => localStorage.setItem("brain-large-type", "true"));
  await page.goto(`${base}/games/rule/play?stage=21`);
  await page.getByRole("button", { name: "예제로 규칙 익히기" }).click();
  await choose(page);
  await page.getByRole("button", { name: "연습 완료 · 도전 시작" }).click();
  await choose(page);
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Large text overflow");
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "test-results/rule-production/stage-21-large-360.png",
    fullPage: true,
  });
  checked++;
  await context.close();
  console.log(
    `PASS ${checked} production rule views: responsive controls, all options selectable, grading, visible desktop clues, no page errors`,
  );
} finally {
  await browser.close();
}
