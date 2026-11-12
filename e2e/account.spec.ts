import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server.js";
import { testDatabase } from "../src/test/database";
import { handle } from "../src/server/http";
import { makeAttempt, reduceAttempt } from "../src/lib/pattern";
let fixture: Awaited<ReturnType<typeof testDatabase>>;
test.beforeAll(async () => {
  fixture = await testDatabase();
});
test.afterAll(async () => {
  await fixture?.engine.close();
});
function record() {
  let a = makeAttempt(1);
  a = reduceAttempt(a, { type: "start" });
  for (let i = 0; i < 5; i++) {
    a = reduceAttempt(a, { type: "show", now: Date.now() });
    a = reduceAttempt(a, { type: "hide" });
    for (const cell of a.targets[i])
      a = reduceAttempt(a, { type: "toggle", cell });
    a = reduceAttempt(a, { type: "confirm" });
    a = reduceAttempt(a, { type: "next" });
  }
  return a;
}
async function wire(
  context: import("@playwright/test").BrowserContext,
  failImports = () => false,
) {
  await context.route("**/api/v1/**", async (route) => {
    const source = route.request();
    if (source.url().endsWith("/progress/import") && failImports()) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            message: "계정에 저장하지 못했습니다. 다시 동기화해 주세요.",
          },
        }),
      });
      return;
    }
    const request = new NextRequest(source.url(), {
      method: source.method(),
      headers: await source.allHeaders(),
      ...(source.method() === "POST" ? { body: source.postData() ?? "" } : {}),
    });
    const response = await handle(request, () => fixture.db);
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
}
test("register, consent to guest import, resume on a clean device, and logout isolation", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await wire(context);
  await page.goto("/");
  const result = record();
  await page.evaluate(async (a) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("brain-game-guest", 1);
      r.onupgradeneeded = () =>
        r.result.createObjectStore("attempts", { keyPath: "id" });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("attempts", "readwrite");
      tx.objectStore("attempts").put(a);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, result);
  await page.getByRole("link", { name: "내 계정", exact: true }).click();
  await page.getByRole("link", { name: "회원가입", exact: true }).click();
  await page.getByLabel("로그인 ID", { exact: true }).fill("browser_user");
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("browser test passphrase 2026!");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "연구원의 연구실" }),
  ).toBeVisible();
  await expect(page.getByText("계정 완료 기록 0개")).toBeVisible();
  await page
    .getByRole("button", { name: "완료 기록 1개를 이 계정으로 가져오기" })
    .click();
  await expect(page.getByText("계정 완료 기록 1개")).toBeVisible();
  await page.screenshot({
    path: "design-explorations/2026-11-09/implemented/accountSignedIn-1280.png",
  });
  await page.setViewportSize({ width: 360, height: 900 });
  await page.screenshot({
    path: "design-explorations/2026-11-09/implemented/accountSignedIn-360.png",
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "패턴 복원 이어하기" }),
  ).toHaveAttribute("href", "/games/pattern/play?stage=2&mode=stage");
  await page.goto("/games/pattern");
  await expect(
    page.getByRole("link", { name: "스테이지 2 도전" }),
  ).toBeVisible();
  const other = await browser.newContext();
  await wire(other);
  const device = await other.newPage();
  await device.goto("/login");
  await device.getByLabel("로그인 ID", { exact: true }).fill("browser_user");
  await device
    .getByLabel("비밀번호", { exact: true })
    .fill("browser test passphrase 2026!");
  await device.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(device.getByText("계정 완료 기록 1개")).toBeVisible();
  await device.goto("/records");
  await expect(device.locator(".record-card")).toHaveCount(1);
  await device.goto("/account");
  await device.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(device).toHaveURL("http://127.0.0.1:3000/");
  await device.goto("/records");
  await expect(device.locator(".record-card")).toHaveCount(0);
  await other.close();
  await page.goto("/account");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3000/");
  await page.goto("/records");
  await expect(page.locator(".record-card")).toHaveCount(1);
});
test("mobile login validation and service error remain usable without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          message:
            "계정 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        },
      }),
    }),
  );
  await page.getByLabel("로그인 ID", { exact: true }).fill("researcher");
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("a valid length password");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator(".account-panel [role=alert]")).toContainText(
    "계정 서버에 연결하지 못했습니다.",
  );
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/login-mobile.png",
    fullPage: true,
  });
});

test("logged-in gameplay survives a server save failure and retries from the account screen", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  let fail = true;
  await wire(context, () => fail);
  await page.goto("/register");
  await page.getByLabel("로그인 ID", { exact: true }).fill("retry_user");
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("retry test passphrase 2026!");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "연구원의 연구실" }),
  ).toBeVisible();
  await page.goto("/games/pattern/play?stage=1");
  await page.getByRole("button", { name: "바로 도전하기" }).click();
  for (let round = 0; round < 5; round++) {
    await page.getByRole("button", { name: "패턴 보기", exact: true }).click();
    const labels = await page
      .locator(".memory-cell.lit")
      .evaluateAll((cells) =>
        cells.map((c) => c.getAttribute("aria-label")!.split(" · ")[0]),
      );
    expect(labels).toHaveLength(2);
    await expect(
      page.getByRole("heading", { name: "어디에 빛이 있었나요?" }),
    ).toBeVisible({ timeout: 10000 });
    for (const name of labels)
      await page.getByRole("button", { name, exact: true }).click();
    await page
      .getByRole("button", { name: "선택 확정 (2/2)", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: round === 4 ? "결과 확인" : "다음 문항",
        exact: true,
      })
      .click();
  }
  await expect(page.locator(".save-status")).toHaveText("기기에 저장됨");
  await expect(
    page.getByText("계정에 저장하지 못했습니다. 다시 동기화해 주세요."),
  ).toBeVisible();
  expect(
    await fixture.db.query(
      "SELECT id FROM app_private.attempts WHERE user_id=(SELECT id FROM app_private.users WHERE login_id='retry_user')",
    ),
  ).toHaveLength(0);
  await page.goto("/account");
  await expect(
    page.getByRole("button", { name: "계정 기록 다시 동기화" }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "계정 기록 다시 동기화" }).click();
  await expect(page.getByText("계정의 완료 기록을 불러왔습니다.")).toHaveCount(
    1,
  );
  expect(
    await fixture.db.query(
      "SELECT id FROM app_private.attempts WHERE user_id=(SELECT id FROM app_private.users WHERE login_id='retry_user')",
    ),
  ).toHaveLength(1);
  await page.goto("/records");
  await expect(page.locator(".record-card")).toHaveCount(1);
});
