import { test, expect } from "@playwright/test";

test("large text persists, settings closes with Escape, and focus mode keeps game controls clear", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "첫 게임 시작하기" }),
  ).toHaveAttribute("href", "/games/pattern/play?stage=1&mode=stage");
  await page.getByRole("button", { name: "화면 설정", exact: true }).click();
  await page.getByRole("checkbox", { name: "큰 글자로 보기" }).check();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "화면 설정", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".settings-panel")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".app")).toHaveClass(/large-type/);
  await page.getByRole("link", { name: "게임 모두 보기" }).click();
  await expect(
    page.getByRole("heading", { name: "생각을 깨우는 여덟 가지 도전" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/games/pattern/play?stage=1");
  await expect(
    page.getByRole("button", { name: "조작 연습하기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "모바일 주 메뉴" }),
  ).toBeHidden();
  const board = page.locator(".memory-cell").first();
  const bounds = await board.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await page.getByRole("button", { name: "실험실 나가기" }).click();
  await page.getByRole("link", { name: "나가기", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "모바일 주 메뉴" }),
  ).toBeVisible();
});
