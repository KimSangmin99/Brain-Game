import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { NextRequest } from "next/server.js";
import {
  ARRANGEMENT_ITEMS,
  arrangementConfig,
  arrangementExample,
  arrangementSolutions,
} from "../src/lib/arrangement-content";
import {
  makeArrangementAttempt,
  reduceArrangement,
} from "../src/lib/arrangement";
import { testDatabase } from "../src/test/database";
import { handle } from "../src/server/http";
async function visibleSolution(page: Page) {
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
  const perm = (items: number[]): number[][] =>
    items.length
      ? items.flatMap((n, i) =>
          perm(items.filter((_, j) => j !== i)).map((p) => [n, ...p]),
        )
      : [[]];
  // Derive the answer from rendered public conditions, independently of the game's validator.
  const solutions = perm(Array.from({ length: size }, (_, i) => i)).filter(
    (p) =>
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
  expect(solutions).toHaveLength(1);
  return solutions[0];
}
async function place(page: Page, layout: number[], keyboard = false) {
  for (let slot = 0; slot < layout.length; slot++) {
    if (keyboard) {
      await page.keyboard.press(String(layout[slot] + 1));
      await page.locator(".arrangement-slot").nth(slot).focus();
      await page.keyboard.press("Enter");
    } else {
      await page
        .getByRole("button", {
          name: `${ARRANGEMENT_ITEMS[layout[slot]].name} 선택 (${layout[slot] + 1})`,
          exact: true,
        })
        .click();
      await page.locator(".arrangement-slot").nth(slot).click();
    }
  }
}
async function start(page: Page) {
  await page.goto("/games/arrangement/play?stage=1");
  await page.getByRole("button", { name: "배치 예제로 익히기" }).click();
  await place(page, await visibleSolution(page));
  await page
    .getByRole("button", { name: "예제 조건 확인", exact: true })
    .click();
  await page.getByRole("button", { name: "예제 완료 · 배열 시작" }).click();
}
async function solve(page: Page) {
  await place(page, await visibleSolution(page));
  await expect(
    page.locator(".arrangement-clues .satisfied,.arrangement-clues .violated"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "배치 확정", exact: true }).click();
  await expect(page.locator(".result-panel")).toBeVisible();
}
test("arrangement solves from public conditions, saves one result and unlocks only its own stage", async ({
  page,
}) => {
  await page.goto("/games");
  await page.getByRole("button", { name: "논리", exact: true }).click();
  await page.getByRole("link", { name: /조건 배열/ }).click();
  await expect(page.getByRole("link", { name: "스테이지 1 도전" })).toBeVisible(
    { timeout: 15000 },
  );
  await start(page);
  await expect(
    page.getByRole("button", { name: "배치 확정", exact: true }),
  ).toBeDisabled();
  await solve(page);
  await expect(page.locator(".result-score")).toContainText("10,000");
  await expect(page.locator(".result-facts")).toContainText("도움 없이 해결");
  await expect(page.locator(".arrangement-review")).toContainText("정해져요");
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.getByRole("link", { name: "내 기록 보기", exact: true }).click();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await expect(page.locator(".record-card")).toContainText(
    "1회 확인 · 배열 성공",
  );
  await page.reload();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "조건 배열 이어하기" }),
  ).toHaveAttribute("href", "/games/arrangement/play?stage=2&mode=stage");
  await expect(page.locator(".hero-caption")).toContainText("배열 퍼즐 1개");
  for (const game of ["pattern", "sequence", "rule", "code"]) {
    await page.goto(`/games/${game}/play?stage=2`);
    await expect(
      page.getByRole("heading", { name: "아직 열리지 않은 단계예요." }),
    ).toBeVisible();
  }
});
test("mobile keyboard, drag swaps, correction feedback and hints persist without exposing correctness while editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() =>
    localStorage.setItem("brain-large-type", "true"),
  );
  await start(page);
  // Identity is the tutorial layout and is deliberately excluded from scored puzzles.
  await place(page, [0, 1, 2], true);
  await page.getByRole("button", { name: "배치 확정", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "다시 확인할 조건이 있어요." }),
  ).toBeVisible();
  await expect(
    page.locator(".arrangement-clues .violated").first(),
  ).toContainText("현재 자리");
  const before = await page.locator(".arrangement-clues").innerText();
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.reload();
  await page.getByRole("button", { name: "이 배치로 이어가기" }).click();
  expect(await page.locator(".arrangement-clues").innerText()).toBe(before);
  await page.getByRole("button", { name: "배치 수정하기" }).click();
  await expect(page.locator(".arrangement-condition-status")).toHaveCount(0);
  await page
    .locator(".arrangement-palette button")
    .nth(0)
    .dragTo(page.locator(".arrangement-slot").nth(1));
  await expect(page.locator(".arrangement-slot").nth(0)).toHaveAttribute(
    "data-item",
    "1",
  );
  await expect(page.locator(".arrangement-slot").nth(1)).toHaveAttribute(
    "data-item",
    "0",
  );
  await page.locator(".arrangement-slot").nth(1).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".arrangement-slot").nth(2)).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(page.locator(".arrangement-slot").nth(2)).toHaveAttribute(
    "data-item",
    "",
  );
  await page.getByRole("button", { name: "모두 비우기", exact: true }).click();
  await page.getByRole("button", { name: "전략 힌트 보기" }).click();
  await page.getByRole("button", { name: "조건 힌트 더 보기" }).click();
  await expect(page.locator(".arrangement-clues .highlighted")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await solve(page);
  await expect(page.locator(".result-score")).toContainText("10,000");
  await expect(page.locator(".result-facts")).toContainText("도움과 함께");
  await expect(page.locator(".result-facts")).toContainText("2회");
});
test("six people fit a narrow large-text board and unfinished edits survive refresh, reveal gives zero", async ({
  page,
}) => {
  const records = [];
  for (let stage = 1; stage < 30; stage++) {
    let a = makeArrangementAttempt(stage);
    if (arrangementConfig(stage).requiresTutorial) {
      a = reduceArrangement(a, { type: "tutorial" });
      for (const [slot, item] of arrangementSolutions(
        arrangementExample(stage),
      )[0].entries())
        a = reduceArrangement(a, { type: "move", item, slot });
      a = reduceArrangement(a, { type: "confirm" });
    }
    a = reduceArrangement(a, { type: "start" });
    for (const [slot, item] of arrangementSolutions(a.question)[0].entries())
      a = reduceArrangement(a, { type: "move", item, slot });
    records.push(reduceArrangement(a, { type: "confirm" }));
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
  await page.goto("/games/arrangement/play?stage=30");
  await page
    .getByRole("button", { name: "바로 도전하기", exact: true })
    .click();
  await expect(page.locator(".arrangement-slot")).toHaveCount(6);
  const conditions = await page.locator(".arrangement-clues").innerText();
  await page.keyboard.press("6");
  await page.locator(".arrangement-slot").nth(4).click();
  await expect(page.locator(".arrangement-slot").nth(4)).toHaveAttribute(
    "data-item",
    "5",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const sizes = await page
    .locator(".arrangement-slot,.arrangement-palette button")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        w: n.getBoundingClientRect().width,
        h: n.getBoundingClientRect().height,
      })),
    );
  expect(sizes.every((s) => s.w >= 44 && s.h >= 44)).toBe(true);
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.reload();
  await page.getByRole("button", { name: "이 배치로 이어가기" }).click();
  await expect(page.locator(".arrangement-slot").nth(4)).toHaveAttribute(
    "data-item",
    "5",
  );
  expect(await page.locator(".arrangement-clues").innerText()).toBe(conditions);
  await page.locator(".arrangement-end-options summary").click();
  await page
    .getByRole("button", { name: "풀이 확인하고 종료", exact: true })
    .click();
  await expect(page.locator(".result-score")).toContainText("0");
  await expect(page.locator(".arrangement-solution")).toBeVisible();
  await expect(page.getByRole("link", { name: "다음 스테이지" })).toHaveCount(
    0,
  );
  await expect(page.locator(".arrangement-review")).toContainText(
    "풀이 배치의 조건 확인",
  );
});
test("corrected arrangement result syncs full score and assistance to account and a second browser", async ({
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
      .fill("arrangement_user");
    await page
      .getByLabel("비밀번호", { exact: true })
      .fill("arrangement account passphrase 2026!");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "회원가입", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "연구원의 연구실" }),
    ).toBeVisible();
    await start(page);
    await place(page, [0, 1, 2]);
    await page.getByRole("button", { name: "배치 확정", exact: true }).click();
    await page.getByRole("button", { name: "배치 수정하기" }).click();
    await solve(page);
    await expect(
      page.getByText("계정에 완료 기록이 저장됐습니다."),
    ).toBeVisible();
    expect(
      await fixture.db.query(
        "SELECT game_id,score,assisted,imported,rules_version FROM app_private.attempts",
      ),
    ).toEqual([
      {
        game_id: "arrangement",
        score: 10000,
        assisted: true,
        imported: true,
        rules_version: "arrangement-v1",
      },
    ]);
    expect(
      await fixture.db.query(
        "SELECT game_id,completed_stages FROM app_private.progress",
      ),
    ).toEqual([{ game_id: "arrangement", completed_stages: [1] }]);
    other = await browser.newContext();
    await wire(other);
    const device = await other.newPage();
    await device.goto("/login");
    await device
      .getByLabel("로그인 ID", { exact: true })
      .fill("arrangement_user");
    await device
      .getByLabel("비밀번호", { exact: true })
      .fill("arrangement account passphrase 2026!");
    await device.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(
      device.getByRole("heading", { name: "연구원의 연구실" }),
    ).toBeVisible();
    await device.goto("/records");
    await expect(device.locator(".record-card")).toHaveCount(1);
    await expect(device.locator(".record-card")).toContainText(
      "2회 확인 · 배열 성공",
    );
    await expect(device.locator(".record-card")).toContainText("힌트 사용");
    await device.goto("/games/arrangement");
    await expect(
      device.getByRole("link", { name: "스테이지 2 도전" }),
    ).toBeVisible();
  } finally {
    await other?.close();
    await fixture.engine.close();
  }
});
