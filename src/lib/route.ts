import { z } from "zod";
import {
  ROUTE_CONTENT_VERSION,
  editRoute,
  evaluateRoute,
  newRouteQuestion,
  routeConfig,
  routeExample,
  routeQuestionForStage,
  routeQuestionSchema,
  routeStructure,
} from "./route-content";
export const ROUTE_VERSION = "route-v1";
const pathSchema = z.array(z.number().int().min(0).max(35)).min(1).max(36);
export const routeSchema = z
  .object({
    id: z.string(),
    version: z.literal(ROUTE_VERSION),
    contentVersion: z.literal(ROUTE_CONTENT_VERSION),
    stage: z.number().int().min(1).max(30),
    mode: z.enum(["stage", "practice"]),
    phase: z.enum([
      "intro",
      "tutorial",
      "playing",
      "feedback",
      "paused",
      "result",
    ]),
    question: routeQuestionSchema,
    draft: pathSchema,
    exampleDraft: pathSchema,
    exampleChecked: z.boolean(),
    tutorialPassed: z.boolean(),
    checks: z.number().int().min(0).max(1000000),
    lastSubmission: pathSchema.nullable(),
    answers: z.array(z.object({ correct: z.boolean() })).max(1),
    endReason: z.enum(["solved", "skipped", "revealed"]).nullable(),
    pausedFrom: z.enum(["playing", "feedback"]).nullable(),
    revealed: z.boolean(),
    hintLevel: z.number().int().min(0).max(2),
    assisted: z.boolean(),
    interrupted: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number(),
    revision: z.number().int().min(0),
  })
  .superRefine((a, ctx) => {
    if (!Number.isInteger(a.stage) || a.stage < 1 || a.stage > 30) return;
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!routeQuestionForStage(a.question, a.stage)) {
      fail("단계에 맞는 검수된 지도가 아닙니다.");
      return;
    }
    const example = routeExample(a.stage);
    if (
      !routeStructure(a.question, a.draft) ||
      !routeStructure(example, a.exampleDraft) ||
      (a.lastSubmission && !routeStructure(a.question, a.lastSubmission))
    )
      fail("경로의 연결이나 이동 형식이 올바르지 않습니다.");
    if (
      a.tutorialPassed &&
      (!a.exampleChecked || !evaluateRoute(example, a.exampleDraft).correct)
    )
      fail("예제 완료 이력이 맞지 않습니다.");
    if (
      routeConfig(a.stage).requiresTutorial &&
      ["playing", "feedback", "paused", "result"].includes(a.phase) &&
      !a.tutorialPassed
    )
      fail("구간 예제를 먼저 완료해 주세요.");
    if (
      (a.phase === "paused") !== (a.pausedFrom !== null) ||
      (a.phase === "paused" && !a.interrupted)
    )
      fail("중단 상태가 맞지 않습니다.");
    if (
      (a.checks === 0) !== (a.lastSubmission === null) ||
      (a.lastSubmission && a.lastSubmission.length < 2)
    )
      fail("제출 이력이 맞지 않습니다.");
    const last = a.lastSubmission
      ? evaluateRoute(a.question, a.lastSubmission)
      : null;
    if (a.phase === "feedback" || a.pausedFrom === "feedback") {
      if (
        !last ||
        last.correct ||
        JSON.stringify(a.draft) !== JSON.stringify(a.lastSubmission)
      )
        fail("조건 피드백이 제출과 맞지 않습니다.");
    }
    if (a.phase === "result") {
      if (
        !a.endReason ||
        a.answers.length !== 1 ||
        a.answers[0].correct !== (a.endReason === "solved")
      )
        fail("완료 결과가 맞지 않습니다.");
      if (
        (a.endReason === "solved" &&
          (!last?.correct ||
            JSON.stringify(a.draft) !== JSON.stringify(a.lastSubmission))) ||
        (a.endReason !== "solved" && last?.correct)
      )
        fail("해결 여부가 맞지 않습니다.");
    } else if (a.answers.length || a.endReason !== null || last?.correct)
      fail("진행 상태가 맞지 않습니다.");
    if (
      a.revealed !== (a.endReason === "revealed") ||
      (!a.assisted &&
        (a.hintLevel > 0 ||
          a.revealed ||
          a.checks > 1 ||
          (last && !last.correct)))
    )
      fail("도움 이력이 누락됐습니다.");
    if (
      ["intro", "tutorial"].includes(a.phase) &&
      (a.checks || a.draft.length !== 1)
    )
      fail("안내 중 본문항을 풀 수 없습니다.");
  });
