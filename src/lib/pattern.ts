import { z } from "zod";

export const RULES_VERSION = "pattern-v1";
export const ROUNDS = 5;
export const GOALS = [
  "위치를 묶어 기억하기",
  "기준점을 정해 기억하기",
  "비슷한 위치 구분하기",
  "모양으로 연결하기",
  "배운 전략 함께 쓰기",
];
export function configFor(stage: number) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 30)
    throw new Error("유효하지 않은 단계입니다.");
  const band = Math.floor((stage - 1) / 5);
  return {
    size: [3, 3, 4, 4, 5, 5][band],
    count: [2, 3, 4, 5, 6, 7][band],
    seconds: [3, 3, 4, 4, 5, 5][band],
    goal: GOALS[(stage - 1) % 5],
  };
}
export function sameCells(a: number[], b: number[]) {
  return (
    a.length === b.length &&
    new Set(a).size === a.length &&
    a.every((cell) => b.includes(cell))
  );
}
export function newPattern(
  stage: number,
  excluded: number[][] = [],
  random = Math.random,
): number[] {
  const { size, count } = configFor(stage);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const cells = Array.from({ length: size * size }, (_, i) => i);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    const result = cells.slice(0, count).sort((a, b) => a - b);
    if (!excluded.some((previous) => sameCells(previous, result)))
      return result;
  }
  throw new Error("새 문제를 준비하지 못했습니다. 다시 시도해 주세요.");
}
const answerSchema = z.object({
  selected: z.array(z.number().int()),
  correct: z.boolean(),
  skipped: z.boolean(),
});
export const attemptSchema = z
  .object({
    id: z.string(),
    version: z.literal(RULES_VERSION),
    stage: z.number().int().min(1).max(30),
    mode: z.enum(["stage", "practice"]),
    phase: z.enum([
      "intro",
      "tutorial",
      "ready",
      "show",
      "recall",
      "feedback",
      "paused",
      "result",
    ]),
    targets: z.array(z.array(z.number().int())).length(ROUNDS),
    round: z
      .number()
      .int()
      .min(0)
      .max(ROUNDS - 1),
    selected: z.array(z.number().int()),
    answers: z.array(answerSchema).max(ROUNDS),
    assisted: z.boolean(),
    interrupted: z.boolean(),
    revealEndsAt: z.number().nullable(),
    createdAt: z.number(),
    updatedAt: z.number(),
    revision: z.number().int().min(0),
  })
  .superRefine((state, ctx) => {
    const { size, count } = configFor(state.stage);
    const valid = (cells: number[]) =>
      new Set(cells).size === cells.length &&
      cells.every((n) => n >= 0 && n < size * size);
    if (
      !state.targets.every((cells) => cells.length === count && valid(cells)) ||
      !valid(state.selected) ||
      state.selected.length > count
    )
      ctx.addIssue({ code: "custom", message: "잘못된 문제 데이터입니다." });
    if (
      new Set(state.targets.map((t) => [...t].sort((a, b) => a - b).join(",")))
        .size !== ROUNDS
    )
      ctx.addIssue({ code: "custom", message: "중복 문제입니다." });
    state.answers.forEach((a, i) => {
      if (
        !valid(a.selected) ||
        a.selected.length > count ||
        a.correct !== (!a.skipped && sameCells(a.selected, state.targets[i]))
      )
        ctx.addIssue({ code: "custom", message: "잘못된 답안 데이터입니다." });
    });
    const answered =
      state.phase === "feedback"
        ? state.round + 1
        : state.phase === "result"
          ? ROUNDS
          : state.round;
    if (state.answers.length !== answered)
      ctx.addIssue({ code: "custom", message: "문항 순서가 맞지 않습니다." });
  });
export type Attempt = z.infer<typeof attemptSchema>;
export function makeAttempt(
  stage: number,
  mode: Attempt["mode"] = "stage",
): Attempt {
  const targets: number[][] = [];
  for (let i = 0; i < ROUNDS; i++) targets.push(newPattern(stage, targets));
  return {
    id: crypto.randomUUID(),
    version: RULES_VERSION,
    stage,
    mode,
    phase: "intro",
    targets,
    round: 0,
    selected: [],
    answers: [],
    assisted: false,
    interrupted: false,
    revealEndsAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    revision: 0,
  };
}
export type Action =
  | {
      type:
        | "tutorial"
        | "start"
        | "hide"
        | "confirm"
        | "skip"
        | "next"
        | "hint"
        | "pause";
    }
  | { type: "show"; now: number }
  | { type: "toggle"; cell: number }
  | { type: "resume"; target: number[] };
export function reduceAttempt(state: Attempt, action: Action): Attempt {
  const { size, count, seconds } = configFor(state.stage);
  let next = state;
  switch (action.type) {
    case "tutorial":
      if (state.phase === "intro")
        next = { ...state, phase: "tutorial", selected: [] };
      break;
    case "start":
      if (["intro", "tutorial"].includes(state.phase))
        next = { ...state, phase: "ready", selected: [] };
      break;
    case "show":
      if (state.phase === "ready")
        next = {
          ...state,
          phase: "show",
          revealEndsAt: action.now + seconds * 1000,
        };
      break;
    case "hide":
      if (state.phase === "show")
        next = { ...state, phase: "recall", revealEndsAt: null };
      break;
    case "toggle":
      if (
        ["recall", "tutorial"].includes(state.phase) &&
        Number.isInteger(action.cell) &&
        action.cell >= 0 &&
        action.cell < size * size
      ) {
        const selected = state.selected.includes(action.cell)
          ? state.selected.filter((n) => n !== action.cell)
          : state.selected.length < count
            ? [...state.selected, action.cell]
            : state.selected;
        if (selected !== state.selected) next = { ...state, selected };
      }
      break;
    case "hint":
      if (state.phase === "recall") next = { ...state, assisted: true };
      break;
    case "confirm":
    case "skip":
      if (
        state.phase === "recall" &&
        (action.type === "skip" || state.selected.length === count)
      ) {
        const skipped = action.type === "skip";
        next = {
          ...state,
          phase: "feedback",
          answers: [
            ...state.answers,
            {
              selected: state.selected,
              correct:
                !skipped &&
                sameCells(state.selected, state.targets[state.round]),
              skipped,
            },
          ],
        };
      }
      break;
    case "next":
      if (state.phase === "feedback")
        next =
          state.round === ROUNDS - 1
            ? { ...state, phase: "result" }
            : {
                ...state,
                phase: "ready",
                round: state.round + 1,
                selected: [],
              };
      break;
    case "pause":
      if (["show", "recall"].includes(state.phase))
        next = {
          ...state,
          phase: "paused",
          interrupted: true,
          selected: [],
          revealEndsAt: null,
        };
      break;
    case "resume":
      if (
        state.phase === "paused" &&
        action.target.length === count &&
        new Set(action.target).size === count &&
        action.target.every(
          (n) => Number.isInteger(n) && n >= 0 && n < size * size,
        ) &&
        !state.targets.some((t) => sameCells(t, action.target))
      ) {
        next = {
          ...state,
          phase: "ready",
          targets: state.targets.map((t, i) =>
            i === state.round ? action.target : t,
          ),
        };
      }
      break;
  }
  return next === state
    ? state
    : { ...next, revision: state.revision + 1, updatedAt: Date.now() };
}
export function recoverAttempt(state: Attempt): Attempt {
  return reduceAttempt(state, { type: "pause" });
}
export { outcome, nextStage } from "./memory-common";
