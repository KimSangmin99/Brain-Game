import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
const base = process.env.SWITCH_BASE_URL || "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local test records only.");
const dir = "test-results/switch-production";
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const checks = [],
  errors = [];
let completedQuestions = 0;
async function freeze(page) {
  const time = new Date("2026-11-13T01:00:00Z");
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
  page.on("pageerror", (e) => errors.push(e.message));
}
async function ready(page) {
  const panel = page.locator(".experiment");
  await expect(panel).toHaveAttribute("data-phase", /cue|gap|ready/);
  if ((await panel.getAttribute("data-phase")) === "gap")
    await page.clock.runFor(500);
  if ((await panel.getAttribute("data-phase")) === "cue")
    await page.clock.runFor(1000);
  await expect(panel).toHaveAttribute("data-phase", "ready");
}
async function choice(page) {
  const rule = await page.locator(".switch-rule").getAttribute("data-rule");
  return Number(
    await page.locator(".switch-signal").getAttribute(`data-${rule}`),
  );
}
async function open(page, stage, mode = "stage") {
  await page.goto(`${base}/games/switch/play?stage=${stage}&mode=${mode}`);
  await page.getByRole("button", { name: "지시 예제로 익히기" }).waitFor();
  if ((stage - 1) % 5 === 0) {
    await page.getByRole("button", { name: "지시 예제로 익히기" }).click();
    await page
      .locator(".switch-choices button")
      .nth(await choice(page))
      .click();
    await page.getByRole("button", { name: "예제 완료 · 도전 시작" }).click();
  } else
    await page
      .getByRole("button", { name: "바로 도전하기", exact: true })
      .click();
  await ready(page);
}
async function inspect(page, width, stage, largeType = false) {
  await expect(page.locator(".switch-rule")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".switch-choices")).toBeInViewport({ ratio: 1 });
  const check = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    touch: [...document.querySelectorAll(".switch-choices button")].every(
      (n) => {
        const r = n.getBoundingClientRect();
        return r.width >= 44 && r.height >= 44;
      },
    ),
    prematureFeedback: !!document.querySelector(".switch-feedback"),
    attributes: document
      .querySelector(".switch-signal")
      ?.getAttribute("aria-label"),
  }));
  checks.push({ width, stage, largeType, ...check });
  if (
    check.overflow ||
    !check.touch ||
    check.prematureFeedback ||
    !check.attributes
  )
    throw new Error(JSON.stringify(checks.at(-1)));
  await page.screenshot({
    path: `${dir}/${width}-stage-${stage}${largeType ? "-large" : ""}.png`,
    fullPage: true,
  });
}
async function respond(page) {
  await expect(page.locator(".switch-rule")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".switch-choices")).toBeInViewport({ ratio: 1 });
  await page.clock.runFor(50);
  await page
    .locator(".switch-choices button")
    .nth(await choice(page))
    .click();
  await expect(page.locator(".switch-feedback>strong")).toHaveText("정답");
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Feedback overflow");
  completedQuestions++;
}
try {
  const desktop = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    page = await desktop.newPage();
  await freeze(page);
  for (let stage = 1; stage <= 30; stage++) {
    await open(page, stage);
    for (let round = 0; round < 20; round++) {
      if (round) await ready(page);
      await page
        .getByRole("button", { name: "문항 시작", exact: true })
        .click();
      if (round === 0) {
        await inspect(page, 1280, stage);
        if (stage === 26)
          await page.screenshot({
            path: "docs/games/switch-desktop.png",
            fullPage: true,
          });
      }
      await respond(page);
      await page
        .getByRole("button", {
          name: round === 19 ? "결과 확인" : "다음 문항",
          exact: true,
        })
        .click();
    }
    await expect(page.locator(".result-score")).toContainText("10,000");
    await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
    if (stage % 5 === 0) console.log(`Completed ${stage}/30 stages`);
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
  if (
    records.length !== 30 ||
    records.some(
      (r) => r.answers.length !== 20 || r.answers.some((a) => !a.correct),
    )
  )
    throw new Error("Saved 20-answer records mismatch");
  await desktop.close();
  for (const width of [360, 768]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
      }),
      page = await context.newPage();
    await freeze(page);
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
      await page
        .getByRole("button", { name: "문항 시작", exact: true })
        .click();
      await inspect(page, width, stage);
      if (width === 360 && stage === 30) {
        await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
        await page.evaluate(() =>
          localStorage.setItem("brain-large-type", "true"),
        );
        await page.reload();
        await page
          .getByRole("button", { name: "새 자극으로 이어가기" })
          .click();
        await ready(page);
        await page
          .getByRole("button", { name: "문항 시작", exact: true })
          .click();
        await inspect(page, width, stage, true);
        await page.screenshot({
          path: "docs/games/switch-mobile.png",
          fullPage: true,
        });
      }
      await respond(page);
      if (width === 360 && stage === 30) {
        // Keep large text on while checking all three rules, including the longer tone labels.
        for (let round = 1; round < 5; round++) {
          await page
            .getByRole("button", { name: "다음 문항", exact: true })
            .click();
          await ready(page);
          await page
            .getByRole("button", { name: "문항 시작", exact: true })
            .click();
          await respond(page);
        }
      }
    }
    await context.close();
  }
  // Adjusted timing is explicit in the product and persisted as untimed practice.
  const practice = await browser.newPage();
  await freeze(practice);
  await open(practice, 1, "practice");
  await practice
    .getByRole("button", { name: "문항 시작", exact: true })
    .click();
  await practice.clock.runFor(60000);
  await expect(practice.locator(".experiment")).toHaveAttribute(
    "data-phase",
    "question",
  );
  await expect(practice.getByRole("timer")).toContainText("시간 제한 없음");
  await practice.close();
  if (errors.length) throw new Error(errors.join("\n"));
  fs.writeFileSync(
    `${dir}/audit.json`,
    JSON.stringify(
      {
        checks,
        completedQuestions,
        savedStages: records.length,
        errors,
        clock: "Playwright clock emulation; native timeout also covered in E2E",
      },
      null,
      2,
    ),
  );
  console.log(
    `Switch production audit passed: ${checks.length} input screen states, ${completedQuestions} correct answers, 30 saved stages.`,
  );
} finally {
  await browser.close();
}
