import { z } from "zod";
import {
  SWITCH_CONTENT_VERSION,
  balancedSwitchQuestions,
  newSwitchQuestions,
  switchAnswer,
  switchChanged,
  switchConfig,
  switchExample,
  switchQuestionForStage,
  switchQuestionSchema,
  switchSignalKey,
  type SwitchQuestion,
} from "./switch-content";
export const SWITCH_VERSION = "switch-v1";
const clock = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  choice = z.union([z.literal(0), z.literal(1)]);
const answerSchema = z.object({
  questionId: z.uuid(),
  selected: choice.nullable(),
  reason: z.enum(["answered", "timeout", "skipped", "revealed"]),
  correct: z.boolean(),
  elapsedMs: clock,
  hintLevel: z.number().int().min(0).max(2),
});
export const switchSchema = z
  .object({
    id: z.string(),
    version: z.literal(SWITCH_VERSION),
    contentVersion: z.literal(SWITCH_CONTENT_VERSION),
    stage: z.number().int().min(1).max(30),
    mode: z.enum(["stage", "practice"]),
    timing: z.enum(["standard", "untimed"]),
    phase: z.enum([
      "intro",
      "tutorial",
      "gap",
      "cue",
      "ready",
      "question",
      "feedback",
      "paused",
      "result",
    ]),
    questions: z.array(switchQuestionSchema).length(20),
    round: z.number().int().min(0).max(19),
    answers: z.array(answerSchema).max(20),
    tutorialChoice: choice.nullable(),
    startedAt: clock.nullable(),
    endsAt: clock.nullable(),
    pausedFrom: z.enum(["gap", "cue", "ready", "question"]).nullable(),
    hintLevel: z.number().int().min(0).max(2),
    assisted: z.boolean(),
    revealed: z.boolean(),
    interrupted: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number(),
    revision: z.number().int().min(0),
  })
  .superRefine((a, ctx) => {
    if (
      !Number.isInteger(a.stage) ||
      a.stage < 1 ||
      a.stage > 30 ||
      a.questions.length !== 20 ||
      a.answers.length > 20 ||
      !Number.isInteger(a.round) ||
      a.round < 0 ||
      a.round > 19
    )
      return;
    const c = switchConfig(a.stage),
      fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      a.questions.some((q, i) => !switchQuestionForStage(q, a.stage, i)) ||
      new Set(a.questions.map((q) => q.id)).size !== 20
    ) {
      fail("문항의 지시·속성·식별자가 맞지 않습니다.");
      return;
    }
    if (!a.interrupted && !balancedSwitchQuestions(a.questions, a.stage))
      fail("새 문항 묶음의 응답 균형이 맞지 않습니다.");
    if (a.timing !== (a.mode === "stage" ? "standard" : "untimed"))
      fail("스테이지와 연습의 시간 조건이 맞지 않습니다.");
    if (
      c.requiresTutorial &&
      !["intro", "tutorial"].includes(a.phase) &&
      a.tutorialChoice !== switchAnswer(switchExample(a.stage))
    )
      fail("구간 예제를 먼저 완료해 주세요.");
    if (
      ["intro", "tutorial"].includes(a.phase) &&
      (a.round !== 0 || a.answers.length)
    )
      fail("안내 단계의 문항 순서가 맞지 않습니다.");
    if (
      a.answers.length !==
        (a.phase === "result"
          ? 20
          : a.phase === "feedback"
            ? a.round + 1
            : a.round) ||
      (a.phase === "result" && a.round !== 19)
    )
      fail("문항 순서가 맞지 않습니다.");
    const duration = c.seconds * 1000;
    a.answers.forEach((answer, i) => {
      if (
        answer.questionId !== a.questions[i].id ||
        answer.correct !==
          (answer.reason === "answered" &&
            answer.selected === switchAnswer(a.questions[i])) ||
        (answer.reason === "answered") !== (answer.selected !== null)
      )
        fail("응답과 실제 문항의 판정이 맞지 않습니다.");
      if (
        answer.reason === "timeout"
          ? a.timing !== "standard" || answer.elapsedMs !== duration
          : a.timing === "standard" && answer.elapsedMs >= duration
      )
        fail("응답 시간 경계가 맞지 않습니다.");
    });
    if (a.phase === "cue" || a.phase === "gap") {
      if (
        a.startedAt === null ||
        a.endsAt !== a.startedAt + (a.phase === "cue" ? 1000 : 500)
      )
        fail("안내·빈 간격의 시간이 맞지 않습니다.");
    } else if (a.phase === "question") {
      if (
        a.startedAt === null ||
        a.endsAt !== (a.timing === "standard" ? a.startedAt + duration : null)
      )
        fail("자극 응답 시간이 맞지 않습니다.");
    } else if (a.startedAt !== null || a.endsAt !== null)
      fail("비응답 상태의 타이머가 남아 있습니다.");
    if (
      (a.phase === "paused") !== (a.pausedFrom !== null) ||
      (a.pausedFrom === "question" && !a.interrupted)
    )
      fail("중단 상태가 맞지 않습니다.");
    if (
      (a.phase === "feedback" || a.phase === "result") &&
      a.answers[a.round]?.hintLevel !== a.hintLevel
    )
      fail("확정한 문항의 도움 이력이 맞지 않습니다.");
    if (
      a.revealed !== a.answers.some((a) => a.reason === "revealed") ||
      (!a.assisted &&
        (a.hintLevel > 0 ||
          a.answers.some((a) => a.hintLevel > 0 || a.reason === "revealed")))
    )
      fail("도움 이력이 누락됐습니다.");
  });
