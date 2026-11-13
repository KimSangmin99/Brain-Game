import { NextRequest, NextResponse } from "next/server.js";
import { ZodError } from "zod";
import type { Database } from "./database";
import {
  loginSchema,
  registerSchema,
  reauthenticateSchema,
  changePasswordSchema,
  deleteAccountSchema,
  deletionReceiptSchema,
} from "./contracts";
import { register, login, logout, currentUser, rateLimit } from "./auth";
import { importRecords, listRecords } from "./records";
import { AppError } from "./errors";
import {
  accountCapabilities,
  changePassword,
  logoutEverywhere,
  deleteAccount,
  deletionStatus,
} from "./auth";
const secure = process.env.NODE_ENV === "production";
export const cookieName = secure ? "__Host-brain_session" : "brain_session";
const cookieOptions = {
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 30 * 86400,
};
const json = (data: unknown, status = 200) =>
  NextResponse.json(
    { data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
async function body(request: Request, maxBytes: number) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "JSON_REQUIRED", "JSON 요청이 필요합니다.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(422, "INVALID_BODY", "입력을 확인해 주세요.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new AppError(
        413,
        "TOO_LARGE",
        "한 번에 전송할 수 있는 용량을 초과했습니다.",
      );
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(422, "INVALID_BODY", "입력을 확인해 주세요.");
  }
}
export async function handle(request: NextRequest, dbFactory: () => Database) {
  try {
    const path = request.nextUrl.pathname.replace("/api/v1", "");
    const method = request.method;
    if (method !== "GET") {
      const origin = request.headers.get("origin");
      // Host is the browser request destination; Next's internal URL may use a different port.
      // Browser JS cannot forge Host. Do not trust client-supplied forwarded-host headers.
      const protocol =
        process.env.VERCEL === "1" ? "https:" : request.nextUrl.protocol;
      const expected =
        process.env.APP_ORIGIN?.trim() ||
        `${protocol}//${request.headers.get("host") || request.nextUrl.host}`;
      const comparableOrigin =
        !secure && origin
          ? origin.replace(
              /^http:\/\/(127\.0\.0\.1|\[::1\])(?=[:/]|$)/,
              "http://localhost",
            )
          : origin;
      if (
        !origin ||
        comparableOrigin !==
          (!secure
            ? expected.replace(
                /^http:\/\/(127\.0\.0\.1|\[::1\])(?=[:/]|$)/,
                "http://localhost",
              )
            : expected) ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        throw new AppError(
          403,
          "ORIGIN_REJECTED",
          "이 사이트에서 다시 요청해 주세요.",
        );
    }
    // No DB is needed to show guest pages or check an absent session.
    const token = request.cookies.get(cookieName)?.value;
    if (path === "/me" && method === "GET" && !token)
      return json({ user: null });
    const db = dbFactory();
    const ip =
      process.env.VERCEL === "1"
        ? (request.headers
            .get("x-vercel-forwarded-for")
            ?.split(",")[0]
            ?.trim() ?? "unknown")
        : "local";
    if (
      (path === "/auth/register" || path === "/auth/login") &&
      method === "POST"
    ) {
      const input = await body(request, 4096);
      const result = path.endsWith("/register")
        ? await register(db, registerSchema.parse(input), ip, token)
        : await login(db, loginSchema.parse(input), ip, token);
      const response = json(
        { user: result.user },
        path.endsWith("/register") ? 201 : 200,
      );
      response.cookies.set(cookieName, result.token, cookieOptions);
      return response;
    }
    if (path === "/auth/logout" && method === "POST") {
      await logout(db, token);
      const response = json({ user: null });
      response.cookies.set(cookieName, "", { ...cookieOptions, maxAge: 0 });
      return response;
    }
    if (path === "/auth/deletion-status" && method === "POST")
      return json(
        await deletionStatus(
          db,
          deletionReceiptSchema.parse(await body(request, 4096)),
          ip,
        ),
      );
    const user = await currentUser(db, token);
    if (path === "/me" && method === "GET") return json({ user });
    if (!user)
      throw new AppError(401, "LOGIN_REQUIRED", "로그인이 필요합니다.");
    if (request.headers.get("x-brain-account") !== user.id)
      throw new AppError(
        401,
        "ACCOUNT_CHANGED",
        "로그인 계정이 변경됐습니다. 새로고침해 주세요.",
      );
    if (path === "/me/security" && method === "GET")
      return json(await accountCapabilities(db));
    if (
      ((path === "/auth/password" || path === "/auth/logout-all") &&
        method === "POST") ||
      (path === "/me" && method === "DELETE")
    ) {
      const input = await body(request, 4096);
      if (path === "/auth/password")
        await changePassword(
          db,
          user.id,
          token!,
          changePasswordSchema.parse(input),
          ip,
        );
      else if (path === "/auth/logout-all")
        await logoutEverywhere(
          db,
          user.id,
          token!,
          reauthenticateSchema.parse(input).currentPassword,
          ip,
        );
      else
        await deleteAccount(
          db,
          user.id,
          token!,
          deleteAccountSchema.parse(input),
          ip,
        );
      const response = json(
        path === "/me" ? { deleted: true } : { user: null },
      );
      response.cookies.set(cookieName, "", { ...cookieOptions, maxAge: 0 });
      return response;
    }
    if (path === "/records" && method === "GET")
      return json(
        await listRecords(
          db,
          user.id,
          request.nextUrl.searchParams.get("cursor") ?? undefined,
        ),
      );
    if (path === "/progress/import" && method === "POST") {
      await rateLimit(db, `records:${user.id}`, 120, 60);
      return json(
        await importRecords(db, user.id, await body(request, 1048576)),
      );
    }
    throw new AppError(404, "NOT_FOUND", "요청한 기능을 찾을 수 없습니다.");
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          error: {
            code: "INVALID_INPUT",
            message: error.issues[0]?.message ?? "입력을 확인해 주세요.",
          },
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    if (error instanceof AppError)
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store",
            ...(error.status === 429 ? { "Retry-After": "900" } : {}),
          },
        },
      );
    // Never include DB errors, connection strings, request bodies or password hashes.
    return NextResponse.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message:
            "계정 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
