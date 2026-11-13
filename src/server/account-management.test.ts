import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { testDatabase } from "../test/database";
import { handle, cookieName } from "./http";
import { register, login, currentUser, tokenHash } from "./auth";
import { verifyPassword } from "./password";
import { importRecords } from "./records";
import { makeAttempt, reduceAttempt } from "../lib/pattern";
import type { Database } from "./database";
let fixture: Awaited<ReturnType<typeof testDatabase>>;
const password = "안전한 계정 관리 비밀번호 2026!",
  nextPassword = "새로운 안전한 비밀번호 문장 2026!";
const origin = "http://localhost:3000";
beforeAll(async () => {
  fixture = await testDatabase();
}, 30000);
beforeEach(async () => {
  await fixture.engine.exec(
    "TRUNCATE app_private.users CASCADE; TRUNCATE app_private.account_deletions,app_private.auth_limits;",
  );
});
afterAll(async () => {
  await fixture?.engine.close();
});
async function account(id = "manage_user") {
  const a = await register(
    fixture.db,
    { loginId: id, password },
    `signup:${id}`,
  );
  return { ...a, cookie: `${cookieName}=${a.token}` };
}
function request(
  path: string,
  body?: unknown,
  auth?: { cookie: string; user: { id: string } },
  method = body === undefined ? "GET" : "POST",
  extra: Record<string, string> = {},
) {
  return handle(
    new NextRequest(`${origin}/api/v1${path}`, {
      method,
      headers: {
        origin,
        "content-type": "application/json",
        ...(auth
          ? { cookie: auth.cookie, "x-brain-account": auth.user.id }
          : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    () => fixture.db,
  );
}
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
function deletion(
  a: { user: { loginId: string } },
  receipt = crypto.randomUUID(),
) {
  return {
    currentPassword: password,
    confirmationId: a.user.loginId,
    acknowledged: true,
    receipt,
  };
}
describe("account management with actual PostgreSQL transactions", () => {
  it("changes password, removes every session and token, preserves all game data, and requires login with the new password", async () => {
    const a = await account(),
      other = await login(
        fixture.db,
        { loginId: a.user.loginId, password },
        "other-device",
      );
    await importRecords(fixture.db, a.user.id, {
      guestProfileId: crypto.randomUUID(),
      records: [record()],
    });
    await fixture.db.query(
      "INSERT INTO app_private.action_tokens(token_hash,user_id,purpose,expires_at) VALUES('old-reset',$1,'reset_password',now()+interval '1 hour')",
      [a.user.id],
    );
    const res = await request(
      "/auth/password",
      {
        currentPassword: password,
        newPassword: nextPassword,
        confirmPassword: nextPassword,
      },
      a,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await currentUser(fixture.db, a.token)).toBeNull();
    expect(await currentUser(fixture.db, other.token)).toBeNull();
    expect(
      await fixture.db.query(
        "SELECT token_hash FROM app_private.action_tokens",
      ),
    ).toEqual([]);
    const [row] = await fixture.db.query<{ password_hash: string }>(
      "SELECT password_hash FROM app_private.users WHERE id=$1",
      [a.user.id],
    );
    expect(await verifyPassword(row.password_hash, nextPassword)).toBe(true);
    expect(
      await fixture.db.query("SELECT id FROM app_private.attempts"),
    ).toHaveLength(1);
    expect(
      await fixture.db.query("SELECT * FROM app_private.progress"),
    ).toHaveLength(1);
    await expect(
      login(fixture.db, { loginId: a.user.loginId, password }, "old-password"),
    ).rejects.toMatchObject({ code: "INVALID_LOGIN" });
    await expect(
      login(
        fixture.db,
        { loginId: a.user.loginId, password: nextPassword },
        "new-password",
      ),
    ).resolves.toMatchObject({ user: a.user });
  });
  it("rejects wrong passwords and weak, reused or mismatching new passwords without changing sessions", async () => {
    const a = await account();
    const inputs = [
      {
        currentPassword: "wrong",
        newPassword: nextPassword,
        confirmPassword: nextPassword,
      },
      {
        currentPassword: password,
        newPassword: "short",
        confirmPassword: "short",
      },
      {
        currentPassword: password,
        newPassword: "123456789012345",
        confirmPassword: "123456789012345",
      },
      {
        currentPassword: password,
        newPassword: password,
        confirmPassword: password,
      },
      {
        currentPassword: password,
        newPassword: nextPassword,
        confirmPassword: "different",
      },
    ];
    for (const input of inputs)
      expect([401, 422]).toContain(
        (await request("/auth/password", input, a)).status,
      );
    expect(await currentUser(fixture.db, a.token)).toEqual(a.user);
  });
  it("requires password reauthentication for all-device logout and leaves records and password unchanged", async () => {
    const a = await account(),
      other = await login(
        fixture.db,
        { loginId: a.user.loginId, password },
        "other",
      );
    await importRecords(fixture.db, a.user.id, {
      guestProfileId: crypto.randomUUID(),
      records: [record()],
    });
    expect(
      (await request("/auth/logout-all", { currentPassword: "wrong" }, a))
        .status,
    ).toBe(401);
    expect(await currentUser(fixture.db, other.token)).toEqual(a.user);
    expect(
      (await request("/auth/logout-all", { currentPassword: password }, a))
        .status,
    ).toBe(200);
    expect(await currentUser(fixture.db, a.token)).toBeNull();
    expect(await currentUser(fixture.db, other.token)).toBeNull();
    expect(
      await fixture.db.query(
        "SELECT id FROM app_private.attempts WHERE user_id=$1",
        [a.user.id],
      ),
    ).toHaveLength(1);
    expect(
      await fixture.db.query(
        "SELECT * FROM app_private.progress WHERE user_id=$1",
        [a.user.id],
      ),
    ).toHaveLength(1);
    await expect(
      login(fixture.db, { loginId: a.user.loginId, password }, "relogin"),
    ).resolves.toMatchObject({ user: a.user });
  });
  it("atomically removes private data, mail, tokens, sessions and official references; keeps only deletion hashes and another account", async () => {
    const a = await account(),
      b = await account("other_user"),
      played = record();
    await importRecords(fixture.db, a.user.id, {
      guestProfileId: crypto.randomUUID(),
      records: [played],
    });
    await importRecords(fixture.db, b.user.id, {
      guestProfileId: crypto.randomUUID(),
      records: [record()],
    });
    await fixture.db.query(
      "INSERT INTO app_private.action_tokens(token_hash,user_id,purpose,expires_at) VALUES('pending-email',$1,'verify_email',now()+interval '1 hour')",
      [a.user.id],
    );
    await fixture.db.query(
      "INSERT INTO app_private.email_outbox(user_id,purpose,encrypted_payload,expires_at) VALUES($1,'verify_email','encrypted-fixture',now()+interval '1 hour')",
      [a.user.id],
    );
    const [event] = await fixture.db.query<{ id: string }>(
      "INSERT INTO app_private.challenge_events(game_id,rules_version,bundle,opens_at,closes_at) VALUES('pattern','pattern-v1','{}',now(),now()+interval '1 hour') RETURNING id",
    );
    await fixture.db.query(
      "INSERT INTO app_private.official_entries(user_id,event_id,attempt_id,input_class) VALUES($1,$2,$3,$4)",
      [a.user.id, event.id, played.id, "mouse"],
    );
    const input = deletion(a),
      res = await request("/me", input, a, "DELETE");
    expect(res.status).toBe(200);
    for (const table of [
      "users",
      "auth_sessions",
      "attempts",
      "progress",
      "merge_receipts",
      "action_tokens",
      "email_outbox",
      "official_entries",
    ]) {
      const column = table === "users" ? "id" : "user_id";
      expect(
        await fixture.db.query(
          `SELECT * FROM app_private.${table} WHERE ${column}=$1`,
          [a.user.id],
        ),
      ).toEqual([]);
    }
    expect(await currentUser(fixture.db, b.token)).toEqual(b.user);
    const [ledger] = await fixture.db.query(
      "SELECT * FROM app_private.account_deletions",
    );
    expect(ledger).toMatchObject({
      user_id: a.user.id,
      login_id_hash: tokenHash(a.user.loginId),
      receipt_hash: tokenHash(`${a.user.id}:${input.receipt}`),
    });
    expect(JSON.stringify(ledger)).not.toContain(password);
    expect(JSON.stringify(ledger)).not.toContain(a.user.loginId);
    expect(JSON.stringify(ledger)).not.toContain(input.receipt);
    await expect(
      register(fixture.db, { loginId: a.user.loginId, password }, "reuse"),
    ).rejects.toMatchObject({ code: "ID_TAKEN" });
    expect(
      await fixture.db.query(
        "SELECT id FROM app_private.attempts WHERE user_id=$1",
        [b.user.id],
      ),
    ).toHaveLength(1);
  });
  it("rejects cross-origin, missing or changed account, missing acknowledgement, wrong ID and password before deletion", async () => {
    const a = await account(),
      input = deletion(a);
    expect((await request("/me", input, undefined, "DELETE")).status).toBe(401);
    expect(
      (
        await request("/me", input, a, "DELETE", {
          origin: "https://foreign.invalid",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/me", input, a, "DELETE", {
          "x-brain-account": crypto.randomUUID(),
        })
      ).status,
    ).toBe(401);
    expect(
      (await request("/me", { ...input, acknowledged: false }, a, "DELETE"))
        .status,
    ).toBe(422);
    expect(
      (
        await request(
          "/me",
          { ...input, confirmationId: "different_id" },
          a,
          "DELETE",
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await request(
          "/me",
          { ...input, currentPassword: "wrong" },
          a,
          "DELETE",
        )
      ).status,
    ).toBe(401);
    expect(await currentUser(fixture.db, a.token)).toEqual(a.user);
    expect(
      await fixture.db.query("SELECT * FROM app_private.account_deletions"),
    ).toEqual([]);
  });
  it("recovers a lost delete response only with the original random receipt and never uses status checks to delete", async () => {
    const a = await account(),
      input = deletion(a);
    expect(
      (
        await (
          await request("/auth/deletion-status", {
            userId: a.user.id,
            receipt: input.receipt,
          })
        ).json()
      ).data.deleted,
    ).toBe(false);
    await request("/me", input, a, "DELETE");
    expect(
      (
        await (
          await request("/auth/deletion-status", {
            userId: a.user.id,
            receipt: input.receipt,
          })
        ).json()
      ).data.deleted,
    ).toBe(true);
    expect(
      (
        await (
          await request("/auth/deletion-status", {
            userId: a.user.id,
            receipt: crypto.randomUUID(),
          })
        ).json()
      ).data.deleted,
    ).toBe(false);
    expect(
      (
        await request(
          "/auth/deletion-status",
          { userId: a.user.id, receipt: input.receipt },
          undefined,
          "POST",
          { origin: "https://foreign.invalid" },
        )
      ).status,
    ).toBe(403);
  });
  it("keeps signup/login/password changes operational without the new deletion migration and refuses deletion safely", async () => {
    await fixture.db.query(
      "ALTER TABLE app_private.account_deletions RENAME TO account_deletions_pending",
    );
    try {
      const a = await account();
      expect(
        (await (await request("/me/security", undefined, a)).json()).data
          .canDelete,
      ).toBe(false);
      expect((await request("/me", deletion(a), a, "DELETE")).status).toBe(503);
      expect(await currentUser(fixture.db, a.token)).toEqual(a.user);
      expect(
        (
          await request(
            "/auth/password",
            {
              currentPassword: password,
              newPassword: nextPassword,
              confirmPassword: nextPassword,
            },
            a,
          )
        ).status,
      ).toBe(200);
    } finally {
      await fixture.db.query(
        "ALTER TABLE app_private.account_deletions_pending RENAME TO account_deletions",
      );
    }
  });
  it.each(["raise", "skip"])(
    "rolls back both ledger and data when a delete trigger uses %s",
    async (mode) => {
      const a = await account();
      await fixture.db.query(
        `CREATE FUNCTION app_private.block_delete_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${mode === "raise" ? "RAISE EXCEPTION 'fixture failure';" : "RETURN NULL;"} END; $$`,
      );
      await fixture.db.query(
        "CREATE TRIGGER block_delete BEFORE DELETE ON app_private.users FOR EACH ROW EXECUTE FUNCTION app_private.block_delete_fixture()",
      );
      try {
        expect((await request("/me", deletion(a), a, "DELETE")).status).toBe(
          503,
        );
        expect(await currentUser(fixture.db, a.token)).toEqual(a.user);
        expect(
          await fixture.db.query("SELECT * FROM app_private.account_deletions"),
        ).toEqual([]);
      } finally {
        await fixture.db.query(
          "DROP TRIGGER block_delete ON app_private.users",
        );
        await fixture.db.query(
          "DROP FUNCTION app_private.block_delete_fixture()",
        );
      }
    },
  );
  it("serializes duplicate deletion and rejects record upload after deletion", async () => {
    const a = await account(),
      input = deletion(a);
    const replies = await Promise.all([
      request("/me", input, a, "DELETE"),
      request("/me", input, a, "DELETE"),
    ]);
    expect(replies.filter((r) => r.status === 200)).toHaveLength(1);
    expect(
      await fixture.db.query("SELECT * FROM app_private.account_deletions"),
    ).toHaveLength(1);
    await expect(
      importRecords(fixture.db, a.user.id, {
        guestProfileId: crypto.randomUUID(),
        records: [record()],
      }),
    ).rejects.toMatchObject({ code: "LOGIN_REQUIRED" });
  });
  it("does not create a session when a password is changed or the user is deleted after verification starts", async () => {
    for (const change of ["password", "delete"]) {
      const a = await account(`racing_${change}`);
      const wrapped: Database = {
        ...fixture.db,
        transaction: async (run) => {
          if (change === "password")
            await fixture.db.query(
              "UPDATE app_private.users SET password_hash='changed-fixture-hash' WHERE id=$1",
              [a.user.id],
            );
          else
            await fixture.db.query(
              "DELETE FROM app_private.users WHERE id=$1",
              [a.user.id],
            );
          return fixture.db.transaction(run);
        },
      };
      await expect(
        login(
          wrapped,
          { loginId: a.user.loginId, password },
          `racing-${change}`,
        ),
      ).rejects.toMatchObject({ code: "INVALID_LOGIN" });
      expect(
        await fixture.db.query(
          "SELECT token_hash FROM app_private.auth_sessions WHERE user_id=$1",
          [a.user.id],
        ),
      ).toHaveLength(change === "delete" ? 0 : 1);
    }
  });
  it("limits repeated password rechecks across sensitive operations", async () => {
    const a = await account();
    for (let i = 0; i < 5; i++)
      expect(
        (await request("/auth/logout-all", { currentPassword: "wrong" }, a))
          .status,
      ).toBe(401);
    const blocked = await request(
      "/auth/password",
      {
        currentPassword: password,
        newPassword: nextPassword,
        confirmPassword: nextPassword,
      },
      a,
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("900");
    expect(await currentUser(fixture.db, a.token)).toEqual(a.user);
  });
});
