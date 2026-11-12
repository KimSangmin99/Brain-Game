import { z } from "zod";
import {
  ARRANGEMENT_CONTENT_VERSION,
  arrangementConfig,
  arrangementExample,
  arrangementQuestionSchema,
  evaluateArrangement,
  newArrangementQuestion,
  questionForArrangementStage,
  validArrangement,
} from "./arrangement-content";
export const ARRANGEMENT_VERSION = "arrangement-v1";
const draftSchema = z
  .array(z.number().int().min(0).max(5).nullable())
  .min(3)
  .max(6);
export const arrangementSchema = z
  .object({
    id: z.string(),
    version: z.literal(ARRANGEMENT_VERSION),
    contentVersion: z.literal(ARRANGEMENT_CONTENT_VERSION),
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
    question: arrangementQuestionSchema,
    draft: draftSchema,
    selected: z.number().int().min(0).max(5).nullable(),
    exampleDraft: draftSchema,
    exampleChecked: z.boolean(),
    tutorialPassed: z.boolean(),
    checks: z.number().int().min(0).max(1000000),
    lastSubmission: z
      .array(z.number().int().min(0).max(5))
      .min(3)
      .max(6)
      .nullable(),
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
    const c = arrangementConfig(a.stage),
      fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!questionForArrangementStage(a.question, a.stage)) {
      fail("단계에 맞는 검수된 문제가 아닙니다.");
      return;
    }
    for (const draft of [a.draft, a.exampleDraft]) {
      const filled = draft.filter((v) => v !== null);
      if (
        draft.length !== c.size ||
        filled.some((v) => v >= c.size) ||
        new Set(filled).size !== filled.length
      )
        fail("배치 형식이 올바르지 않습니다.");
    }
    if (a.selected !== null && a.selected >= c.size)
      fail("선택한 대상이 맞지 않습니다.");
    if (
      (a.tutorialPassed &&
        !evaluateArrangement(arrangementExample(a.stage), a.exampleDraft)
          .correct) ||
      (a.tutorialPassed && !a.exampleChecked)
    )
      fail("예제 완료 이력이 맞지 않습니다.");
    if (
      c.requiresTutorial &&
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
      (a.lastSubmission && !validArrangement(a.lastSubmission, c.size))
    )
      fail("제출 이력이 맞지 않습니다.");
    const last = a.lastSubmission
      ? evaluateArrangement(a.question, a.lastSubmission)
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
      (a.checks || a.draft.some((v) => v !== null))
    )
      fail("안내 중 본문항을 풀 수 없습니다.");
  });
export type ArrangementAttempt = z.infer<typeof arrangementSchema>;
export function arrangementOutcome(a: ArrangementAttempt) {
  const passed = a.phase === "result" && a.endReason === "solved";
  return {
    correct: passed ? 1 : 0,
    passed,
    score: passed ? 10000 : 0,
    independent: passed && !a.assisted && !a.interrupted && !a.revealed,
  };
}
export function makeArrangementAttempt(
  stage: number,
  mode: ArrangementAttempt["mode"] = "stage",
  excluded: readonly string[] = [],
): ArrangementAttempt {
  const c = arrangementConfig(stage);
  return {
    id: crypto.randomUUID(),
    version: ARRANGEMENT_VERSION,
    contentVersion: ARRANGEMENT_CONTENT_VERSION,
    stage,
    mode,
    phase: "intro",
    question: newArrangementQuestion(stage, [
      arrangementExample(stage).id,
      ...excluded,
    ]),
    draft: Array(c.size).fill(null),
    selected: null,
    exampleDraft: Array(c.size).fill(null),
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
export type ArrangementAction =
  | {
      type:
        | "tutorial"
        | "start"
        | "confirm"
        | "retry"
        | "clear"
        | "hint"
        | "pause"
        | "resume"
        | "skip"
        | "reveal";
    }
  | { type: "select"; item: number }
  | { type: "place" | "remove"; slot: number }
  | { type: "move"; item: number; slot: number };
export function placeArrangement(
  draft: readonly (number | null)[],
  item: number,
  slot: number,
) {
  const result = [...draft],
    old = result.indexOf(item),
    displaced = result[slot];
  if (old >= 0) result[old] = displaced;
  result[slot] = item;
  return result;
}
const finish = (
  a: ArrangementAttempt,
  endReason: NonNullable<ArrangementAttempt["endReason"]>,
): ArrangementAttempt => ({
  ...a,
  phase: "result",
  endReason,
  pausedFrom: null,
  selected: null,
  answers: [{ correct: endReason === "solved" }],
  revealed: endReason === "revealed",
  assisted: a.assisted || endReason === "revealed",
});
export function reduceArrangement(
  a: ArrangementAttempt,
  action: ArrangementAction,
): ArrangementAttempt {
  const c = arrangementConfig(a.stage);
  let next = a;
  const editing = a.phase === "playing" || a.phase === "tutorial",
    example = a.phase === "tutorial";
  const updateDraft = (draft: (number | null)[]) => ({
    ...a,
    ...(example
      ? { exampleDraft: draft, exampleChecked: false, tutorialPassed: false }
      : { draft }),
    selected: null,
  });
  switch (action.type) {
    case "tutorial":
      if (a.phase === "intro") next = { ...a, phase: "tutorial" };
      break;
    case "start":
      if (
        (a.phase === "intro" && !c.requiresTutorial) ||
        (a.phase === "tutorial" && a.tutorialPassed)
      )
        next = { ...a, phase: "playing", selected: null };
      break;
    case "select":
      if (
        editing &&
        Number.isInteger(action.item) &&
        action.item >= 0 &&
        action.item < c.size
      )
        next = {
          ...a,
          selected: a.selected === action.item ? null : action.item,
        };
      break;
    case "move":
    case "place":
      if (editing) {
        const item = action.type === "move" ? action.item : a.selected,
          slot = action.slot;
        if (
          item !== null &&
          Number.isInteger(item) &&
          item >= 0 &&
          item < c.size &&
          Number.isInteger(slot) &&
          slot >= 0 &&
          slot < c.size
        )
          next = updateDraft(
            placeArrangement(example ? a.exampleDraft : a.draft, item, slot),
          );
      }
      break;
    case "remove":
      if (
        editing &&
        Number.isInteger(action.slot) &&
        action.slot >= 0 &&
        action.slot < c.size
      )
        next = updateDraft(
          (example ? a.exampleDraft : a.draft).map((v, i) =>
            i === action.slot ? null : v,
          ),
        );
      break;
    case "clear":
      if (editing) next = updateDraft(Array(c.size).fill(null));
      break;
    case "confirm":
      if (editing) {
        const draft = example ? a.exampleDraft : a.draft,
          q = example ? arrangementExample(a.stage) : a.question;
        if (validArrangement(draft, c.size)) {
          const correct = evaluateArrangement(q, draft).correct;
          if (example)
            next = { ...a, exampleChecked: true, tutorialPassed: correct };
          else {
            next = {
              ...a,
              checks: a.checks + 1,
              lastSubmission: [...draft],
              selected: null,
            };
            next = correct
              ? finish(next, "solved")
              : { ...next, phase: "feedback", assisted: true };
          }
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
          selected: null,
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
export const recoverArrangement = (a: ArrangementAttempt) =>
  reduceArrangement(a, { type: "pause" });
