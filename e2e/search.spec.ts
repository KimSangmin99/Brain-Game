import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { NextRequest } from "next/server.js";
import { makeSearchAttempt, reduceSearch } from "../src/lib/search";
import {
  searchConfig,
  searchExample,
  searchTargets,
} from "../src/lib/search-content";
import { testDatabase } from "../src/test/database";
import { handle } from "../src/server/http";
async function visibleBoard(page: Page) {
  const goal = page.locator(".search-goal"),
    rawShape = await goal.getAttribute("data-target-shape"),
    rawMark = await goal.getAttribute("data-target-mark"),
    shape = rawShape ? Number(rawShape) : null,
    mark = rawMark ? Number(rawMark) : null;
  const cells = await page.locator(".search-cell").evaluateAll((nodes) =>
    nodes.map((n) => ({
      cell: Number(n.getAttribute("data-cell")),
      shape: Number(n.getAttribute("data-shape")),
      mark: Number(n.getAttribute("data-mark")),
    })),
  );
  // Match only the visible goal and visible symbol properties, not answer keys or saved state.
  const targets = cells
    .filter(
      (c) =>
        (shape === null || c.shape === shape) &&
        (mark === null || c.mark === mark),
    )
    .map((c) => c.cell);
  return {
    targets,
    cells,
    fingerprint: JSON.stringify({ shape, mark, cells }),
  };
}
async function select(page: Page, cells: number[], keyboard = false) {
  const clear = page.getByRole("button", {
    name: "선택 모두 해제",
    exact: true,
  });
  if (await clear.isEnabled()) await clear.click();
  for (const cell of cells) {
    const button = page.locator(`.search-cell[data-cell="${cell}"]`);
    if (keyboard) {
      await button.focus();
      await page.keyboard.press("Space");
    } else await button.click();
  }
}
async function start(page: Page) {
  await page.goto("/games/search/play?stage=1");
  await page.getByRole("button", { name: "탐색 예제로 익히기" }).click();
  await select(page, (await visibleBoard(page)).targets);
  await page
    .getByRole("button", { name: "예제 조건 확인", exact: true })
    .click();
  await page.getByRole("button", { name: "예제 완료 · 탐색 시작" }).click();
}
async function confirm(page: Page) {
  await expect(
    page.locator(
      ".search-cell.correct-selected,.search-cell.missed,.search-cell.false-positive",
    ),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^선택 확정 \(/ }).click();
  await expect(page.locator(".search-feedback")).toBeVisible();
}
async function complete(page: Page, firstFalsePositive = false) {
  for (let n = 0; n < 3; n++) {
    const board = await visibleBoard(page),
      selected =
        firstFalsePositive && n === 0
          ? [
              ...board.targets,
              board.cells.find((c) => !board.targets.includes(c.cell))!.cell,
            ]
          : board.targets;
    await select(page, selected);
    await confirm(page);
    await page
      .getByRole("button", {
        name: n === 2 ? "결과 확인" : "다음 보드",
        exact: true,
      })
      .click();
  }
  await expect(page.locator(".result-panel")).toBeVisible();
}
test("search completes three boards, restores review and records, and unlocks only its own stage", async ({
  page,
}) => {
  await page.goto("/games");
  await page.getByRole("button", { name: "주의·판단", exact: true }).click();
  await page.getByRole("link", { name: /신호 탐색/ }).click();
  await expect(page.getByRole("link", { name: "스테이지 1 도전" })).toBeVisible(
    { timeout: 15000 },
  );
  await start(page);
  await expect(
    page.getByRole("button", { name: "선택 확정 (0개)", exact: true }),
  ).toBeEnabled();
  await complete(page);
  await expect(page.locator(".result-score")).toContainText("10,000");
  await expect(page.locator(".result-facts")).toContainText("도움 없이 통과");
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page
    .getByRole("button", { name: "보드 2 · 10,000점", exact: true })
    .click();
  await expect(page.locator(".search-cell.correct-selected")).toHaveCount(2);
  await page.getByRole("link", { name: "내 기록 보기", exact: true }).click();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await expect(page.locator(".record-card")).toContainText("3/3 완벽 보드");
  await page.reload();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "신호 탐색 이어하기" }),
  ).toHaveAttribute("href", "/games/search/play?stage=2&mode=stage");
  await expect(page.locator(".hero-caption")).toContainText("탐색 보드 3개");
  for (const game of [
    "pattern",
    "sequence",
    "rule",
    "code",
    "arrangement",
    "route",
  ]) {
    await page.goto(`/games/${game}/play?stage=2`);
    await expect(
      page.getByRole("heading", { name: "아직 열리지 않은 단계예요." }),
    ).toBeVisible();
  }
});
test("mobile selection and keyboard expose no answers until confirm; interruption replaces only the unfinished board", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() =>
    localStorage.setItem("brain-large-type", "true"),
  );
  await start(page);
  await page.locator(".search-cell").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".search-cell").nth(1)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.locator(".search-cell").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Space");
  await expect(page.locator(".search-cell").nth(1)).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const first = await visibleBoard(page),
    wrong = first.cells.find((c) => !first.targets.includes(c.cell))!.cell;
  await select(page, [...first.targets, wrong], true);
  await page.getByRole("button", { name: "전략 힌트 보기" }).click();
  await page.getByRole("button", { name: "탐색 구간 힌트 보기" }).click();
  await expect(page.locator(".search-cell.hint-region")).toHaveCount(3);
  await expect(
    page.locator(
      ".search-cell.correct-selected,.search-cell.missed,.search-cell.false-positive",
    ),
  ).toHaveCount(0);
  await confirm(page);
  await expect(page.locator(".search-board-score")).toContainText("5,000");
  await expect(page.locator(".search-cell.false-positive")).toHaveCount(1);
  await page.locator(".search-cell-explanations summary").click();
  await expect(page.locator(".search-cell-explanations")).toContainText(
    "조건과 달라요",
  );
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.reload();
  expect((await visibleBoard(page)).fingerprint).toBe(first.fingerprint);
  await expect(page.locator(".search-board-score")).toContainText("5,000");
  await page.getByRole("button", { name: "다음 보드", exact: true }).click();
  const old = await visibleBoard(page);
  await page.locator(`.search-cell[data-cell="${old.targets[0]}"]`).click();
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "잠시 멈췄어요." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "새 탐색판으로 이어가기" }).click();
  expect((await visibleBoard(page)).fingerprint).not.toBe(old.fingerprint);
  await expect(page.locator(".search-cell.selected")).toHaveCount(0);
  await expect(page.locator(".search-cell.hint-region")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (let n = 1; n < 3; n++) {
    await select(page, (await visibleBoard(page)).targets);
    await confirm(page);
    await page
      .getByRole("button", {
        name: n === 2 ? "결과 확인" : "다음 보드",
        exact: true,
      })
      .click();
  }
  await expect(page.locator(".result-score")).toContainText("8,333");
  await expect(page.locator(".result-facts")).toContainText("도움과 함께");
  await expect(page.getByRole("link", { name: "다음 스테이지" })).toBeVisible();
  await page
    .getByRole("button", { name: "보드 1 · 5,000점", exact: true })
    .click();
  await expect(page.locator(".search-cell.false-positive")).toHaveCount(1);
});
test("five by five large-text search penalizes selecting every cell and gives revealed or skipped boards zero", async ({
  page,
}) => {
  test.setTimeout(60000);
  const records = [];
  for (let stage = 1; stage < 30; stage++) {
    let a = makeSearchAttempt(stage);
    if (searchConfig(stage).requiresTutorial) {
      a = reduceSearch(a, { type: "tutorial" });
      for (const cell of searchTargets(searchExample(stage)))
        a = reduceSearch(a, { type: "toggle", cell });
      a = reduceSearch(a, { type: "confirm" });
    }
    a = reduceSearch(a, { type: "start" });
    for (let i = 0; i < 3; i++) {
      for (const cell of searchTargets(a.questions[i]))
        a = reduceSearch(a, { type: "toggle", cell });
      a = reduceSearch(a, { type: "confirm" });
      a = reduceSearch(a, { type: "next" });
    }
    records.push(a);
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
        rows.forEach((r) => tx.objectStore("attempts").put(r));
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, records);
  await page.goto("/games/search/play?stage=30");
  await page
    .getByRole("button", { name: "바로 도전하기", exact: true })
    .click();
  await expect(page.locator(".search-cell")).toHaveCount(25);
  await select(
    page,
    Array.from({ length: 25 }, (_, i) => i),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const sizes = await page.locator(".search-cell").evaluateAll((nodes) =>
    nodes.map((n) => ({
      w: n.getBoundingClientRect().width,
      h: n.getBoundingClientRect().height,
    })),
  );
  expect(sizes.every((s) => s.w >= 44 && s.h >= 44)).toBe(true);
  await confirm(page);
  await expect(page.locator(".search-board-score")).toContainText("0점");
  await expect(page.locator(".search-cell.false-positive")).toHaveCount(19);
  await expect(page.locator(".search-cell.correct-selected")).toHaveCount(6);
  await page.getByRole("button", { name: "다음 보드", exact: true }).click();
  await page.locator(".search-end-options summary").click();
  await page
    .getByRole("button", { name: "이번 보드 풀이 확인", exact: true })
    .click();
  await expect(page.locator(".search-board-score")).toContainText("0점");
  await expect(page.locator(".search-cell.missed")).toHaveCount(6);
  await page.getByRole("button", { name: "다음 보드", exact: true }).click();
  await page
    .getByRole("button", { name: "이번 보드 건너뛰기", exact: true })
    .click();
  await page.getByRole("button", { name: "결과 확인", exact: true }).click();
  await expect(page.locator(".result-score")).toContainText("0");
  await expect(page.locator(".result-facts")).toContainText("다시 연습해 봐요");
  await page.goto("/games/search");
  await expect(page.getByText("29 / 30 완료", { exact: true })).toBeVisible();
});
test("search aggregate score and three-answer record sync through account handling and another browser", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(60000);
  const fixture = await testDatabase();
  let other: BrowserContext | undefined;
  async function wire(ctx: BrowserContext) {
    await ctx.route("**/api/v1/**", async (route) => {
      const req = route.request(),
        response = await handle(
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
    await page
      .getByLabel("로그인 ID", { exact: true })
      .fill("search_researcher");
    await page
      .getByLabel("비밀번호", { exact: true })
      .fill("search account passphrase 2026!");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "회원가입", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "연구원의 연구실" }),
    ).toBeVisible();
    await start(page);
    await complete(page, true);
    await expect(page.locator(".result-score")).toContainText("8,333");
    await expect(
      page.getByText("계정에 완료 기록이 저장됐습니다."),
    ).toBeVisible();
    expect(
      await fixture.db.query(
        "SELECT game_id,score,assisted,imported,rules_version FROM app_private.attempts",
      ),
    ).toEqual([
      {
        game_id: "search",
        score: 8333,
        assisted: false,
        imported: true,
        rules_version: "search-v1",
      },
    ]);
    expect(
      await fixture.db.query(
        "SELECT game_id,completed_stages FROM app_private.progress",
      ),
    ).toEqual([{ game_id: "search", completed_stages: [1] }]);
    other = await browser.newContext();
    await wire(other);
    const device = await other.newPage();
    await device.goto("/login");
    await device
      .getByLabel("로그인 ID", { exact: true })
      .fill("search_researcher");
    await device
      .getByLabel("비밀번호", { exact: true })
      .fill("search account passphrase 2026!");
    await device.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(
      device.getByRole("heading", { name: "연구원의 연구실" }),
    ).toBeVisible();
    await device.goto("/records");
    await expect(device.locator(".record-card")).toHaveCount(1);
    await expect(device.locator(".record-card")).toContainText("2/3 완벽 보드");
    await expect(device.locator(".record-card")).toContainText("오선택 1");
    await expect(device.locator(".record-score strong")).toContainText("8,333");
    await device.goto("/games/search");
    await expect(
      device.getByRole("link", { name: "스테이지 2 도전" }),
    ).toBeVisible();
  } finally {
    await other?.close();
    await fixture.engine.close();
  }
});
