import { z } from "zod";
import {
  codeConfig,
  codeExample,
  gradeCode,
  newCode,
  sameCode,
  validCode,
} from "./code-rules";
export const CODE_VERSION = "code-v1";
const guessSchema = z.object({
  symbols: z.array(z.number().int()).min(3).max(5),
  exact: z.number().int().min(0).max(5),
  misplaced: z.number().int().min(0).max(5),
});
export const codeSchema = z
  .object({
    id: z.string(),
    version: z.literal(CODE_VERSION),
    stage: z.number().int().min(1).max(30),
    mode: z.enum(["stage", "practice"]),
    phase: z.enum(["intro", "tutorial", "playing", "paused", "result"]),
    secret: z.array(z.number().int()).min(3).max(5),
    draft: z.array(z.number().int().min(0).max(5).nullable()).min(3).max(5),
    cursor: z.number().int().min(0).max(4),
    guesses: z.array(guessSchema).max(10),
    answers: z.array(z.object({ correct: z.boolean() })).max(1),
    endReason: z
      .enum(["solved", "exhausted", "skipped", "revealed"])
      .nullable(),
    revealed: z.boolean(),
    hintLevel: z.number().int().min(0).max(2),
    assisted: z.boolean(),
    interrupted: z.boolean(),
    tutorialPassed: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number(),
    revision: z.number().int().min(0),
  })
  .superRefine((a, ctx) => {
    if (!Number.isInteger(a.stage) || a.stage < 1 || a.stage > 30) return;
    const c = codeConfig(a.stage);
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const filled = a.draft.filter((n): n is number => n !== null);
    if (
      !validCode(a.secret, a.stage) ||
      a.draft.length !== c.length ||
      a.cursor >= c.length ||
      filled.some((n) => n >= c.choices) ||
      (!c.repeats && new Set(filled).size !== filled.length)
    ) {
      fail("단계와 조합 형식이 맞지 않습니다.");
      return;
    }
    if (
      a.guesses.length > c.maxGuesses ||
      a.guesses.some((g) => !validCode(g.symbols, a.stage))
    ) {
      fail("추측 형식이나 허용 횟수가 맞지 않습니다.");
      return;
    }
    if (
      new Set(a.guesses.map((g) => g.symbols.join(","))).size !==
      a.guesses.length
    )
      fail("중복 제출된 추측입니다.");
    a.guesses.forEach((g, i) => {
      const r = gradeCode(a.secret, g.symbols);
      if (
        r.exact !== g.exact ||
        r.misplaced !== g.misplaced ||
        (r.exact === c.length && i !== a.guesses.length - 1)
      )
        fail("잘못된 추측 판정입니다.");
    });
    const solved = a.guesses.at(-1)?.exact === c.length;
    if (a.phase === "result") {
      if (
        a.answers.length !== 1 ||
        a.answers[0].correct !== (a.endReason === "solved") ||
        !a.endReason
      )
        fail("완료 결과가 맞지 않습니다.");
      if (
        (a.endReason === "solved" && !solved) ||
        (a.endReason !== "solved" && solved) ||
        (a.endReason === "exhausted" && a.guesses.length !== c.maxGuesses) ||
        (["revealed", "skipped"].includes(a.endReason ?? "") &&
          a.guesses.length >= c.maxGuesses)
      )
        fail("종료 이유가 맞지 않습니다.");
    } else if (
      a.answers.length ||
      a.endReason !== null ||
      solved ||
      a.guesses.length === c.maxGuesses
    )
      fail("진행 상태가 맞지 않습니다.");
    if (
      a.revealed !== (a.endReason === "revealed") ||
      (!a.assisted && (a.hintLevel > 0 || a.revealed))
    )
      fail("도움 이력이 누락됐습니다.");
    if (["intro", "tutorial"].includes(a.phase) && a.guesses.length)
      fail("안내 중에는 추측할 수 없습니다.");
    if (
      c.requiresTutorial &&
      ["playing", "paused", "result"].includes(a.phase) &&
      !a.tutorialPassed
    )
      fail("조작 예제를 먼저 확인해 주세요.");
  });