export type SwitchAttempt = z.infer<typeof switchSchema>;
export function switchOutcome(a: SwitchAttempt) {
  const correct = a.answers.filter((b) => b.correct).length,
    passed = a.phase === "result" && a.answers.length === 20 && correct >= 16;
  return {
    correct,
    score: correct * 500,
    passed,
    independent: passed && !a.assisted && !a.interrupted && !a.revealed,
  };
}
export function switchStats(a: SwitchAttempt) {
  const byRule = switchConfig(a.stage).rules.map((rule) => {
    const rows = a.answers.filter((_, i) => a.questions[i].rule === rule);
    return {
      rule,
      total: rows.length,
      correct: rows.filter((r) => r.correct).length,
    };
  });
  const changed = a.answers.filter(
      (_, i) => i > 0 && switchChanged(a.stage, i),
    ),
    correctTimes = a.answers.filter((r) => r.correct).map((r) => r.elapsedMs);
  return {
    byRule,
    changedTotal: changed.length,
    changedCorrect: changed.filter((r) => r.correct).length,
    timeouts: a.answers.filter((r) => r.reason === "timeout").length,
    wrong: a.answers.filter((r) => r.reason === "answered" && !r.correct)
      .length,
    skipped: a.answers.filter((r) => r.reason === "skipped").length,
    revealed: a.answers.filter((r) => r.reason === "revealed").length,
    meanCorrectMs: correctTimes.length
      ? Math.round(
          correctTimes.reduce((s, n) => s + n, 0) / correctTimes.length,
        )
      : null,
  };
}
export function makeSwitchAttempt(
  stage: number,
  mode: SwitchAttempt["mode"] = "stage",
): SwitchAttempt {
  return {
    id: crypto.randomUUID(),
    version: SWITCH_VERSION,
    contentVersion: SWITCH_CONTENT_VERSION,
    stage,
    mode,
    timing: mode === "stage" ? "standard" : "untimed",
    phase: "intro",
    questions: newSwitchQuestions(stage),
    round: 0,
    answers: [],
    tutorialChoice: null,
    startedAt: null,
    endsAt: null,
    pausedFrom: null,
    hintLevel: 0,
    assisted: false,
    revealed: false,
    interrupted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    revision: 0,
  };
}
export type SwitchAction =
  | { type: "tutorial" }
  | { type: "tutorialAnswer"; choice: 0 | 1 }
  | { type: "start" | "next"; now: number }
  | {
      type: "show" | "tick" | "timeout" | "skip" | "reveal" | "hint";
      questionId: string;
      now: number;
    }
  | { type: "answer"; questionId: string; choice: 0 | 1; now: number }
  | { type: "pause" }
  | { type: "resume"; now: number; question?: SwitchQuestion };
