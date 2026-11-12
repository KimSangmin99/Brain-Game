import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { NextRequest } from "next/server.js";
import { makeRouteAttempt, reduceRoute } from "../src/lib/route";
import {
  routeConfig,
  routeExample,
  shortestRoute,
} from "../src/lib/route-content";
import { testDatabase } from "../src/test/database";
import { handle } from "../src/server/http";
async function visiblePaths(page: Page) {
  const board = page.locator(".route-board");
  const size = Number(await board.getAttribute("data-size")),
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
  const start = cells.find((c) => c.start)!.cell,
    goal = cells.find((c) => c.goal)!.cell,
    blocked = cells.filter((c) => c.wall).map((c) => c.cell),
    required = cells
      .filter((c) => c.point !== null)
      .sort((a, b) => a.point! - b.point!)
      .map((c) => c.cell);
  // Use only the rendered public map, independently of the app's solver or saved answers.
  const queue = [[start]],
    all: number[][] = [];
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i],
      at = path.at(-1)!;
    if (at === goal) {
      all.push(path);
      continue;
    }
    const row = Math.floor(at / size),
      column = at % size;
    for (const [r, c] of [
      [row + 1, column],
      [row - 1, column],
      [row, column + 1],
      [row, column - 1],
    ])
      if (r >= 0 && c >= 0 && r < size && c < size) {
        const cell = r * size + c;
        if (!blocked.includes(cell) && !path.includes(cell))
          queue.push([...path, cell]);
      }
  }
  const includes = (p: number[]) => required.every((c) => p.includes(c)),
    inOrder = (p: number[]) =>
      !ordered ||
      p.filter((c) => required.includes(c)).every((c, i) => c === required[i]);
  const valid = all
    .filter(
      (p) =>
        includes(p) && inOrder(p) && (limit === null || p.length - 1 <= limit),
    )
    .sort((a, b) => a.length - b.length);
  expect(valid.length).toBeGreaterThan(0);
  return { size, start, goal, required, limit, all, valid, includes, inOrder };
}
async function draw(page: Page, path: number[], keyboard = false) {
  const reset = page.getByRole("button", {
    name: "처음부터 다시",
    exact: true,
  });
  if (await reset.isEnabled()) await reset.click();
  const size = Number(
    await page.locator(".route-board").getAttribute("data-size"),
  );
  if (keyboard) await page.locator(".route-cell[data-current=true]").focus();
  for (let i = 1; i < path.length; i++) {
    if (keyboard) {
      const delta = path[i] - path[i - 1];
      await page.keyboard.press(
        delta === 1
          ? "ArrowRight"
          : delta === -1
            ? "ArrowLeft"
            : delta === size
              ? "ArrowDown"
              : "ArrowUp",
      );
    } else await page.locator(`.route-cell[data-cell="${path[i]}"]`).click();
    await expect(
      page.locator(`.route-cell[data-cell="${path[i]}"]`),
    ).toHaveAttribute("data-current", "true");
  }
}
async function start(page: Page) {
  await page.goto("/games/route/play?stage=1");
  await page.getByRole("button", { name: "지도 예제로 익히기" }).click();
  await draw(page, (await visiblePaths(page)).valid[0]);
  await page
    .getByRole("button", { name: "예제 조건 확인", exact: true })
    .click();
  await page.getByRole("button", { name: "예제 완료 · 경로 시작" }).click();
}
async function finish(page: Page, longer = false) {
  const maps = await visiblePaths(page),
    path = longer
      ? maps.valid.find((p) => p.length > maps.valid[0].length)!
      : maps.valid[0];
  expect(path).toBeDefined();
  await draw(page, path);
  await expect(page.locator(".route-feedback-list")).toHaveCount(0);
  await page.getByRole("button", { name: "경로 확정", exact: true }).click();
  await expect(page.locator(".result-panel")).toBeVisible();
  return {
    score:
      8000 +
      Math.floor((2000 * (maps.valid[0].length - 1)) / (path.length - 1)),
    moves: path.length - 1,
  };
}
async function selected(page: Page) {
  return page.locator(".route-cell.selected").evaluateAll((nodes) =>
    nodes
      .map((n) => ({
        cell: Number(n.getAttribute("data-cell")),
        step: Number(n.getAttribute("data-step")),
      }))
      .sort((a, b) => a.step - b.step)
      .map((n) => n.cell),
  );
}
test("route accepts a longer valid path, scores its efficiency and restores independent game progress", async ({
  page,
}) => {
  await page.goto("/games");
  await page.getByRole("button", { name: "논리", exact: true }).click();
  await page.getByRole("link", { name: /경로 설계/ }).click();
  await expect(page.getByRole("link", { name: "스테이지 1 도전" })).toBeVisible(
    { timeout: 15000 },
  );
  await start(page);
  await expect(
    page.getByRole("button", { name: "경로 확정", exact: true }),
  ).toBeDisabled();
  const r = await finish(page, true);
  expect(r.score).toBeLessThan(10000);
  await expect(page.locator(".result-score")).toContainText(
    r.score.toLocaleString(),
  );
  await expect(page.locator(".result-facts")).toContainText("도움 없이 해결");
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page
    .getByRole("button", { name: "최단 예시 경로", exact: true })
    .click();
  await expect(page.locator(".route-review .violated")).toHaveCount(0);
  await page.getByRole("link", { name: "내 기록 보기", exact: true }).click();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await expect(page.locator(".record-card")).toContainText(
    `${r.moves}회 이동 · 경로 완성`,
  );
  await page.reload();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "경로 설계 이어하기" }),
  ).toHaveAttribute("href", "/games/route/play?stage=2&mode=stage");
  await expect(page.locator(".hero-caption")).toContainText("경로 퍼즐 1개");
  for (const game of ["pattern", "sequence", "rule", "code", "arrangement"]) {
    await page.goto(`/games/${game}/play?stage=2`);
    await expect(
      page.getByRole("heading", { name: "아직 열리지 않은 단계예요." }),
    ).toBeVisible();
  }
});
test("route mobile keyboard, undo, invalid move, correction and two hints retain the same map and path", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() =>
    localStorage.setItem("brain-large-type", "true"),
  );
  await start(page);
  const map = await visiblePaths(page),
    best = map.valid[0];
  await page.locator(".route-cell[data-goal=true]").click();
  await expect(page.locator(".route-input-status")).toContainText("상하좌우");
  expect(await selected(page)).toEqual([map.start]);
  await draw(page, best.slice(0, 3), true);
  await expect(page.locator(".route-cell[data-current=true]")).toBeFocused();
  await page.keyboard.press("Backspace");
  expect(await selected(page)).toEqual(best.slice(0, 2));
  await page.getByRole("button", { name: "경로 확정", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "경로의 조건을 다시 살펴봐요." }),
  ).toBeVisible();
  const before = await page.locator(".route-feedback-list").innerText(),
    path = await selected(page);
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.reload();
  await page.getByRole("button", { name: "이 경로로 이어가기" }).click();
  expect(await selected(page)).toEqual(path);
  expect(await page.locator(".route-feedback-list").innerText()).toBe(before);
  await page.getByRole("button", { name: "경로 수정하기" }).click();
  await expect(page.locator(".route-feedback-list")).toHaveCount(0);
  await page.getByRole("button", { name: "전략 힌트 보기" }).click();
  await page.getByRole("button", { name: "다음 구간 힌트 보기" }).click();
  await expect(page.locator(".route-cell.hinted")).toHaveCount(1);
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.reload();
  await page.getByRole("button", { name: "이 경로로 이어가기" }).click();
  await expect(page.locator(".route-cell.hinted")).toHaveCount(1);
  expect(await selected(page)).toEqual(path);
  await page.locator(".route-cell[data-start=true]").click();
  expect(await selected(page)).toEqual([map.start]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await draw(page, best, true);
  await page.getByRole("button", { name: "경로 확정", exact: true }).click();
  await expect(page.locator(".result-score")).toContainText("10,000");
  await expect(page.locator(".result-facts")).toContainText("도움과 함께");
});
test("six by six large-text route checks waypoint order and upper limit; reveal remains zero", async ({
  page,
}) => {
  test.setTimeout(60000);
  const records = [];
  for (let stage = 1; stage < 30; stage++) {
    let a = makeRouteAttempt(stage);
    if (routeConfig(stage).requiresTutorial) {
      a = reduceRoute(a, { type: "tutorial" });
      for (const cell of shortestRoute(routeExample(stage))!.slice(1))
        a = reduceRoute(a, { type: "cell", cell });
      a = reduceRoute(a, { type: "confirm" });
    }
    a = reduceRoute(a, { type: "start" });
    for (const cell of shortestRoute(a.question)!.slice(1))
      a = reduceRoute(a, { type: "cell", cell });
    records.push(reduceRoute(a, { type: "confirm" }));
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
  await page.goto("/games/route/play?stage=30");
  await page
    .getByRole("button", { name: "바로 도전하기", exact: true })
    .click();
  const map = await visiblePaths(page);
  await expect(page.locator(".route-cell")).toHaveCount(36);
  const wrong = map.all.find((p) => map.includes(p) && !map.inOrder(p))!;
  await draw(page, wrong);
  await page.getByRole("button", { name: "경로 확정", exact: true }).click();
  await expect(page.locator(".route-feedback-list .violated")).toContainText([
    "방문 순서",
  ]);
  await page.getByRole("button", { name: "경로 수정하기" }).click();
  const over = map.all.find(
    (p) => map.includes(p) && map.inOrder(p) && p.length - 1 > map.limit!,
  )!;
  await draw(page, over);
  await page.getByRole("button", { name: "경로 확정", exact: true }).click();
  await expect(page.locator(".route-feedback-list .violated")).toContainText([
    "상한",
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const sizes = await page
    .locator(".route-cell")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        w: n.getBoundingClientRect().width,
        h: n.getBoundingClientRect().height,
      })),
    );
  expect(sizes.every((s) => s.w >= 44 && s.h >= 44)).toBe(true);
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.reload();
  await page.getByRole("button", { name: "이 경로로 이어가기" }).click();
  expect(await selected(page)).toEqual(over);
  await page.locator(".route-end-options summary").click();
  await page
    .getByRole("button", { name: "풀이 확인하고 종료", exact: true })
    .click();
  await expect(page.locator(".result-score")).toContainText("0");
  await page
    .getByRole("button", { name: "최단 예시 경로", exact: true })
    .click();
  await expect(page.locator(".route-review .violated")).toHaveCount(0);
  expect((await selected(page)).length - 1).toBe(map.valid[0].length - 1);
});
test("route efficiency score syncs through real account handling and loads in a second browser", async ({
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
      .fill("route_researcher");
    await page
      .getByLabel("비밀번호", { exact: true })
      .fill("route account passphrase 2026!");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "회원가입", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "연구원의 연구실" }),
    ).toBeVisible();
    await start(page);
    const r = await finish(page, true);
    await expect(
      page.getByText("계정에 완료 기록이 저장됐습니다."),
    ).toBeVisible();
    expect(
      await fixture.db.query(
        "SELECT game_id,score,assisted,imported,rules_version FROM app_private.attempts",
      ),
    ).toEqual([
      {
        game_id: "route",
        score: r.score,
        assisted: false,
        imported: true,
        rules_version: "route-v1",
      },
    ]);
    expect(
      await fixture.db.query(
        "SELECT game_id,completed_stages FROM app_private.progress",
      ),
    ).toEqual([{ game_id: "route", completed_stages: [1] }]);
    other = await browser.newContext();
    await wire(other);
    const device = await other.newPage();
    await device.goto("/login");
    await device
      .getByLabel("로그인 ID", { exact: true })
      .fill("route_researcher");
    await device
      .getByLabel("비밀번호", { exact: true })
      .fill("route account passphrase 2026!");
    await device.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(
      device.getByRole("heading", { name: "연구원의 연구실" }),
    ).toBeVisible();
    await device.goto("/records");
    await expect(device.locator(".record-card")).toHaveCount(1);
    await expect(device.locator(".record-card")).toContainText(
      `${r.moves}회 이동 · 경로 완성`,
    );
    await expect(device.locator(".record-score strong")).toContainText(
      r.score.toLocaleString(),
    );
    await device.goto("/games/route");
    await expect(
      device.getByRole("link", { name: "스테이지 2 도전" }),
    ).toBeVisible();
  } finally {
    await other?.close();
    await fixture.engine.close();
  }
});
