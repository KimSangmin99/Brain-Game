import { createHash, randomBytes } from "node:crypto";
import type { Database } from "./database";
import { hashPassword, verifyPassword, dummyHash } from "./password";
import { AppError } from "./errors";
import { TERMS_VERSION, type PublicUser } from "./contracts";
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const DAY = 86400000;
type UserRow = {
  id: string;
  login_id: string;
  nickname: string;
  password_hash: string;
  status: string;
};
const publicUser = (row: UserRow): PublicUser => ({
  id: row.id,
  loginId: row.login_id,
  nickname: row.nickname,
});

// Reserve attempts before password work. Atomic UPSERT works across Vercel instances.
export async function rateLimit(
  db: Database,
  scope: string,
  limit: number,
  seconds = 900,
) {
  const key = tokenHash(scope);
  await db.query(
    "DELETE FROM app_private.auth_limits WHERE key IN (SELECT key FROM app_private.auth_limits WHERE expires_at<=now() LIMIT 100)",
  );
  const rows = await db.query<{ count: number }>(
    `INSERT INTO app_private.auth_limits(key,count,expires_at) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_limits.expires_at<=now() THEN 1 ELSE auth_limits.count+1 END,
    expires_at=CASE WHEN auth_limits.expires_at<=now() THEN now()+$2*interval '1 second' ELSE auth_limits.expires_at END RETURNING count`,
    [key, seconds],
  );
  if (rows[0].count > limit)
    throw new AppError(
      429,
      "RATE_LIMITED",
      "시도가 많습니다. 잠시 후 다시 시도해 주세요.",
    );
}
async function session(db: Database, userId: string, previous?: string) {
  const token = randomBytes(32).toString("base64url");
  const absolute = new Date(Date.now() + 30 * DAY),
    idle = new Date(Date.now() + 7 * DAY);
  if (previous)
    await db.query(
      "DELETE FROM app_private.auth_sessions WHERE token_hash=$1",
      [tokenHash(previous)],
    );
  await db.query(
    "INSERT INTO app_private.auth_sessions(token_hash,user_id,idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,$4)",
    [tokenHash(token), userId, idle, absolute],
  );
  return token;
}
export async function register(
  db: Database,
  input: { loginId: string; password: string },
  ip: string,
  previous?: string,
) {
  await rateLimit(db, `register:${ip}`, 10, 3600);
  const encoded = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const rows = await tx.query<UserRow>(
      `INSERT INTO app_private.users(login_id,password_hash,nickname,terms_version,terms_accepted_at) VALUES($1,$2,'연구원',$3,now()) ON CONFLICT(login_id) DO NOTHING RETURNING *`,
      [input.loginId, encoded, TERMS_VERSION],
    );
    if (!rows.length)
      throw new AppError(409, "ID_TAKEN", "이미 사용 중인 ID입니다.");
    return {
      user: publicUser(rows[0]),
      token: await session(tx, rows[0].id, previous),
    };
  });
}
export async function login(
  db: Database,
  input: { loginId: string; password: string },
  ip: string,
  previous?: string,
) {
  await rateLimit(db, `login-ip:${ip}`, 30);
  await rateLimit(db, `login-id:${input.loginId}`, 5);
  const [user] = await db.query<UserRow>(
    "SELECT * FROM app_private.users WHERE login_id=$1",
    [input.loginId],
  );
  const valid = await verifyPassword(
    user?.password_hash ?? (await dummyHash()),
    input.password,
  );
  if (!user || !valid || user.status !== "active")
    throw new AppError(
      401,
      "INVALID_LOGIN",
      "ID 또는 비밀번호가 올바르지 않습니다.",
    );
  return db.transaction(async (tx) => {
    await tx.query("DELETE FROM app_private.auth_limits WHERE key=$1", [
      tokenHash(`login-id:${input.loginId}`),
    ]);
    return {
      user: publicUser(user),
      token: await session(tx, user.id, previous),
    };
  });
}
export async function currentUser(db: Database, token?: string) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const rows = await db.query<UserRow>(
    `UPDATE app_private.auth_sessions s SET idle_expires_at=LEAST(s.absolute_expires_at,now()+interval '7 days') FROM app_private.users u
    WHERE s.token_hash=$1 AND s.user_id=u.id AND u.status='active' AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now()
    RETURNING u.id,u.login_id,u.nickname`,
    [tokenHash(token)],
  );
  return rows[0] ? publicUser(rows[0]) : null;
}
export async function logout(db: Database, token?: string) {
  if (token)
    await db.query(
      "DELETE FROM app_private.auth_sessions WHERE token_hash=$1",
      [tokenHash(token)],
    );
}
