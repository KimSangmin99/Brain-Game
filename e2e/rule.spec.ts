import {
  test,
  expect,
  type Page,
  type Locator,
  type BrowserContext,
} from "@playwright/test";
import { NextRequest } from "next/server.js";
import { testDatabase } from "../src/test/database";
import { handle } from "../src/server/http";

async function terms(locator: Locator) {
  return locator.evaluateAll((nodes) =>
    nodes.map((n) => ({
      direction: Number(n.getAttribute("data-direction")),
      count: Number(n.getAttribute("data-count")),
      mark: Number(n.getAttribute("data-mark")),
    })),
  );
}
// Infer only from the visible clues, as a player can; no saved answers or answer markers.
async function choose(page: Page, keyboard = false) {
  const family = await page.locator(".rule-scope").getAttribute("data-family");
  const shown = await terms(page.locator(".rule-sequence .rule-term"));
  const alternating = family!.startsWith("alternate") || family === "combined",
    a = shown[alternating ? 2 : shown.length - 2],
    b = shown[alternating ? 4 : shown.length - 1];
  const expected = {
    direction: (((2 * b.direction - a.direction) % 4) + 4) % 4,
    count: 2 * b.count - a.count,
    mark: (((2 * b.mark - a.mark) % 4) + 4) % 4,
  };
  const options = await terms(page.locator(".rule-options .rule-term"));
  const index = options.findIndex(
    (o) =>
      o.direction === expected.direction &&
      o.count === expected.count &&
      o.mark === expected.mark,
  );
  expect(index).toBeGreaterThanOrEqual(0);
  if (keyboard) await page.keyboard.press(String(index + 1));
  else await page.getByRole("radio").nth(index).click();
  return index;
}
async function start(page: Page) {
  await page.goto("/games/rule/play?stage=1");
  await expect(
    page.getByRole("button", { name: "바로 도전하기", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "예제로 규칙 익히기" }).click();
  await choose(page);
  await page.getByRole("button", { name: "연습 완료 · 도전 시작" }).click();
}
async function complete(page: Page) {
  for (let n = 0; n < 5; n++) {
    await expect(page.locator(".rule-option.correct")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "선택 확정", exact: true }),
    ).toBeDisabled();
    await choose(page);
    await page.getByRole("button", { name: "선택 확정", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "규칙을 정확히 찾았어요!" }),
    ).toBeVisible();
    await expect(page.locator(".rule-explanation")).toContainText("따라서");
    await page
      .getByRole("button", {
        name: n === 4 ? "결과 확인" : "다음 문항",
        exact: true,
      })
      .click();
  }
}

