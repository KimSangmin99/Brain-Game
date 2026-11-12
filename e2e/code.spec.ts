import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { NextRequest } from "next/server.js";
import {
  candidateCodes,
  codeExample,
  CODE_SYMBOLS,
  type CodeGuess,
} from "../src/lib/code-rules";
import { makeCodeAttempt, reduceCode } from "../src/lib/code";
import { testDatabase } from "../src/test/database";
import { handle } from "../src/server/http";
async function start(page: Page) {
  await page.goto("/games/code/play?stage=1");
  await expect(
    page.getByRole("button", { name: "바로 도전하기", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "단서 예제 확인" }).click();
  const e = codeExample(1);
  await page
    .getByRole("button", {
      name: `위치 ${e.exact} · 기호 ${e.misplaced}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "예제 완료 · 코드 해독 시작" })
    .click();
}
async function enter(page: Page, symbols: number[]) {
  for (let i = 0; i < symbols.length; i++) {
    await page.locator(".code-slot").nth(i).click();
    await page
      .getByRole("button", {
        name: `${CODE_SYMBOLS[symbols[i]].name} 입력 (${symbols[i] + 1})`,
        exact: true,
      })
      .click();
  }
  await page.getByRole("button", { name: "추측 제출", exact: true }).click();
}
// A solver sees only rendered guesses and feedback, never the secret or local DB.
async function solve(page: Page) {
  const history: CodeGuess[] = [];
  for (let n = 0; n < 6; n++) {
    await enter(page, candidateCodes(1, history)[0]);
    const last = page.locator(".code-history li").last();
    await expect(last).toBeVisible();
    const symbols = (await last
      .locator(".code-word")
      .getAttribute("data-symbols"))!
      .split(",")
      .map(Number);
    const exact = Number(
      await last.locator(".code-feedback").getAttribute("data-exact"),
    );
    const misplaced = Number(
      await last.locator(".code-feedback").getAttribute("data-misplaced"),
    );
    history.push({ symbols, exact, misplaced });
    if (exact === 3) {
      await expect(page.locator(".result-panel")).toBeVisible();
      return 8000 + Math.floor((2000 * (6 - history.length)) / 5);
    }
    await expect(page.getByRole("img", { name: /^코드 정답:/ })).toHaveCount(0);
  }
  throw new Error("No solution within introductory limit");
}
test("code deduction completes, records one puzzle, unlocks only its own stages and resumes from home", async ({
  page,
}) => {
  await page.goto("/games");
  await page.getByRole("button", { name: "추론", exact: true }).click();
  await page.getByRole("link", { name: /코드 브레이커/ }).click();
  await expect(page.getByRole("link", { name: "스테이지 1 도전" })).toBeVisible(
    { timeout: 15000 },
  );
  await start(page);
  await expect(
    page.getByRole("button", { name: "추측 제출", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/code-desktop.png",
    fullPage: true,
  });
  const score = await solve(page);
  await expect(page.locator(".result-score")).toContainText(
    score.toLocaleString(),
  );
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.getByRole("link", { name: "내 기록 보기", exact: true }).click();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await expect(page.locator(".record-card")).toContainText("해독 성공");
  await expect(page.locator(".record-card")).not.toContainText("/5 정답");
  await page.reload();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "코드 브레이커 이어하기" }),
  ).toHaveAttribute("href", "/games/code/play?stage=2&mode=stage");
  await expect(page.locator(".hero-caption")).toContainText("코드 1개");
  for (const id of ["pattern", "sequence", "rule"]) {
    await page.goto(`/games/${id}/play?stage=2`);
    await expect(
      page.getByRole("heading", { name: "아직 열리지 않은 단계예요." }),
    ).toBeVisible();
  }
});
test("code mobile keyboard edits, duplicate protection, hints and reload retain the same puzzle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() =>
    localStorage.setItem("brain-large-type", "true"),
  );
  await start(page);
  await page.keyboard.press("1");
  await page.keyboard.press("1");
  await expect(page.locator(".code-input-error")).toContainText(
    "중복이 없어요",
  );
  await expect(page.locator(".code-history li")).toHaveCount(0);
  await page.keyboard.press("2");
  await page.keyboard.press("3");
  await page.keyboard.press("Backspace");
  await expect(page.locator(".code-slot").nth(2)).toHaveAttribute(
    "aria-label",
    "3번째 자리, 빈칸",
  );
  await page.keyboard.press("3");
  await page.getByRole("button", { name: "추측 제출", exact: true }).click();
  // The tutorial example is excluded from generated codes, so this is not a solution.
  await expect(page.locator(".code-history li")).toHaveCount(1);
  await page.keyboard.press("1");
  const history = await page.locator(".code-history ol").innerText();
  await page.getByRole("button", { name: "전략 힌트 보기" }).click();
  await page
    .getByRole("button", { name: "남은 후보 확인", exact: true })
    .click();
  await expect(page.locator(".code-candidates")).toContainText(
    "이전 단서와 맞는 후보",
  );
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "잠시 멈췄어요." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "이 코드로 이어가기" }).click();
  expect(await page.locator(".code-history ol").innerText()).toBe(history);
  await expect(page.locator(".code-slot").first()).toHaveAttribute(
    "aria-label",
    "1번째 자리, 원",
  );
  await expect(page.locator(".code-candidates")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("img", { name: /^코드 정답:/ })).toHaveCount(0);
  await page.locator(".code-end-options summary").click();
  await page
    .getByRole("button", { name: "풀이 확인하고 종료", exact: true })
    .click();
  await expect(page.locator(".result-score")).toContainText("0");
  await expect(page.getByRole("link", { name: "다음 스테이지" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("img", { name: /^코드 정답:/ })).toBeVisible();
  expect(await page.locator(".code-history ol").innerText()).toBe(history);
});
test("five-slot repeated-symbol stage fits a 360px large-text screen and survives pause", async ({
  page,
}) => {
  const records = [];
  for (let stage = 1; stage < 30; stage++) {
    let a = makeCodeAttempt(stage);
    a = { ...a, phase: "playing", tutorialPassed: true };
    for (let i = 0; i < a.secret.length; i++) {
      a = reduceCode(a, { type: "slot", index: i });
      a = reduceCode(a, { type: "fill", symbol: a.secret[i] });
    }
    records.push(reduceCode(a, { type: "confirm" }));
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.evaluate(async (rows) => {
    localStorage.setItem("brain-large-type", "true");
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("brain-game-guest", 1);
      req.onupgradeneeded = () =>
        req.result.createObjectStore("attempts", { keyPath: "id" });
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result,
          tx = db.transaction("attempts", "readwrite");
        rows.forEach((a) => tx.objectStore("attempts").put(a));
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, records);
  await page.goto("/games/code/play?stage=30");
  await page
    .getByRole("button", { name: "바로 도전하기", exact: true })
    .click();
  await page.keyboard.press("1");
  await page.keyboard.press("1");
  await page.keyboard.press("2");
  await page.keyboard.press("2");
  await page.keyboard.press("3");
  await expect(page.locator(".code-slot").nth(0)).toHaveAttribute(
    "aria-label",
    "1번째 자리, 원",
  );
  await expect(page.locator(".code-slot").nth(1)).toHaveAttribute(
    "aria-label",
    "2번째 자리, 원",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const sizes = await page
    .locator(".code-slot,.code-palette button")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        w: n.getBoundingClientRect().width,
        h: n.getBoundingClientRect().height,
      })),
    );
  expect(sizes.every((s) => s.w >= 44 && s.h >= 44)).toBe(true);
  await page.screenshot({
    path: "test-results/code-mobile.png",
    fullPage: true,
  });
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.reload();
  await page.getByRole("button", { name: "이 코드로 이어가기" }).click();
  await expect(page.locator(".code-slot").nth(4)).toHaveAttribute(
    "aria-label",
    "5번째 자리, 사각형",
  );
});
test("code one-puzzle results sync with recomputed scores to an account and another browser", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(60000);
  const fixture = await testDatabase();
  let other: BrowserContext | undefined;
  async function wire(ctx: BrowserContext) {
    await ctx.route("**/api/v1/**", async (route) => {
      const req = route.request();
      const response = await handle(
        new NextRequest(req.url(), {
          method: req.method(),
          headers: await req.allHeaders(),
          ...(req.method() === "POST" ? { body: req.postData() ?? "" } : {}),
        }),
        () => fixture.db,
      );
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
  }
  try {
    await wire(context);
    await page.goto("/register");
    await page.getByLabel("로그인 ID", { exact: true }).fill("code_researcher");
    await page
      .getByLabel("비밀번호", { exact: true })
      .fill("code account passphrase 2026!");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "회원가입", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "연구원의 연구실" }),
    ).toBeVisible();
    await start(page);
    const score = await solve(page);
    await expect(
      page.getByText("계정에 완료 기록이 저장됐습니다."),
    ).toBeVisible();
    expect(
      await fixture.db.query(
        "SELECT game_id,score,rules_version,imported FROM app_private.attempts",
      ),
    ).toEqual([
      { game_id: "code", score, rules_version: "code-v1", imported: true },
    ]);
    expect(
      await fixture.db.query(
        "SELECT game_id,completed_stages FROM app_private.progress",
      ),
    ).toEqual([{ game_id: "code", completed_stages: [1] }]);
    other = await browser.newContext();
    await wire(other);
    const device = await other.newPage();
    await device.goto("/login");
    await device
      .getByLabel("로그인 ID", { exact: true })
      .fill("code_researcher");
    await device
      .getByLabel("비밀번호", { exact: true })
      .fill("code account passphrase 2026!");
    await device.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(
      device.getByRole("heading", { name: "연구원의 연구실" }),
    ).toBeVisible();
    await device.goto("/records");
    await expect(device.locator(".record-card")).toHaveCount(1);
    await expect(device.locator(".record-card")).toContainText("코드 브레이커");
    await expect(device.locator(".record-card")).toContainText("해독 성공");
    await device.goto("/games/code");
    await expect(
      device.getByRole("link", { name: "스테이지 2 도전" }),
    ).toBeVisible();
  } finally {
    await other?.close();
    await fixture.engine.close();
  }
});