export type RouteAttempt = z.infer<typeof routeSchema>;
export function routeOutcome(a: RouteAttempt) {
  const passed = a.phase === "result" && a.endReason === "solved",
    moves = a.lastSubmission ? Math.max(0, a.lastSubmission.length - 1) : 0;
  return {
    correct: passed ? 1 : 0,
    passed,
    score:
      passed && moves > 0
        ? 8000 + Math.floor((2000 * a.question.shortest) / moves)
        : 0,
    independent: passed && !a.assisted && !a.interrupted && !a.revealed,
  };
}
export function makeRouteAttempt(
  stage: number,
  mode: RouteAttempt["mode"] = "stage",
  excluded: readonly string[] = [],
): RouteAttempt {
  routeConfig(stage);
  const example = routeExample(stage),
    question = newRouteQuestion(stage, [example.id, ...excluded]);
  return {
    id: crypto.randomUUID(),
    version: ROUTE_VERSION,
    contentVersion: ROUTE_CONTENT_VERSION,
    stage,
    mode,
    phase: "intro",
    question,
    draft: [question.start],
    exampleDraft: [example.start],
    exampleChecked: false,
    tutorialPassed: false,
    checks: 0,
    lastSubmission: null,
    answers: [],
    endReason: null,
    pausedFrom: null,
    revealed: false,
    hintLevel: 0,
    assisted: false,
    interrupted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    revision: 0,
  };
}
export type RouteAction =
  | {
      type:
        | "tutorial"
        | "start"
        | "confirm"
        | "retry"
        | "clear"
        | "undo"
        | "hint"
        | "pause"
        | "resume"
        | "skip"
        | "reveal";
    }
  | { type: "cell"; cell: number };
const finish = (
  a: RouteAttempt,
  endReason: NonNullable<RouteAttempt["endReason"]>,
): RouteAttempt => ({
  ...a,
  phase: "result",
  endReason,
  pausedFrom: null,
  answers: [{ correct: endReason === "solved" }],
  revealed: endReason === "revealed",
  assisted: a.assisted || endReason === "revealed",
});
export function reduceRoute(
  a: RouteAttempt,
  action: RouteAction,
): RouteAttempt {
  let next = a;
  const editing = a.phase === "playing" || a.phase === "tutorial",
    example = a.phase === "tutorial",
    q = example ? routeExample(a.stage) : a.question,
    path = example ? a.exampleDraft : a.draft;
  const update = (draft: number[]) => ({
    ...a,
    ...(example
      ? { exampleDraft: draft, exampleChecked: false, tutorialPassed: false }
      : { draft }),
  });
  switch (action.type) {
    case "tutorial":
      if (a.phase === "intro") next = { ...a, phase: "tutorial" };
      break;
    case "start":
      if (
        (a.phase === "intro" && !routeConfig(a.stage).requiresTutorial) ||
        (a.phase === "tutorial" && a.tutorialPassed)
      )
        next = { ...a, phase: "playing" };
      break;
    case "cell":
      if (editing) {
        const result = editRoute(q, path, action.cell);
        if (result.path !== path) next = update([...result.path]);
      }
      break;
    case "undo":
      if (editing && path.length > 1) next = update(path.slice(0, -1));
      break;
    case "clear":
      if (editing && path.length > 1) next = update([q.start]);
      break;
    case "confirm":
      if (editing && path.length > 1) {
        const correct = evaluateRoute(q, path).correct;
        if (example)
          next = { ...a, exampleChecked: true, tutorialPassed: correct };
        else {
          next = { ...a, checks: a.checks + 1, lastSubmission: [...path] };
          next = correct
            ? finish(next, "solved")
            : { ...next, phase: "feedback", assisted: true };
        }
      }
      break;
    case "retry":
      if (a.phase === "feedback") next = { ...a, phase: "playing" };
      break;
    case "hint":
      if (a.phase === "playing" && a.hintLevel < 2)
        next = { ...a, hintLevel: a.hintLevel + 1, assisted: true };
      break;
    case "pause":
      if (a.phase === "playing" || a.phase === "feedback")
        next = {
          ...a,
          phase: "paused",
          pausedFrom: a.phase,
          interrupted: true,
        };
      break;
    case "resume":
      if (a.phase === "paused")
        next = { ...a, phase: a.pausedFrom ?? "playing", pausedFrom: null };
      break;
    case "skip":
    case "reveal":
      if (a.phase === "playing" || a.phase === "feedback")
        next = finish(a, action.type === "skip" ? "skipped" : "revealed");
      break;
  }
  return next === a
    ? a
    : { ...next, revision: a.revision + 1, updatedAt: Date.now() };
}
export const recoverRoute = (a: RouteAttempt) =>
  reduceRoute(a, { type: "pause" });
