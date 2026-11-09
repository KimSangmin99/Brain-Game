import { test, expect, type Page } from "@playwright/test";

async function start(page: Page) {
  await page.goto("/games/pattern/play?stage=1");
  await page.getByRole("button", { name: "바로 도전하기" }).click();
}
async function answerCorrectly(page: Page) {
  await page.getByRole("button", { name: "패턴 보기", exact: true }).click();
  const labels = await page
    .locator(".memory-cell.lit")
    .evaluateAll((cells) =>
      cells.map((c) => c.getAttribute("aria-label")!.split(" · ")[0]),
    );
  expect(labels).toHaveLength(2);
  await expect(
    page.getByRole("heading", { name: "어디에 빛이 있었나요?" }),
  ).toBeVisible();
  for (const label of labels)
    await page.getByRole("button", { name: label, exact: true }).click();
  await page
    .getByRole("button", { name: "선택 확정 (2/2)", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "정확하게 기억했어요!" }),
  ).toBeVisible();
}
test("complete five questions, retain result after reload, unlock only the next stage", async ({
  page,
}) => {
  await start(page);
  for (let round = 0; round < 5; round++) {
    await answerCorrectly(page);
    await page
      .getByRole("button", {
        name: round === 4 ? "결과 확인" : "다음 문항",
        exact: true,
      })
      .click();
  }
  await expect(page.locator(".result-score")).toContainText("10,000");
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.getByRole("link", { name: "내 기록 보기", exact: true }).click();
  await expect(page).toHaveURL(/\/records$/);
  await expect(page.locator(".record-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await expect(page.locator(".record-score")).toContainText("10,000");
  await page.goto("/games/pattern");
  await expect(
    page.getByRole("link", { name: "스테이지 2 도전" }),
  ).toBeVisible();
  await page.goto("/games/pattern/play?stage=3");
  await expect(
    page.getByRole("heading", { name: "아직 열리지 않은 단계예요." }),
  ).toBeVisible();
});
test("refresh during exposure preserves answered questions and replaces the interrupted one", async ({
  page,
}) => {
  await start(page);
  await answerCorrectly(page);
  await page.getByRole("button", { name: "다음 문항", exact: true }).click();
  await page.getByRole("button", { name: "패턴 보기", exact: true }).click();
  const old = await page
    .locator(".memory-cell.lit")
    .evaluateAll((cells) => cells.map((c) => c.getAttribute("aria-label")));
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "잠시 멈췄어요." }),
  ).toBeVisible();
  await expect(page.locator(".round-indicators")).toHaveAttribute(
    "aria-label",
    "2번째 문항, 총 5문항",
  );
  await page.getByRole("button", { name: "새 패턴으로 이어가기" }).click();
  await page.getByRole("button", { name: "패턴 보기", exact: true }).click();
  const fresh = await page
    .locator(".memory-cell.lit")
    .evaluateAll((cells) => cells.map((c) => c.getAttribute("aria-label")));
  expect(fresh).not.toEqual(old);
});
test("tutorial and hint are usable on mobile with no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /즐거운 도전/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/games/pattern/play?stage=1");
  await page.getByRole("button", { name: "조작 연습하기" }).click();
  await page
    .getByRole("button", { name: "1행 1열 · 정답 위치", exact: true })
    .click();
  await page
    .getByRole("button", { name: "1행 2열 · 정답 위치", exact: true })
    .click();
  await page.getByRole("button", { name: "연습 완료 · 도전 시작" }).click();
  await page.getByRole("button", { name: "패턴 보기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "어디에 빛이 있었나요?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "전략 힌트 보기" }).click();
  await expect(
    page.getByText("이 도전에 힌트 사용이 기록됩니다."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/player-mobile.png",
    fullPage: true,
  });
});
test("desktop laboratory has functional category filters", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".game-card")).toHaveCount(8);
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "추론", exact: true }).click();
  await expect(page.locator(".game-card")).toHaveCount(2);
  await page.getByRole("link", { name: /규칙 분석/ }).click();
  await expect(page.getByText("이 실험실은 준비 중입니다")).toBeVisible();
});
test("storage failure gives an honest error instead of a saved state", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      value: {
        open() {
          throw new Error("Storage blocked");
        },
      },
    });
  });
  await page.goto("/games/pattern/play?stage=1");
  await expect(
    page.getByRole("heading", { name: "잠시 연결을 확인해 주세요." }),
  ).toBeVisible();
  await expect(page.getByText("기기에 저장됨", { exact: true })).toHaveCount(0);
});
test("a second tab cannot take over an active game, and the lock is released on close", async ({
  page,
  context,
}) => {
  await start(page);
  const other = await context.newPage();
  await other.goto("/games/pattern/play?stage=1");
  await expect(
    other.getByRole("heading", { name: "다른 탭에서 플레이 중이에요." }),
  ).toBeVisible();
  await page.close();
  await other.reload();
  await expect(
    other.getByRole("button", { name: "패턴 보기", exact: true }),
  ).toBeVisible();
});
