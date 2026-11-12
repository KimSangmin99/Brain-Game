import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.env.CODE_BASE_URL || "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Synthetic records are for local auditing only.");
fs.mkdirSync("test-results/code-production", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [];
const checks = [];
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.evaluate(async () => {
      const rows = [];
      for (let stage = 1; stage < 30; stage++) {
        const length = stage <= 10 ? 3 : stage <= 25 ? 4 : 5;
        const secret = Array.from({ length }, (_, i) => i);
        const now = Date.now() - 1000;
        rows.push({
          id: crypto.randomUUID(),
          version: "code-v1",
          stage,
          mode: "stage",
          phase: "result",
          secret,
          draft: secret,
          cursor: length - 1,
          guesses: [{ symbols: secret, exact: length, misplaced: 0 }],
          answers: [{ correct: true }],
          endReason: "solved",
          revealed: false,
          hintLevel: 0,
          assisted: false,
          interrupted: false,
          tutorialPassed: true,
          createdAt: now,
          updatedAt: now,
          revision: 1,
        });
      }
      await new Promise((resolve, reject) => {
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
      });
    });
    for (const stage of [1, 5, 6, 11, 16, 21, 26, 30]) {
      await page.goto(`${base}/games/code/play?stage=${stage}`);
      const direct = page.getByRole("button", {
        name: "바로 도전하기",
        exact: true,
      });
      await page.getByRole("button", { name: "단서 예제 확인" }).waitFor();
      if (await direct.count()) await direct.click();
      else {
        await page.getByRole("button", { name: "단서 예제 확인" }).click();
        await page
          .getByRole("button", {
            name: `위치 1 · 기호 ${stage <= 10 ? 1 : 2}`,
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: "예제 완료 · 코드 해독 시작" })
          .click();
      }
      await page.locator(".code-slot").first().waitFor();
      const length = stage <= 10 ? 3 : stage <= 25 ? 4 : 5,
        repeats = stage >= 21;
      const symbols = repeats
        ? [0, 1, 0, 2, ...(length === 5 ? [3] : [])]
        : Array.from({ length }, (_, i) => i);
      for (let i = 0; i < symbols.length; i++) {
        await page.locator(".code-slot").nth(i).click();
        await page.locator(".code-palette button").nth(symbols[i]).click();
      }
      await page
        .getByRole("button", { name: "추측 제출", exact: true })
        .click();
      await page.locator(".code-history li").waitFor();
      await page.getByRole("button", { name: "전략 힌트 보기" }).click();
      const check = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        touch: [
          ...document.querySelectorAll(".code-slot,.code-palette button"),
        ].every((e) => {
          const r = e.getBoundingClientRect();
          return r.width >= 44 && r.height >= 44;
        }),
        secret: !!document.querySelector(".code-solution"),
      }));
      checks.push({ width, stage, ...check });
      if (check.overflow || !check.touch || check.secret)
        throw new Error(JSON.stringify(checks.at(-1)));
      await page.screenshot({
        path: `test-results/code-production/${width}-stage-${stage}.png`,
        fullPage: true,
      });
      if (width === 1280 && stage === 21)
        await page.screenshot({
          path: "docs/games/code-desktop.png",
          fullPage: true,
        });
      if (width === 360 && stage === 30) {
        await page.evaluate(() =>
          localStorage.setItem("brain-large-type", "true"),
        );
        await page.reload();
        await page.getByRole("button", { name: "이 코드로 이어가기" }).click();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        );
        if (overflow) throw new Error("Large type overflow");
        await page.screenshot({
          path: "docs/games/code-mobile.png",
          fullPage: true,
        });
        checks.push({ width, stage, largeType: true, overflow });
      }
      await page.locator(".code-end-options summary").click();
      await page
        .getByRole("button", { name: "풀이 확인하고 종료", exact: true })
        .click();
      await page.locator(".code-solution").waitFor();
    }
    await context.close();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  fs.writeFileSync(
    "test-results/code-production/audit.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    `Code production audit passed: ${checks.length} screen states, no horizontal overflow or runtime errors.`,
  );
} finally {
  await browser.close();
}
