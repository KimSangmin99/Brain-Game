import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { NextRequest } from "next/server.js";
import { testDatabase } from "../src/test/database";
import { handle } from "../src/server/http";
import { makeAttempt, reduceAttempt } from "../src/lib/pattern";
import { importRecords } from "../src/server/records";
let fixture: Awaited<ReturnType<typeof testDatabase>>;
const password = "account management passphrase 2026!",
  newPassword = "changed account management passphrase!";
test.beforeAll(async () => {
  fixture = await testDatabase();
});
test.beforeEach(async () => {
  await fixture.engine.exec(
    "TRUNCATE app_private.users CASCADE; TRUNCATE app_private.auth_limits,app_private.account_deletions;",
  );
});
test.afterAll(async () => {
  await fixture?.engine.close();
});
function record() {
  let a = reduceAttempt(makeAttempt(1), { type: "start" });
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
async function wire(context: BrowserContext, lostDelete = false) {
  let deleteCalls = 0;
  await context.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const response = await handle(
      new NextRequest(req.url(), {
        method: req.method(),
        headers: await req.allHeaders(),
        ...(req.method() === "GET" ? {} : { body: req.postData() ?? "" }),
      }),
      () => fixture.db,
    );
    if (req.method() === "DELETE") {
      deleteCalls++;
      if (lostDelete && response.status === 200) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "응답을 확인하지 못했습니다.",
            },
          }),
        });
        return;
      }
    }
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  return () => deleteCalls;
}
async function signup(page: Page, id = "manage_researcher") {
  await page.goto("/register");
  await page.getByLabel("로그인 ID", { exact: true }).fill(id);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "연구원의 연구실" }),
  ).toBeVisible();
}
async function login(page: Page, id = "manage_researcher", pw = password) {
  await page.goto("/login");
  await page.getByLabel("로그인 ID", { exact: true }).fill(id);
  await page.getByLabel("비밀번호", { exact: true }).fill(pw);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "연구원의 연구실" }),
  ).toBeVisible();
}
async function manage(page: Page) {
  await page
    .getByRole("link", { name: "계정 보안·비밀번호·탈퇴 관리" })
    .click();
  await expect(
    page.getByRole("heading", { name: "계정 보안과 관리" }),
  ).toBeVisible();
}
async function fillDelete(page: Page, id = "manage_researcher") {
  await page.getByRole("button", { name: "회원 탈퇴", exact: true }).click();
  await page.getByLabel("현재 비밀번호", { exact: true }).fill(password);
  await page.getByLabel("탈퇴할 로그인 ID 확인").fill(id);
  await page.getByRole("checkbox").check();
}
test("password change logs out every device, preserves records and requires the new password", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(60000);
  await wire(context);
  await signup(page);
  const [user] = await fixture.db.query<{ id: string }>(
    "SELECT id FROM app_private.users",
  );
  await importRecords(fixture.db, user.id, {
    guestProfileId: crypto.randomUUID(),
    records: [record()],
  });
  const other = await browser.newContext();
  try {
    await wire(other);
    const device = await other.newPage();
    await login(device);
    await manage(page);
    await page
      .getByRole("button", { name: "비밀번호 변경", exact: true })
      .click();
    await page.getByLabel("현재 비밀번호", { exact: true }).fill(password);
    await page.getByLabel("새 비밀번호", { exact: true }).fill(newPassword);
    await page
      .getByLabel("새 비밀번호 확인", { exact: true })
      .fill(newPassword);
    await page.screenshot({
      path: "docs/accounts/security-desktop.png",
      fullPage: true,
    });
    await page
      .getByLabel("새 비밀번호 확인", { exact: true })
      .fill("mismatched password phrase");
    await page
      .getByRole("button", { name: "비밀번호 변경하고 로그아웃" })
      .click();
    await expect(page.locator(".account-panel [role=alert]")).toContainText(
      "일치하지 않습니다",
    );
    await page
      .getByLabel("새 비밀번호 확인", { exact: true })
      .fill(newPassword);
    await page
      .getByRole("button", { name: "비밀번호 변경하고 로그아웃" })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator(".account-panel [role=status]")).toContainText(
      "모든 기기의 로그인을 종료",
    );
    await device.reload();
    await expect(
      device.getByRole("heading", { name: "나의 연구 기록을 이어가세요" }),
    ).toBeVisible();
    await page
      .getByLabel("로그인 ID", { exact: true })
      .fill("manage_researcher");
    await page.getByLabel("비밀번호", { exact: true }).fill(password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page.locator(".account-panel [role=alert]")).toContainText(
      "올바르지 않습니다",
    );
    await page.getByLabel("비밀번호", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "연구원의 연구실" }),
    ).toBeVisible();
    await page.goto("/records");
    await expect(page.locator(".record-card")).toHaveCount(1);
    const stored = await page.evaluate(() =>
      [
        ...Object.values(localStorage),
        ...Object.values(sessionStorage),
        document.cookie,
      ].join("|"),
    );
    expect(stored).not.toContain(password);
    expect(stored).not.toContain(newPassword);
  } finally {
    await other.close();
  }
});
test("all-device logout rejects a wrong password and refreshes another open tab without deleting cached records", async ({
  page,
  context,
}) => {
  await wire(context);
  await signup(page);
  const [owner] = await fixture.db.query<{ id: string }>(
    "SELECT id FROM app_private.users",
  );
  const unfinished = makeAttempt(1);
  await page.evaluate(
    async ({ owner, unfinished }) => {
      await new Promise<void>((resolve, reject) => {
        const r = indexedDB.open(`brain-game-user-${owner.id}`, 1);
        r.onupgradeneeded = () =>
          r.result.createObjectStore("attempts", { keyPath: "id" });
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("attempts", "readwrite");
          tx.objectStore("attempts").put(unfinished);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        r.onerror = () => reject(r.error);
      });
    },
    { owner, unfinished },
  );
  const sibling = await context.newPage();
  await sibling.goto("/account");
  await expect(
    sibling.getByRole("heading", { name: "연구원의 연구실" }),
  ).toBeVisible();
  await page.bringToFront();
  await manage(page);
  await page
    .getByRole("button", { name: "모든 기기 로그아웃", exact: true })
    .click();
  await page
    .getByLabel("현재 비밀번호", { exact: true })
    .fill("wrong password");
  await page.getByRole("button", { name: "전체 로그아웃 확정" }).click();
  await expect(page.locator(".account-panel [role=alert]")).toContainText(
    "올바르지 않습니다",
  );
  await expect(
    page.getByRole("heading", { name: "계정 보안과 관리" }),
  ).toBeVisible();
  await page.getByLabel("현재 비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "전체 로그아웃 확정" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    sibling.getByRole("heading", { name: "나의 연구 기록을 이어가세요" }),
  ).toBeVisible();
  expect(
    await fixture.db.query("SELECT * FROM app_private.auth_sessions"),
  ).toEqual([]);
  await login(page);
  const kept = await page.evaluate(
    async (owner) =>
      new Promise<string[]>((resolve, reject) => {
        const r = indexedDB.open(`brain-game-user-${owner.id}`, 1);
        r.onsuccess = () => {
          const db = r.result,
            q = db.transaction("attempts").objectStore("attempts").getAll();
          q.onsuccess = () => {
            db.close();
            resolve(q.result.map((a) => a.id));
          };
          q.onerror = () => reject(q.error);
        };
        r.onerror = () => reject(r.error);
      }),
    owner,
  );
  expect(kept).toContain(unfinished.id);
  await sibling.close();
});
test("mobile deletion removes only its account and linked guest original, prevents ID reuse and revokes another device", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(60000);
  await wire(context);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const linked = record(),
    guest = makeAttempt(1),
    otherAccount = crypto.randomUUID(),
    otherRecord = record();
  await page.evaluate(
    async ({ linked, guest, otherAccount, otherRecord }) => {
      localStorage.setItem("brain-large-type", "true");
      for (const [name, rows] of [
        ["brain-game-guest", [linked, guest]],
        [`brain-game-user-${otherAccount}`, [otherRecord]],
      ] as const) {
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.open(name, 1);
          req.onupgradeneeded = () =>
            req.result.createObjectStore("attempts", { keyPath: "id" });
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
          req.onerror = () => reject(req.error);
        });
      }
    },
    { linked, guest, otherAccount, otherRecord },
  );
  await signup(page);
  await page
    .getByRole("button", { name: "완료 기록 1개를 이 계정으로 가져오기" })
    .click();
  await expect(
    page.getByText("기록을 가져왔습니다. 원본은 이 브라우저에 보관됩니다."),
  ).toBeVisible();
  const [user] = await fixture.db.query<{ id: string }>(
    "SELECT id FROM app_private.users",
  );
  const other = await browser.newContext();
  try {
    await wire(other);
    const device = await other.newPage();
    await login(device);
    await manage(page);
    await fillDelete(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const buttons = await page
      .locator(".security-options button,.security-form-actions button")
      .evaluateAll((ns) =>
        ns.map((n) => ({
          w: n.getBoundingClientRect().width,
          h: n.getBoundingClientRect().height,
        })),
      );
    expect(buttons.every((b) => b.w >= 44 && b.h >= 44)).toBe(true);
    await page.screenshot({
      path: "docs/accounts/security-mobile.png",
      fullPage: true,
    });
    await page.getByLabel("탈퇴할 로그인 ID 확인").fill("different_id");
    await page.getByRole("button", { name: "계정과 기록 영구 삭제" }).click();
    await expect(page.locator(".account-panel [role=alert]")).toContainText(
      "정확히 입력",
    );
    await page.getByLabel("탈퇴할 로그인 ID 확인").fill("manage_researcher");
    await page.getByRole("button", { name: "계정과 기록 영구 삭제" }).click();
    await expect(
      page.getByRole("heading", { name: "나의 연구 기록을 이어가세요" }),
    ).toBeVisible();
    await expect(page.locator(".account-panel [role=status]")).toContainText(
      "계정과 서버의 개인 기록을 삭제",
    );
    const rows = await page.evaluate(
      async ({ userId, otherAccount }) => {
        const result: Record<string, string[]> = {};
        for (const name of [
          "brain-game-guest",
          `brain-game-user-${userId}`,
          `brain-game-user-${otherAccount}`,
        ])
          result[name] = await new Promise<string[]>((resolve, reject) => {
            const req = indexedDB.open(name, 1);
            req.onsuccess = () => {
              const db = req.result,
                read = db
                  .transaction("attempts")
                  .objectStore("attempts")
                  .getAll();
              read.onsuccess = () => {
                db.close();
                resolve(read.result.map((a) => a.id));
              };
              read.onerror = () => reject(read.error);
            };
          });
        return result;
      },
      { userId: user.id, otherAccount },
    );
    expect(rows["brain-game-guest"]).toEqual([guest.id]);
    expect(rows[`brain-game-user-${user.id}`]).toEqual([]);
    expect(rows[`brain-game-user-${otherAccount}`]).toEqual([otherRecord.id]);
    expect(await fixture.db.query("SELECT id FROM app_private.users")).toEqual(
      [],
    );
    expect(
      await fixture.db.query("SELECT id FROM app_private.attempts"),
    ).toEqual([]);
    await device.reload();
    await expect(
      device.getByRole("heading", { name: "나의 연구 기록을 이어가세요" }),
    ).toBeVisible();
    await page.goto("/register");
    await page
      .getByLabel("로그인 ID", { exact: true })
      .fill("manage_researcher");
    await page.getByLabel("비밀번호", { exact: true }).fill(password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "회원가입", exact: true }).click();
    await expect(page.locator(".account-panel [role=alert]")).toContainText(
      "이미 사용 중인 ID",
    );
  } finally {
    await other.close();
  }
});
test("a lost deletion response and failed local cleanup can be recovered after refresh without another DELETE", async ({
  page,
  context,
}) => {
  const deletionCalls = await wire(context, true);
  await signup(page);
  await manage(page);
  await fillDelete(page);
  await page.evaluate(() => {
    const clear = IDBObjectStore.prototype.clear;
    IDBObjectStore.prototype.clear = function () {
      if (this.transaction.db.name.startsWith("brain-game-user-"))
        throw new DOMException(
          "Local fixture storage failure",
          "QuotaExceededError",
        );
      return clear.call(this);
    };
  });
  await page.getByRole("button", { name: "계정과 기록 영구 삭제" }).click();
  await expect(
    page.getByRole("heading", { name: "서버의 계정 삭제를 완료했습니다." }),
  ).toBeVisible();
  await expect(page.locator(".account-panel [role=alert]")).toContainText(
    "이 기기의 기록을 정리하지 못했어요",
  );
  await expect(
    page.getByRole("button", { name: "이 기기 기록 정리 다시 시도" }),
  ).toBeEnabled();
  expect(
    await fixture.db.query("SELECT * FROM app_private.account_deletions"),
  ).toHaveLength(1);
  await page.reload();
  await page.getByRole("button", { name: "이전 탈퇴 요청 상태 확인" }).click();
  await expect(
    page.getByRole("heading", { name: "나의 연구 기록을 이어가세요" }),
  ).toBeVisible();
  await expect(page.locator(".account-panel [role=status]")).toContainText(
    "계정과 서버의 개인 기록을 삭제",
  );
  expect(deletionCalls()).toBe(1);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("brain-pending-account-deletion"),
    ),
  ).toBeNull();
});
test("before deletion SQL is applied, account management stays usable and deletion is unavailable", async ({
  page,
  context,
}) => {
  await wire(context);
  await fixture.db.query(
    "ALTER TABLE app_private.account_deletions RENAME TO account_deletions_pending",
  );
  try {
    await signup(page);
    await manage(page);
    await expect(
      page.getByRole("button", { name: "회원 탈퇴", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("회원 탈퇴 기능을 준비 중입니다.", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "비밀번호 변경", exact: true })
      .click();
    await expect(
      page.getByLabel("현재 비밀번호", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "취소", exact: true }).click();
    await expect(page.locator(".security-form")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "모든 기기 로그아웃", exact: true }),
    ).toBeEnabled();
  } finally {
    await fixture.db.query(
      "ALTER TABLE app_private.account_deletions_pending RENAME TO account_deletions",
    );
  }
});
