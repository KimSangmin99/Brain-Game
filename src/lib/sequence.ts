import { z } from "zod";
export { outcome, nextStage } from "./memory-common";
export const SEQUENCE_VERSION = "sequence-v1";
export const SYMBOLS = [
  { name: "원", glyph: "●" },
  { name: "삼각형", glyph: "▲" },
  { name: "사각형", glyph: "■" },
  { name: "마름모", glyph: "◆" },
  { name: "별", glyph: "★" },
  { name: "십자", glyph: "✚" },
];
export function sequenceConfig(stage: number) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 30)
    throw new Error("유효하지 않은 단계입니다.");
  const band = Math.floor((stage - 1) / 5);
  return {
    choices: [4, 4, 6, 6, 6, 6][band],
    length: [3, 4, 4, 5, 6, 7][band],
    repeats: band >= 4,
    onMs: 900,
    gapMs: 300,
    goal: [
      "짧은 순서 익히기",
      "묶음으로 나누기",
      "닮은 항목 구분하기",
      "처음과 끝 연결하기",
      "순서를 되짚어 보기",
    ][(stage - 1) % 5],
  };
}
export function sameSequence(a: number[], b: number[]) {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}
export function newSequence(
  stage: number,
  excluded: number[][] = [],
  random = Math.random,
): number[] {
  const c = sequenceConfig(stage);
  for (let tries = 0; tries < 1000; tries++) {
    const pool = Array.from({ length: c.choices }, (_, i) => i);
    const target: number[] = [];
    while (target.length < c.length) {
      const index = Math.floor(random() * pool.length);
      target.push(pool[index]);
      if (!c.repeats) pool.splice(index, 1);
    }
    if (!excluded.some((t) => sameSequence(t, target))) return target;
  }
  throw new Error("새 순서를 준비하지 못했습니다.");
}
export const sequenceSchema = z
  .object({
    id: z.string(),
    version: z.literal(SEQUENCE_VERSION),
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
    targets: z.array(z.array(z.number().int())).length(5),
    round: z.number().int().min(0).max(4),
    selected: z.array(z.number().int()),
    answers: z
      .array(
        z.object({
          selected: z.array(z.number().int()),
          correct: z.boolean(),
          skipped: z.boolean(),
        }),
      )
      .max(5),
    assisted: z.boolean(),
    interrupted: z.boolean(),
    revealEndsAt: z.number().nullable(),
    createdAt: z.number(),
    updatedAt: z.number(),
    revision: z.number().int().min(0),
  })
  .superRefine((a, ctx) => {
    const c = sequenceConfig(a.stage);
    const valid = (v: number[]) =>
      v.length <= c.length && v.every((n) => n >= 0 && n < c.choices);
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      !a.targets.every(
        (t) =>
          valid(t) &&
          t.length === c.length &&
          (c.repeats || new Set(t).size === t.length),
      ) ||
      !valid(a.selected)
    )
      fail("잘못된 순서 데이터입니다.");
    if (new Set(a.targets.map((t) => t.join(","))).size !== 5)
      fail("중복 문제입니다.");
    a.answers.forEach((answer, i) => {
      if (
        !valid(answer.selected) ||
        answer.correct !==
          (!answer.skipped && sameSequence(answer.selected, a.targets[i]))
      )
        fail("잘못된 답안입니다.");
    });
    if (
      a.answers.length !==
      (a.phase === "result"
        ? 5
        : a.phase === "feedback"
          ? a.round + 1
          : a.round)
    )
      fail("문항 순서가 맞지 않습니다.");
  });
