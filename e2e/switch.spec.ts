import { test, expect, type BrowserContext } from "@playwright/test";
import { NextRequest } from "next/server.js";
import { testDatabase } from "../src/test/database";
import { handle } from "../src/server/http";
import {
  freezeSwitchClock,
  startSwitch,
  completeSwitch,
  waitSwitchReady,
  visibleSwitchChoice,
  switchFixture,
} from "./switch-helpers";
test("switch completes 20 questions, restores its records, and unlocks only its own stage", async ({
  page,
}) => {
  test.setTimeout(60000);
  await freezeSwitchClock(page);
  await startSwitch(page);
  await completeSwitch(page);
  await expect(page.locator(".result-score")).toContainText("10,000");
  await expect(page.locator(".result-facts")).toContainText("도움 없이 통과");
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await expect(
    page.getByRole("navigation", { name: "주 메뉴", exact: true }),
  ).toBeVisible();
  await page.locator(".switch-review summary").click();
  await expect(page.locator(".switch-review article")).toHaveCount(20);
  await page.getByRole("link", { name: "내 기록 보기", exact: true }).click();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await expect(page.locator(".record-card")).toContainText("20/20 정답");
  await page.reload();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "룰 스위치 이어하기" }),
  ).toHaveAttribute("href", "/games/switch/play?stage=2&mode=stage");
  await expect(page.locator(".hero-caption")).toContainText("20문항");
  for (const game of [
    "pattern",
    "sequence",
    "rule",
    "code",
    "arrangement",
    "route",
    "search",
  ]) {
    await page.goto(`/games/${game}/play?stage=2`);
    await expect(
      page.getByRole("heading", { name: "아직 열리지 않은 단계예요." }),
    ).toBeVisible();
  }
});
test("mobile timing gates, single key response, hints, saved feedback and exposed replacement", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() =>
    localStorage.setItem("brain-large-type", "true"),
  );
  await freezeSwitchClock(page);
  await startSwitch(page);
  await expect(page.locator(".switch-signal")).toHaveCount(0);
  await page.keyboard.press("1");
  await expect(page.locator(".experiment")).toHaveAttribute(
    "data-phase",
    "ready",
  );
  await page.getByRole("button", { name: "전략 힌트 보기" }).click();
  await page.getByRole("button", { name: "응답 기준 힌트 보기" }).click();
  await page.getByRole("button", { name: "문항 시작", exact: true }).dblclick();
  await expect(page.locator(".experiment")).toHaveAttribute(
    "data-phase",
    "question",
  );
  const choice = await visibleSwitchChoice(page);
  await page.clock.runFor(4999);
  await page.keyboard.press(String(choice + 1));
  await expect(page.locator(".switch-feedback")).toContainText("정답");
  await page.clock.runFor(10000);
  await expect(page.locator(".switch-feedback")).toContainText("정답");
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.reload();
  await expect(page.locator(".switch-feedback")).toContainText("정답");
  await page.getByRole("button", { name: "다음 문항", exact: true }).click();
  await expect(page.locator(".switch-signal")).toHaveCount(0);
  await page.clock.runFor(499);
  await expect(page.locator(".experiment")).toHaveAttribute(
    "data-phase",
    "gap",
  );
  await page.clock.runFor(1);
  await expect(page.locator(".experiment")).toHaveAttribute(
    "data-phase",
    "ready",
  );
  await page.getByRole("button", { name: "문항 시작", exact: true }).click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "1", repeat: true }),
    ),
  );
  await expect(page.locator(".experiment")).toHaveAttribute(
    "data-phase",
    "question",
  );
  await page.clock.runFor(5000);
  await expect(page.locator(".switch-feedback")).toContainText("시간 초과");
  await expect(page.locator(".switch-feedback")).toContainText("응답 없음");
  await page.getByRole("button", { name: "다음 문항", exact: true }).click();
  await waitSwitchReady(page);
  await page.getByRole("button", { name: "문항 시작", exact: true }).click();
  const old = await page.locator(".switch-signal").getAttribute("aria-label");
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "잠시 멈췄어요." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "새 자극으로 이어가기" }).click();
  await waitSwitchReady(page);
  await page.getByRole("button", { name: "문항 시작", exact: true }).click();
  expect(
    await page.locator(".switch-signal").getAttribute("aria-label"),
  ).not.toBe(old);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const boxes = await page
    .locator(".switch-choices button")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        w: n.getBoundingClientRect().width,
        h: n.getBoundingClientRect().height,
      })),
    );
  expect(boxes.every((b) => b.w >= 44 && b.h >= 44)).toBe(true);
  await expect
    .poll(() =>
      page.locator(".switch-rule,.switch-choices").evaluateAll((nodes) =>
        nodes.every((n) => {
          const r = n.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight;
        }),
      ),
    )
    .toBe(true);
});
test("three-rule stage changes every two questions and practice is untimed without progress", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  await freezeSwitchClock(page);
  await page.goto("/");
  const rows = Array.from({ length: 29 }, (_, i) => switchFixture(i + 1));
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
        rows.forEach((r) => tx.objectStore("attempts").put(r));
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, rows);
  await page.setViewportSize({ width: 360, height: 800 });
  await startSwitch(page, 30);
  const rules: string[] = [];
  for (let i = 0; i < 5; i++) {
    if (i) await waitSwitchReady(page);
    rules.push((await page.locator(".switch-rule").getAttribute("data-rule"))!);
    await page.getByRole("button", { name: "문항 시작", exact: true }).click();
    await page.getByRole("button", { name: "이번 문항 건너뛰기" }).click();
    await page.getByRole("button", { name: "다음 문항", exact: true }).click();
    await page.clock.runFor(500);
    await expect(page.locator(".experiment")).toHaveAttribute(
      "data-phase",
      (i + 1) % 2 === 0 ? "cue" : "ready",
    );
    if ((i + 1) % 2 === 0) {
      await expect(page.locator(".switch-signal")).toHaveCount(0);
      await page.clock.runFor(999);
      await expect(page.locator(".experiment")).toHaveAttribute(
        "data-phase",
        "cue",
      );
      await page.clock.runFor(1);
    }
  }
  expect(rules).toEqual(["shape", "shape", "tone", "tone", "direction"]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/games/switch/play?stage=30&mode=practice");
  await page
    .getByRole("button", { name: "바로 도전하기", exact: true })
    .click();
  await waitSwitchReady(page);
  await page.getByRole("button", { name: "문항 시작", exact: true }).click();
  await page.clock.runFor(60000);
  await expect(page.locator(".experiment")).toHaveAttribute(
    "data-phase",
    "question",
  );
  await expect(page.getByRole("timer")).toContainText("시간 제한 없음");
  // A fresh guest has no prior stages to hide a practice/progress regression.
  const practiceContext = await browser.newContext();
  try {
    page = await practiceContext.newPage();
    await freezeSwitchClock(page);
    await page.goto("/games/switch/play?stage=1&mode=practice");
    await page.getByRole("button", { name: "지시 예제로 익히기" }).click();
    await page
      .locator(".switch-choices button")
      .nth(await visibleSwitchChoice(page))
      .click();
    await page.getByRole("button", { name: "예제 완료 · 도전 시작" }).click();
    await waitSwitchReady(page);
    await completeSwitch(page);
    await expect(page.locator(".result-panel")).toContainText(
      "자유 연습은 단계 개방에 반영되지 않아요.",
    );
    await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
    await page.goto("/games/switch/play?stage=2");
    await expect(
      page.getByRole("heading", { name: "아직 열리지 않은 단계예요." }),
    ).toBeVisible();
  } finally {
    await practiceContext.close();
  }
});
test("16 correct and four timeouts sync as 8000 points and 20 answers through account HTTP and another browser", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(90000);
  const fixture = await testDatabase();
  let other: BrowserContext | undefined;
  async function wire(ctx: BrowserContext) {
    await ctx.route("**/api/v1/**", async (route) => {
      const req = route.request(),
        res = await handle(
          new NextRequest(req.url(), {
            method: req.method(),
            headers: await req.allHeaders(),
            ...(req.method() === "POST" ? { body: req.postData() ?? "" } : {}),
          }),
          () => fixture.db,
        );
      await route.fulfill({
        status: res.status,
        headers: Object.fromEntries(res.headers),
        body: await res.text(),
      });
    });
  }
  try {
    await wire(context);
    await page.goto("/register");
    await page
      .getByLabel("로그인 ID", { exact: true })
      .fill("switch_researcher");
    await page
      .getByLabel("비밀번호", { exact: true })
      .fill("switch account passphrase 2026!");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "회원가입", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "연구원의 연구실" }),
    ).toBeVisible();
    await freezeSwitchClock(page);
    await startSwitch(page);
    await completeSwitch(page, 4);
    await expect(page.locator(".result-score")).toContainText("8,000");
    await expect(
      page.getByText("계정에 완료 기록이 저장됐습니다."),
    ).toBeVisible();
    expect(
      await fixture.db.query(
        "SELECT game_id,score,assisted,imported,rules_version FROM app_private.attempts",
      ),
    ).toEqual([
      {
        game_id: "switch",
        score: 8000,
        assisted: false,
        imported: true,
        rules_version: "switch-v1",
      },
    ]);
    expect(
      await fixture.db.query(
        "SELECT game_id,completed_stages FROM app_private.progress",
      ),
    ).toEqual([{ game_id: "switch", completed_stages: [1] }]);
    other = await browser.newContext();
    await wire(other);
    const device = await other.newPage();
    await device.goto("/login");
    await device
      .getByLabel("로그인 ID", { exact: true })
      .fill("switch_researcher");
    await device
      .getByLabel("비밀번호", { exact: true })
      .fill("switch account passphrase 2026!");
    await device.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(
      device.getByRole("heading", { name: "연구원의 연구실" }),
    ).toBeVisible();
    await device.goto("/records");
    await expect(device.locator(".record-card")).toHaveCount(1);
    await expect(device.locator(".record-card")).toContainText("16/20 정답");
    await expect(device.locator(".record-card")).toContainText("시간 초과 4");
    await expect(device.locator(".record-score strong")).toContainText("8,000");
    await device.goto("/games/switch");
    await expect(
      device.getByRole("link", { name: "스테이지 2 도전" }),
    ).toBeVisible();
  } finally {
    await other?.close();
    await fixture.engine.close();
  }
});

test("native browser clock expires a question but leaves preparation untimed", async ({
  page,
}) => {
  await page.goto("/games/switch/play?stage=1");
  await page.getByRole("button", { name: "지시 예제로 익히기" }).click();
  await page
    .locator(".switch-choices button")
    .nth(await visibleSwitchChoice(page))
    .click();
  await page.getByRole("button", { name: "예제 완료 · 도전 시작" }).click();
  await expect(page.locator(".experiment")).toHaveAttribute(
    "data-phase",
    "ready",
  );
  await expect(page.getByRole("timer")).toContainText("시작 전 · 무제한");
  await page.getByRole("button", { name: "문항 시작", exact: true }).click();
  await expect(page.locator(".switch-feedback")).toContainText("시간 초과", {
    timeout: 8000,
  });
  await expect(page.locator(".switch-feedback")).toContainText("응답 없음");
});
