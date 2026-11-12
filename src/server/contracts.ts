import { z } from "zod";
import { attemptSchema } from "../lib/pattern";
import { sequenceSchema } from "../lib/sequence";
import { ruleSchema } from "../lib/rule";
import { codeSchema } from "../lib/code";
import { arrangementSchema } from "../lib/arrangement";
import { routeSchema } from "../lib/route";
import { searchSchema } from "../lib/search";
export const loginIdSchema = z
  .string()
  .max(100)
  .transform((v) => v.trim().toLowerCase())
  .pipe(
    z
      .string()
      .regex(/^[a-z0-9_]{4,20}$/, "ID는 영문 소문자·숫자·밑줄 4~20자입니다."),
  );
export const passwordSchema = z
  .string()
  .min(15, "비밀번호는 15자 이상 입력해 주세요.")
  .max(128, "비밀번호는 128자 이하로 입력해 주세요.");
export const loginSchema = z.object({
  loginId: loginIdSchema,
  password: passwordSchema,
});
// Small offline blocklist; no password is sent to a third-party API.
const blocked = new Set([
  "123456789012345",
  "1234567890123456",
  "passwordpassword",
  "qwertyuiopasdfgh",
  "111111111111111",
  "000000000000000",
]);
export const TERMS_VERSION = "2026-11-09";
export const registerSchema = loginSchema.extend({
  accepted: z.literal(true, {
    error: "이용 안내와 개인정보 안내를 확인해 주세요.",
  }),
  password: passwordSchema.refine(
    (v) => !blocked.has(v.toLowerCase()) && !/^(.)\1+$/u.test(v),
    "쉽게 추측되는 비밀번호입니다. 다른 문장을 사용해 주세요.",
  ),
});
export const completedSchema = z
  .union([
    attemptSchema,
    sequenceSchema,
    ruleSchema,
    codeSchema,
    arrangementSchema,
    routeSchema,
    searchSchema,
  ])
  .superRefine((a, ctx) => {
    if (
      !z.uuid().safeParse(a.id).success ||
      a.phase !== "result" ||
      a.answers.length !==
        (a.version === "search-v1"
          ? 3
          : ["code-v1", "arrangement-v1", "route-v1"].includes(a.version)
            ? 1
            : 5) ||
      !Number.isSafeInteger(a.createdAt) ||
      !Number.isSafeInteger(a.updatedAt) ||
      a.createdAt < 0 ||
      a.updatedAt < a.createdAt ||
      a.updatedAt > Date.now() + 300000
    )
      ctx.addIssue({
        code: "custom",
        message: "완료 기록 형식이 올바르지 않습니다.",
      });
  });
export const importSchema = z.object({
  guestProfileId: z.uuid(),
  records: z.array(completedSchema).min(1).max(100),
});
export interface PublicUser {
  id: string;
  loginId: string;
  nickname: string;
}