const validClock = (n: number) =>
  Number.isSafeInteger(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER - 10000;
function record(
  a: SwitchAttempt,
  reason: SwitchAttempt["answers"][number]["reason"],
  selected: 0 | 1 | null,
  now: number,
): SwitchAttempt {
  const elapsed =
    reason === "timeout"
      ? switchConfig(a.stage).seconds * 1000
      : Math.max(0, now - a.startedAt!);
  return {
    ...a,
    phase: "feedback",
    startedAt: null,
    endsAt: null,
    assisted: a.assisted || reason === "revealed",
    revealed: a.revealed || reason === "revealed",
    answers: [
      ...a.answers,
      {
        questionId: a.questions[a.round].id,
        selected,
        reason,
        correct:
          reason === "answered" &&
          selected === switchAnswer(a.questions[a.round]),
        elapsedMs: elapsed,
        hintLevel: a.hintLevel,
      },
    ],
  };
}
export function reduceSwitch(
  a: SwitchAttempt,
  action: SwitchAction,
): SwitchAttempt {
  let next = a;
  const q = a.questions[a.round];
  if ("now" in action && !validClock(action.now)) return a;
  if ("questionId" in action && action.questionId !== q.id) return a;
  switch (action.type) {
    case "tutorial":
      if (a.phase === "intro") next = { ...a, phase: "tutorial" };
      break;
    case "tutorialAnswer":
      if (
        a.phase === "tutorial" &&
        (action.choice === 0 || action.choice === 1)
      )
        next = { ...a, tutorialChoice: action.choice };
      break;
    case "start":
      if (
        (a.phase === "intro" && !switchConfig(a.stage).requiresTutorial) ||
        (a.phase === "tutorial" &&
          a.tutorialChoice === switchAnswer(switchExample(a.stage)))
      )
        next = {
          ...a,
          phase: "cue",
          startedAt: action.now,
          endsAt: action.now + 1000,
        };
      break;
    case "show":
      if (a.phase === "ready")
        next = {
          ...a,
          phase: "question",
          startedAt: action.now,
          endsAt:
            a.timing === "standard"
              ? action.now + switchConfig(a.stage).seconds * 1000
              : null,
        };
      break;
    case "tick":
    case "timeout":
      if (a.endsAt !== null && action.now >= a.endsAt) {
        if (a.phase === "gap")
          next = switchChanged(a.stage, a.round)
            ? {
                ...a,
                phase: "cue",
                startedAt: action.now,
                endsAt: action.now + 1000,
              }
            : { ...a, phase: "ready", startedAt: null, endsAt: null };
        else if (a.phase === "cue")
          next = { ...a, phase: "ready", startedAt: null, endsAt: null };
        else if (a.phase === "question")
          next = record(a, "timeout", null, action.now);
      }
      break;
    case "answer":
    case "skip":
    case "reveal":
      if (
        a.phase === "question" &&
        a.startedAt !== null &&
        action.now >= a.startedAt
      ) {
        if (a.endsAt !== null && action.now >= a.endsAt)
          next = record(a, "timeout", null, action.now);
        else if (action.type === "answer") {
          if (action.choice === 0 || action.choice === 1)
            next = record(a, "answered", action.choice, action.now);
        } else
          next = record(
            a,
            action.type === "skip" ? "skipped" : "revealed",
            null,
            action.now,
          );
      }
      break;
    case "next":
      if (a.phase === "feedback") {
        if (a.round === 19) next = { ...a, phase: "result" };
        else
          next = {
            ...a,
            phase: "gap",
            round: a.round + 1,
            startedAt: action.now,
            endsAt: action.now + 500,
            hintLevel: 0,
          };
      }
      break;
    case "hint":
      if (
        (a.phase === "ready" ||
          (a.phase === "question" && a.timing === "untimed")) &&
        a.hintLevel < 2
      )
        next = { ...a, hintLevel: a.hintLevel + 1, assisted: true };
      break;
    case "pause":
      if (["gap", "cue", "ready", "question"].includes(a.phase))
        next = {
          ...a,
          phase: "paused",
          pausedFrom: a.phase as NonNullable<SwitchAttempt["pausedFrom"]>,
          startedAt: null,
          endsAt: null,
          interrupted: a.interrupted || a.phase === "question",
        };
      break;
    case "resume":
      if (a.phase === "paused") {
        const replacement = action.question;
        if (
          a.pausedFrom === "question" &&
          (!replacement ||
            !switchQuestionSchema.safeParse(replacement).success ||
            !switchQuestionForStage(replacement, a.stage, a.round) ||
            a.questions.some((q) => q.id === replacement.id) ||
            switchSignalKey(replacement.signal) === switchSignalKey(q.signal))
        )
          break;
        next = {
          ...a,
          questions:
            a.pausedFrom === "question"
              ? a.questions.map((q, i) => (i === a.round ? replacement! : q))
              : a.questions,
          phase: "cue",
          pausedFrom: null,
          startedAt: action.now,
          endsAt: action.now + 1000,
        };
      }
      break;
  }
  return next === a
    ? a
    : { ...next, revision: a.revision + 1, updatedAt: Date.now() };
}
export const recoverSwitch = (a: SwitchAttempt) =>
  reduceSwitch(a, { type: "pause" });
