import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { testDatabase } from "../test/database";
import { handle, cookieName } from "./http";
import { tokenHash, currentUser, rateLimit } from "./auth";
import { importRecords } from "./records";
import { makeAttempt, reduceAttempt } from "../lib/pattern";
import { registerSchema } from "./contracts";
let fixture: Awaited<ReturnType<typeof testDatabase>>;
const origin = "http://localhost:3000";
function request(
  path: string,
  body?: unknown,
  cookie?: string,
  accountId?: string,
  extra: Record<string, string> = {},
) {
  return handle(
    new NextRequest(`${origin}/api/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(accountId ? { "x-brain-account": accountId } : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    () => fixture.db,
  );
}
async function signup(id: string) {
  const res = await request("/auth/register", {
    loginId: id,
    password: "나의 안전한 비밀번호 문장 2026!",
    accepted: true,
  });
  expect(res.status).toBe(201);
  return {
    user: (await res.json()).data.user,
    cookie: res.headers.get("set-cookie")!.split(";")[0],
  };
}
export function completed() {
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
beforeAll(async () => {
  fixture = await testDatabase();
}, 30000);
afterAll(async () => {
  await fixture?.engine.close();
});
describe("account HTTP and PostgreSQL integration", () => {
  it("validates ID, password and acknowledgement on the server", async () => {
    expect(
      registerSchema.parse({
        loginId: " ABCD ",
        password: "나의 안전한 비밀번호 문장 2026!",
        accepted: true,
      }).loginId,
    ).toBe("abcd");
    for (const input of [
      { loginId: "abc", password: "short", accepted: true },
      { loginId: "valid", password: "123456789012345", accepted: true },
      {
        loginId: "valid",
        password: "a sufficiently long passphrase",
        accepted: false,
      },
    ])
      expect((await request("/auth/register", input)).status).toBe(422);
  });
  it("uses Argon2id, opaque HttpOnly sessions and revokes logout", async () => {
    const { user, cookie } = await signup("alpha");
    expect(cookie).toContain(cookieName + "=");
    const [stored] = await fixture.db.query<{
      password_hash: string;
      terms_version: string;
    }>(
      "SELECT password_hash,terms_version FROM app_private.users WHERE id=$1",
      [user.id],
    );
    expect(stored.password_hash).toMatch(
      /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/,
    );
    expect(stored.terms_version).toBe("2026-11-13");
    const [session] = await fixture.db.query<{ token_hash: string }>(
      "SELECT token_hash FROM app_private.auth_sessions WHERE user_id=$1",
      [user.id],
    );
    expect(session.token_hash).toBe(tokenHash(cookie.split("=")[1]));
    const me = await request("/me", undefined, cookie);
    const text = await me.text();
    expect(text).toContain("alpha");
    expect(text).not.toContain("password_hash");
    expect(me.headers.get("cache-control")).toBe("no-store");
    expect((await request("/auth/logout", {}, cookie)).status).toBe(200);
    expect(
      (await (await request("/me", undefined, cookie)).json()).data.user,
    ).toBeNull();
  });
  it("rotates login sessions and rejects invalid/disabled/expired sessions", async () => {
    const a = await signup("bravo");
    expect(
      (
        await request("/auth/login", {
          loginId: "bravo",
          password: "a wrong password long enough",
        })
      ).status,
    ).toBe(401);
    const login = await request(
      "/auth/login",
      { loginId: "BRAVO", password: "나의 안전한 비밀번호 문장 2026!" },
      a.cookie,
    );
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    expect(login.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(await currentUser(fixture.db, a.cookie.split("=")[1])).toBeNull();
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    await fixture.db.query(
      "UPDATE app_private.auth_sessions SET idle_expires_at=now()-interval '1 second' WHERE user_id=$1",
      [a.user.id],
    );
    expect(
      (await (await request("/me", undefined, cookie)).json()).data.user,
    ).toBeNull();
    const newLogin = await request("/auth/login", {
      loginId: "bravo",
      password: "나의 안전한 비밀번호 문장 2026!",
    });
    const nextCookie = newLogin.headers.get("set-cookie")!.split(";")[0];
    await fixture.db.query(
      "UPDATE app_private.users SET status='disabled' WHERE id=$1",
      [a.user.id],
    );
    expect(
      (await (await request("/me", undefined, nextCookie)).json()).data.user,
    ).toBeNull();
  });
  it("rejects cross-origin mutations, missing login, changed account and oversized bodies", async () => {
    expect(
      (
        await request("/auth/register", {}, undefined, undefined, {
          origin: "https://foreign.invalid",
        })
      ).status,
    ).toBe(403);
    expect((await request("/progress/import", {})).status).toBe(401);
    const a = await signup("charlie");
    expect(
      (await request("/records", undefined, a.cookie, crypto.randomUUID()))
        .status,
    ).toBe(401);
    expect(
      (await request("/auth/login", { filler: "x".repeat(5000) })).status,
    ).toBe(413);
  });
  it("enforces distributed rate limits and resets expired windows", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        rateLimit(fixture.db, "test-concurrent", 5),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(3);
    await fixture.db.query(
      "UPDATE app_private.auth_limits SET expires_at=now()-interval '1 second' WHERE key=$1",
      [tokenHash("test-concurrent")],
    );
    await expect(
      rateLimit(fixture.db, "test-concurrent", 5),
    ).resolves.toBeUndefined();
    for (let i = 0; i < 5; i++)
      expect(
        (
          await request("/auth/login", {
            loginId: "unknown",
            password: "a wrong password long enough",
          })
        ).status,
      ).toBe(401);
    expect(
      (
        await request("/auth/login", {
          loginId: "unknown",
          password: "a wrong password long enough",
        })
      ).status,
    ).toBe(429);
  });
  it("imports immutable completed results once, unions stages, isolates accounts and rolls back partial batches", async () => {
    const a = await signup("delta"),
      b = await signup("echo");
    const record = completed();
    expect(record.phase).toBe("result");
    const payload = { guestProfileId: crypto.randomUUID(), records: [record] };
    expect(
      (await request("/progress/import", payload, a.cookie, a.user.id)).status,
    ).toBe(200);
    expect(
      (await request("/progress/import", payload, a.cookie, a.user.id)).status,
    ).toBe(200);
    const rows = (
      await (await request("/records", undefined, a.cookie, a.user.id)).json()
    ).data.records;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(record.id);
    expect(
      (await (await request("/records", undefined, b.cookie, b.user.id)).json())
        .data.records,
    ).toHaveLength(0);
    const [saved] = await fixture.db.query<{
      imported: boolean;
      score: number;
    }>("SELECT imported,score FROM app_private.attempts WHERE id=$1", [
      record.id,
    ]);
    expect(saved).toEqual({ imported: true, score: 10000 });
    const [progress] = await fixture.db.query<{ completed_stages: number[] }>(
      "SELECT completed_stages FROM app_private.progress WHERE user_id=$1",
      [a.user.id],
    );
    expect(progress.completed_stages).toEqual([1]);
    const other = completed();
    await expect(
      importRecords(fixture.db, b.user.id, {
        guestProfileId: payload.guestProfileId,
        records: [other, record],
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await fixture.db.query(
        "SELECT id FROM app_private.attempts WHERE id=$1",
        [other.id],
      ),
    ).toHaveLength(0);
    const changed = { ...record, assisted: true };
    expect(
      (
        await request(
          "/progress/import",
          { ...payload, records: [changed] },
          a.cookie,
          a.user.id,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          "/progress/import",
          {
            ...payload,
            records: [{ ...record, id: crypto.randomUUID(), phase: "ready" }],
          },
          a.cookie,
          a.user.id,
        )
      ).status,
    ).toBe(422);
  });
  it("uses the actual request host instead of Next's internal server port and still rejects cross-origin", async () => {
    const make = (origin: string) =>
      new NextRequest("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        headers: {
          host: "localhost:3100",
          origin,
          "content-type": "application/json",
        },
        body: "{}",
      });
    expect(
      (await handle(make("http://localhost:3100"), () => fixture.db)).status,
    ).toBe(422);
    expect(
      (await handle(make("http://foreign.invalid"), () => fixture.db)).status,
    ).toBe(403);
  });
  it("returns guest state without initializing the database", async () => {
    const response = await handle(
      new NextRequest(origin + "/api/v1/me"),
      () => {
        throw new Error("must not connect");
      },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.user).toBeNull();
  });
});
