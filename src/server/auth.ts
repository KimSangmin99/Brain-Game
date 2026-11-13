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
    // Register and deletion take the same ID lock, including before migration 0002.
    await tx.query("SELECT pg_advisory_xact_lock(7164,hashtext($1))", [
      input.loginId,
    ]);
    if ((await accountCapabilities(tx)).canDelete) {
      const reserved = await tx.query(
        "SELECT user_id FROM app_private.account_deletions WHERE login_id_hash=$1",
        [tokenHash(input.loginId)],
      );
      if (reserved.length)
        throw new AppError(409, "ID_TAKEN", "이미 사용 중인 ID입니다.");
    }
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
    const [locked] = await tx.query<UserRow>(
      "SELECT * FROM app_private.users WHERE id=$1 FOR UPDATE",
      [user.id],
    );
    if (
      !locked ||
      locked.status !== "active" ||
      locked.password_hash !== user.password_hash
    )
      throw new AppError(
        401,
        "INVALID_LOGIN",
        "ID 또는 비밀번호가 올바르지 않습니다.",
      );
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

export async function accountCapabilities(db: Database) {
  const [row] = await db.query<{ ready: boolean }>(
    "SELECT to_regclass('app_private.account_deletions') IS NOT NULL AS ready",
  );
  return { canDelete: row.ready };
}
async function verifyAccountPassword(
  db: Database,
  userId: string,
  password: string,
  ip: string,
) {
  await rateLimit(db, `sensitive-ip:${ip}`, 30);
  await rateLimit(db, `sensitive-user:${userId}`, 5);
  const [user] = await db.query<UserRow>(
    "SELECT * FROM app_private.users WHERE id=$1",
    [userId],
  );
  const valid = await verifyPassword(
    user?.password_hash ?? (await dummyHash()),
    password,
  );
  if (!user || user.status !== "active" || !valid)
    throw new AppError(
      401,
      "PASSWORD_MISMATCH",
      "현재 비밀번호가 올바르지 않습니다.",
    );
  return user;
}
async function lockVerifiedAccount(tx: Database, user: UserRow, token: string) {
  const [locked] = await tx.query<UserRow>(
    "SELECT * FROM app_private.users WHERE id=$1 FOR UPDATE",
    [user.id],
  );
  if (
    !locked ||
    locked.status !== "active" ||
    locked.password_hash !== user.password_hash
  )
    throw new AppError(
      401,
      "LOGIN_REQUIRED",
      "로그인 상태가 변경됐습니다. 다시 로그인해 주세요.",
    );
  const sessions = await tx.query(
    "SELECT token_hash FROM app_private.auth_sessions WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now()",
    [tokenHash(token), user.id],
  );
  if (!sessions.length)
    throw new AppError(401, "LOGIN_REQUIRED", "로그인이 필요합니다.");
}
export async function changePassword(
  db: Database,
  userId: string,
  token: string,
  input: { currentPassword: string; newPassword: string },
  ip: string,
) {
  const user = await verifyAccountPassword(
    db,
    userId,
    input.currentPassword,
    ip,
  );
  const encoded = await hashPassword(input.newPassword);
  await db.transaction(async (tx) => {
    await lockVerifiedAccount(tx, user, token);
    const changed = await tx.query(
      "UPDATE app_private.users SET password_hash=$2,profile_version=profile_version+1 WHERE id=$1 RETURNING id",
      [userId, encoded],
    );
    if (changed.length !== 1)
      throw new AppError(
        503,
        "CHANGE_FAILED",
        "비밀번호를 변경하지 못했습니다. 다시 시도해 주세요.",
      );
    await tx.query("DELETE FROM app_private.action_tokens WHERE user_id=$1", [
      userId,
    ]);
    await tx.query("DELETE FROM app_private.auth_sessions WHERE user_id=$1", [
      userId,
    ]);
  });
}
export async function logoutEverywhere(
  db: Database,
  userId: string,
  token: string,
  currentPassword: string,
  ip: string,
) {
  const user = await verifyAccountPassword(db, userId, currentPassword, ip);
  await db.transaction(async (tx) => {
    await lockVerifiedAccount(tx, user, token);
    await tx.query("DELETE FROM app_private.auth_sessions WHERE user_id=$1", [
      userId,
    ]);
  });
}
export async function deleteAccount(
  db: Database,
  userId: string,
  token: string,
  input: { currentPassword: string; confirmationId: string; receipt: string },
  ip: string,
) {
  if (!(await accountCapabilities(db)).canDelete)
    throw new AppError(
      503,
      "SETUP_REQUIRED",
      "회원 탈퇴 기능을 준비 중입니다. 잠시 후 다시 시도해 주세요.",
    );
  const user = await verifyAccountPassword(
    db,
    userId,
    input.currentPassword,
    ip,
  );
  if (input.confirmationId !== user.login_id)
    throw new AppError(
      422,
      "ID_MISMATCH",
      "삭제할 계정의 로그인 ID를 정확히 입력해 주세요.",
    );
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(7164,hashtext($1))", [
      user.login_id,
    ]);
    await lockVerifiedAccount(tx, user, token);
    await tx.query(
      "INSERT INTO app_private.account_deletions(user_id,login_id_hash,receipt_hash) VALUES($1,$2,$3)",
      [
        userId,
        tokenHash(user.login_id),
        tokenHash(`${userId}:${input.receipt}`),
      ],
    );
    // All private rows cascade, including sessions, mail jobs, progress and official entries.
    const removed = await tx.query(
      "DELETE FROM app_private.users WHERE id=$1 RETURNING id",
      [userId],
    );
    if (removed.length !== 1)
      throw new AppError(
        503,
        "DELETE_FAILED",
        "계정을 삭제하지 못했습니다. 다시 시도해 주세요.",
      );
  });
}
export async function deletionStatus(
  db: Database,
  input: { userId: string; receipt: string },
  ip: string,
) {
  await rateLimit(db, `deletion-status:${ip}`, 30);
  if (!(await accountCapabilities(db)).canDelete) return { deleted: false };
  const rows = await db.query(
    "SELECT user_id FROM app_private.account_deletions WHERE user_id=$1 AND receipt_hash=$2",
    [input.userId, tokenHash(`${input.userId}:${input.receipt}`)],
  );
  return { deleted: rows.length === 1 };
}