export type CodeAttempt = z.infer<typeof codeSchema>;
export function codeOutcome(a: CodeAttempt) {
  const c = codeConfig(a.stage),
    passed = a.phase === "result" && a.endReason === "solved";
  return {
    correct: passed ? 1 : 0,
    passed,
    score: passed
      ? 8000 +
        Math.floor(
          (2000 * (c.maxGuesses - a.guesses.length)) / (c.maxGuesses - 1),
        )
      : 0,
    independent: passed && !a.assisted && !a.interrupted && !a.revealed,
  };
}
export function makeCodeAttempt(
  stage: number,
  mode: CodeAttempt["mode"] = "stage",
  excluded: number[][] = [],
): CodeAttempt {
  const c = codeConfig(stage);
  return {
    id: crypto.randomUUID(),
    version: CODE_VERSION,
    stage,
    mode,
    phase: "intro",
    secret: newCode(stage, [codeExample(stage).target, ...excluded]),
    draft: Array(c.length).fill(null),
    cursor: 0,
    guesses: [],
    answers: [],
    endReason: null,
    revealed: false,
    hintLevel: 0,
    assisted: false,
    interrupted: false,
    tutorialPassed: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    revision: 0,
  };
}
export type CodeAction =
  | {
      type:
        | "tutorial"
        | "start"
        | "confirm"
        | "clear"
        | "backspace"
        | "hint"
        | "pause"
        | "resume"
        | "skip"
        | "reveal";
    }
  | { type: "example"; exact: number; misplaced: number }
  | { type: "fill"; symbol: number }
  | { type: "slot"; index: number };
const finish = (
  a: CodeAttempt,
  endReason: NonNullable<CodeAttempt["endReason"]>,
): CodeAttempt => ({
  ...a,
  phase: "result",
  endReason,
  answers: [{ correct: endReason === "solved" }],
  revealed: endReason === "revealed",
  assisted: a.assisted || endReason === "revealed",
});
export function reduceCode(a: CodeAttempt, action: CodeAction): CodeAttempt {
  const c = codeConfig(a.stage);
  let next = a;
  switch (action.type) {
    case "tutorial":
      if (a.phase === "intro") next = { ...a, phase: "tutorial" };
      break;
    case "example":
      if (a.phase === "tutorial") {
        const e = codeExample(a.stage);
        next = {
          ...a,
          tutorialPassed:
            action.exact === e.exact && action.misplaced === e.misplaced,
        };
      }
      break;
    case "start":
      if (
        (a.phase === "intro" && !c.requiresTutorial) ||
        (a.phase === "tutorial" && a.tutorialPassed)
      )
        next = { ...a, phase: "playing" };
      break;
    case "slot":
      if (
        a.phase === "playing" &&
        Number.isInteger(action.index) &&
        action.index >= 0 &&
        action.index < c.length &&
        action.index !== a.cursor
      )
        next = { ...a, cursor: action.index };
      break;
    case "fill":
      if (
        a.phase === "playing" &&
        Number.isInteger(action.symbol) &&
        action.symbol >= 0 &&
        action.symbol < c.choices &&
        (c.repeats ||
          !a.draft.some((v, i) => i !== a.cursor && v === action.symbol))
      ) {
        const draft = a.draft.map((v, i) =>
          i === a.cursor ? action.symbol : v,
        );
        const later = draft.findIndex((v, i) => v === null && i > a.cursor);
        const first = draft.indexOf(null);
        next = {
          ...a,
          draft,
          cursor: later >= 0 ? later : first >= 0 ? first : a.cursor,
        };
      }
      break;
    case "clear":
    case "backspace":
      if (a.phase === "playing") {
        const cursor =
          action.type === "backspace" && a.draft[a.cursor] === null
            ? Math.max(0, a.cursor - 1)
            : a.cursor;
        next = {
          ...a,
          cursor,
          draft: a.draft.map((v, i) => (i === cursor ? null : v)),
        };
      }
      break;
    case "confirm":
      if (
        a.phase === "playing" &&
        a.draft.every((v): v is number => v !== null) &&
        validCode(a.draft, a.stage) &&
        !a.guesses.some((g) => sameCode(g.symbols, a.draft as number[]))
      ) {
        const symbols = [...a.draft] as number[];
        const result = gradeCode(a.secret, symbols),
          guesses = [...a.guesses, { symbols, ...result }];
        next = { ...a, guesses };
        if (result.exact === c.length) next = finish(next, "solved");
        else if (guesses.length === c.maxGuesses)
          next = finish(next, "exhausted");
        else next = { ...next, draft: Array(c.length).fill(null), cursor: 0 };
      }
      break;
    case "hint":
      if (a.phase === "playing" && a.hintLevel < 2)
        next = { ...a, hintLevel: a.hintLevel + 1, assisted: true };
      break;
    case "skip":
    case "reveal":
      if (a.phase === "playing")
        next = finish(a, action.type === "skip" ? "skipped" : "revealed");
      break;
    case "pause":
      if (a.phase === "playing")
        next = { ...a, phase: "paused", interrupted: true };
      break;
    case "resume":
      if (a.phase === "paused") next = { ...a, phase: "playing" };
      break;
  }
  return next === a
    ? a
    : { ...next, revision: a.revision + 1, updatedAt: Date.now() };
}
export const recoverCode = (a: CodeAttempt) => reduceCode(a, { type: "pause" });
