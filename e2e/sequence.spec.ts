import { test, expect, type Page } from "@playwright/test";
const names = ["원", "삼각형", "사각형", "마름모", "별", "십자"];

async function observeSequence(page: Page) {
  await page.locator(".sequence-display").evaluate((el) => {
    const observed: Record<string, number> = {};
    (
      window as unknown as { sequenceObserved: Record<string, number> }
    ).sequenceObserved = observed;
    const observer = new MutationObserver(() => {
      const symbol = el.getAttribute("data-sequence-symbol"),
        index = el.getAttribute("data-sequence-index");
      if (symbol !== null && index !== null) observed[index] = Number(symbol);
    });
    observer.observe(el, {
      attributes: true,
      attributeFilter: ["data-sequence-symbol", "data-sequence-index"],
    });
  });
  await page.getByRole("button", { name: "순서 보기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "어떤 순서로 나타났나요?" }),
  ).toBeVisible({ timeout: 7000 });
  return page.evaluate(() =>
    Object.values(
      (window as unknown as { sequenceObserved: Record<string, number> })
        .sequenceObserved,
    ),
  );
}
test("sequence completion persists, while pattern progress stays independent", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/games/sequence");
  await page.getByRole("link", { name: "스테이지 1 도전" }).click();
  await page.getByRole("button", { name: "바로 도전하기" }).click();
  for (let round = 0; round < 5; round++) {
    const symbols = await observeSequence(page);
    expect(symbols).toHaveLength(3);
    for (const symbol of symbols)
      await page
        .getByRole("button", {
          name: `${names[symbol]} 입력 (${symbol + 1})`,
          exact: true,
        })
        .click();
    await page
      .getByRole("button", { name: "순서 확정 (3/3)", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "순서까지 정확히 기억했어요!" }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: round === 4 ? "결과 확인" : "다음 문항",
        exact: true,
      })
      .click();
  }
  await expect(page.locator(".result-score")).toContainText("10,000");
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.goto("/records");
  await expect(page.locator(".record-card")).toHaveCount(1);
  await expect(page.locator(".record-info h2")).toContainText("시퀀스 기억");
  await page.reload();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await page.goto("/games/sequence");
  await expect(
    page.getByRole("link", { name: "스테이지 2 도전" }),
  ).toBeVisible();
  await page.goto("/games/pattern");
  await expect(
    page.getByRole("link", { name: "스테이지 1 도전" }),
  ).toBeVisible();
  await page.goto("/games/pattern/play?stage=2");
  await expect(
    page.getByRole("heading", { name: "아직 열리지 않은 단계예요." }),
  ).toBeVisible();
});
test("mobile tutorial supports undo and keyboard input without exposing answers in recall", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/games/sequence/play?stage=1");
  await page.getByRole("button", { name: "조작 연습하기" }).click();
  await page.keyboard.press("1");
  await page.keyboard.press("4");
  await page.getByRole("button", { name: "마지막 입력 지우기" }).click();
  await page.keyboard.press("2");
  await page.keyboard.press("3");
  await page.getByRole("button", { name: "연습 완료 · 도전 시작" }).click();
  const symbols = await observeSequence(page);
  expect(symbols).toHaveLength(3);
  await expect(page.locator(".sequence-display")).toHaveCount(0);
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
    path: "test-results/sequence-mobile.png",
    fullPage: true,
  });
});
test("refresh during sequence exposure requires a new sequence and records interruption", async ({
  page,
}) => {
  await page.goto("/games/sequence/play?stage=1");
  await page.getByRole("button", { name: "바로 도전하기" }).click();
  await page.getByRole("button", { name: "순서 보기", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "잠시 멈췄어요." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "새 순서로 이어가기" }).click();
  await expect(
    page.getByRole("button", { name: "순서 보기", exact: true }),
  ).toBeVisible();
});