export type SequenceAttempt = z.infer<typeof sequenceSchema>;
export function makeSequenceAttempt(
  stage: number,
  mode: SequenceAttempt["mode"] = "stage",
): SequenceAttempt {
  const targets: number[][] = [];
  for (let i = 0; i < 5; i++) targets.push(newSequence(stage, targets));
  return {
    id: crypto.randomUUID(),
    version: SEQUENCE_VERSION,
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
export type SequenceAction =
  | {
      type:
        | "tutorial"
        | "start"
        | "hide"
        | "undo"
        | "confirm"
        | "skip"
        | "next"
        | "hint"
        | "pause";
    }
  | { type: "show"; now: number }
  | { type: "append"; symbol: number }
  | { type: "resume"; target: number[] };
export function reduceSequence(
  a: SequenceAttempt,
  action: SequenceAction,
): SequenceAttempt {
  const c = sequenceConfig(a.stage);
  let next = a;
  switch (action.type) {
    case "tutorial":
      if (a.phase === "intro") next = { ...a, phase: "tutorial", selected: [] };
      break;
    case "start":
      if (["intro", "tutorial"].includes(a.phase))
        next = { ...a, phase: "ready", selected: [] };
      break;
    case "show":
      if (a.phase === "ready")
        next = {
          ...a,
          phase: "show",
          revealEndsAt: action.now + c.length * (c.onMs + c.gapMs),
        };
      break;
    case "hide":
      if (a.phase === "show")
        next = { ...a, phase: "recall", revealEndsAt: null };
      break;
    case "append":
      if (
        ["recall", "tutorial"].includes(a.phase) &&
        a.selected.length < c.length &&
        Number.isInteger(action.symbol) &&
        action.symbol >= 0 &&
        action.symbol < c.choices
      )
        next = { ...a, selected: [...a.selected, action.symbol] };
      break;
    case "undo":
      if (["recall", "tutorial"].includes(a.phase) && a.selected.length)
        next = { ...a, selected: a.selected.slice(0, -1) };
      break;
    case "hint":
      if (a.phase === "recall") next = { ...a, assisted: true };
      break;
    case "confirm":
    case "skip":
      if (
        a.phase === "recall" &&
        (action.type === "skip" || a.selected.length === c.length)
      ) {
        const skipped = action.type === "skip";
        next = {
          ...a,
          phase: "feedback",
          answers: [
            ...a.answers,
            {
              selected: a.selected,
              correct: !skipped && sameSequence(a.selected, a.targets[a.round]),
              skipped,
            },
          ],
        };
      }
      break;
    case "next":
      if (a.phase === "feedback")
        next =
          a.round === 4
            ? { ...a, phase: "result" }
            : { ...a, phase: "ready", round: a.round + 1, selected: [] };
      break;
    case "pause":
      if (["show", "recall"].includes(a.phase))
        next = {
          ...a,
          phase: "paused",
          interrupted: true,
          selected: [],
          revealEndsAt: null,
        };
      break;
    case "resume":
      if (
        a.phase === "paused" &&
        action.target.length === c.length &&
        action.target.every(
          (n) => Number.isInteger(n) && n >= 0 && n < c.choices,
        ) &&
        (c.repeats || new Set(action.target).size === c.length) &&
        !a.targets.some((t) => sameSequence(t, action.target))
      )
        next = {
          ...a,
          phase: "ready",
          targets: a.targets.map((t, i) => (i === a.round ? action.target : t)),
        };
      break;
  }
  return next === a
    ? a
    : { ...next, revision: a.revision + 1, updatedAt: Date.now() };
}
export function recoverSequence(a: SequenceAttempt) {
  return reduceSequence(a, { type: "pause" });
}
export function visibleSymbol(
  a: SequenceAttempt,
  now: number,
): { symbol: number; index: number } | null {
  if (a.phase !== "show" || a.revealEndsAt === null) return null;
  const c = sequenceConfig(a.stage);
  const period = c.onMs + c.gapMs;
  const elapsed = now - (a.revealEndsAt - c.length * period);
  if (elapsed < 0 || elapsed >= c.length * period || elapsed % period >= c.onMs)
    return null;
  const index = Math.floor(elapsed / period);
  return { symbol: a.targets[a.round][index], index };
}