test("rule game completes, restores records, unlocks its own stage and resumes from home", async ({
  page,
}) => {
  await page.goto("/games");
  await page.getByRole("button", { name: "추론", exact: true }).click();
  await page.getByRole("link", { name: /규칙 분석/ }).click();
  await expect(
    page.getByRole("link", { name: "스테이지 1 도전" }),
  ).toBeVisible();
  await start(page);
  await page.screenshot({
    path: "test-results/rule-desktop.png",
    fullPage: true,
  });
  await complete(page);
  await expect(page.locator(".result-score")).toContainText("10,000");
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.locator(".rule-review summary").first().click();
  await expect(page.locator(".rule-review details").first()).toContainText(
    "방향",
  );
  await page.getByRole("link", { name: "내 기록 보기", exact: true }).click();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await expect(page.locator(".record-info h2")).toContainText("규칙 분석");
  await page.reload();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "규칙 분석 이어하기" }),
  ).toHaveAttribute("href", "/games/rule/play?stage=2&mode=stage");
  await expect(page.getByText("1개의 단계를 완료했어요")).toBeVisible();
  await page.goto("/games/rule");
  await expect(
    page.getByRole("link", { name: "스테이지 2 도전" }),
  ).toBeVisible();
  for (const game of ["pattern", "sequence"]) {
    await page.goto(`/games/${game}/play?stage=2`);
    await expect(
      page.getByRole("heading", { name: "아직 열리지 않은 단계예요." }),
    ).toBeVisible();
  }
});
test("rule keyboard selection, two hints and reload replacement work on a narrow large-text screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() =>
    localStorage.setItem("brain-large-type", "true"),
  );
  await page.goto("/games/rule/play?stage=1");
  await page.getByRole("button", { name: "예제로 규칙 익히기" }).click();
  await choose(page, true);
  await page.getByRole("button", { name: "연습 완료 · 도전 시작" }).click();
  await page.getByRole("radio").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await expect(page.getByRole("radio").nth(1)).toBeFocused();
  const before = await terms(page.locator(".rule-sequence .rule-term"));
  await page.getByRole("button", { name: "전략 힌트 보기" }).click();
  await page.getByRole("button", { name: "관찰 힌트 더 보기" }).click();
  await expect(
    page.getByText("이 도전에 힌트 사용이 기록됩니다."),
  ).toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "test-results/rule-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "잠시 멈췄어요." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "새 문제로 이어가기" }).click();
  expect(await terms(page.locator(".rule-sequence .rule-term"))).not.toEqual(
    before,
  );
  await expect(
    page.getByText("이 도전에 힌트 사용이 기록됩니다."),
  ).toBeVisible();
  await page.getByRole("button", { name: "모르겠어요", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "놓친 조건을 함께 살펴봐요." }),
  ).toBeVisible();
});
test("rule completed results sync to an account and load in another browser", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(60000);
  const fixture = await testDatabase();
  async function wire(context: BrowserContext) {
    await context.route("**/api/v1/**", async (route) => {
      const source = route.request();
      const response = await handle(
        new NextRequest(source.url(), {
          method: source.method(),
          headers: await source.allHeaders(),
          ...(source.method() === "POST"
            ? { body: source.postData() ?? "" }
            : {}),
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
  let other: BrowserContext | undefined;
  try {
    await wire(context);
    await page.goto("/register");
    await page.getByLabel("로그인 ID", { exact: true }).fill("rule_researcher");
    await page
      .getByLabel("비밀번호", { exact: true })
      .fill("rule account passphrase 2026!");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "회원가입", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "연구원의 연구실" }),
    ).toBeVisible();
    await start(page);
    await complete(page);
    await expect(
      page.getByText("계정에 완료 기록이 저장됐습니다."),
    ).toBeVisible();
    const saved = await fixture.db.query<{
      game_id: string;
      score: number;
      imported: boolean;
      rules_version: string;
    }>("SELECT game_id,score,imported,rules_version FROM app_private.attempts");
    expect(saved).toEqual([
      {
        game_id: "rule",
        score: 10000,
        imported: true,
        rules_version: "rule-v1",
      },
    ]);
    expect(
      (
        await fixture.db.query<{ game_id: string; completed_stages: number[] }>(
          "SELECT game_id,completed_stages FROM app_private.progress",
        )
      )[0],
    ).toEqual({ game_id: "rule", completed_stages: [1] });
    other = await browser.newContext();
    await wire(other);
    const device = await other.newPage();
    await device.goto("/login");
    await device
      .getByLabel("로그인 ID", { exact: true })
      .fill("rule_researcher");
    await device
      .getByLabel("비밀번호", { exact: true })
      .fill("rule account passphrase 2026!");
    await device.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(
      device.getByRole("heading", { name: "연구원의 연구실" }),
    ).toBeVisible();
    await device.goto("/records");
    await expect(device.locator(".record-card")).toHaveCount(1);
    await expect(device.locator(".record-info h2")).toContainText("규칙 분석");
    await device.goto("/games/rule");
    await expect(
      device.getByRole("link", { name: "스테이지 2 도전" }),
    ).toBeVisible();
  } finally {
    await other?.close();
    await fixture.engine.close();
  }
});
