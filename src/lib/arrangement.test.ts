import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  ARRANGEMENT_CONTENT_VERSION,
  allArrangements,
  arrangementConfig,
  arrangementExample,
  arrangementExplanation,
  arrangementQuestionSchema,
  arrangementSolutions,
  clueKey,
  evaluateArrangement,
  newArrangementQuestion,
  questionForArrangementStage,
  questionId,
  satisfiesClue,
  type ArrangementClue,
  type ArrangementQuestion,
} from "./arrangement-content";
import {
  arrangementOutcome,
  arrangementSchema,
  makeArrangementAttempt,
  recoverArrangement,
  reduceArrangement,
  type ArrangementAttempt,
} from "./arrangement";
import { arrangementEngine } from "./memory-engines";
import { outcome, nextStage } from "./memory-common";
import { attemptGame } from "./memory-types";
import { saveAttempt, readAttempts, readAllAttempts } from "./storage";
import { makeAttempt } from "./pattern";
import { makeCodeAttempt } from "./code";
import { completedSchema } from "../server/contracts";
function begin(stage = 1, mode: ArrangementAttempt["mode"] = "stage") {
  let a = makeArrangementAttempt(stage, mode);
  if (arrangementConfig(stage).requiresTutorial) {
    a = reduceArrangement(a, { type: "tutorial" });
    const solution = arrangementSolutions(arrangementExample(stage))[0];
    for (let slot = 0; slot < solution.length; slot++)
      a = reduceArrangement(a, { type: "move", item: solution[slot], slot });
    a = reduceArrangement(a, { type: "confirm" });
  }
  return reduceArrangement(a, { type: "start" });
}
function place(a: ArrangementAttempt, layout: number[]) {
  for (let slot = 0; slot < layout.length; slot++)
    a = reduceArrangement(a, { type: "move", item: layout[slot], slot });
  return a;
}
function solve(a: ArrangementAttempt) {
  return reduceArrangement(place(a, arrangementSolutions(a.question)[0]), {
    type: "confirm",
  });
}
function independentPermutations(items: number[]): number[][] {
  return items.length
    ? items.flatMap((n, i) =>
        independentPermutations(items.filter((_, j) => i !== j)).map((p) => [
          n,
          ...p,
        ]),
      )
    : [[]];
}
function independentMatches(layout: number[], clues: ArrangementClue[]) {
  const positions = new Map(layout.map((n, i) => [n, i]));
  return clues.every((c) => {
    const a = positions.get(c.a)!;
    if ("slot" in c) return c.kind === "at" ? a === c.slot : a !== c.slot;
    const b = positions.get(c.b)!;
    switch (c.kind) {
      case "before":
        return b > a;
      case "next":
        return b - a === 1;
      case "adjacent":
        return b - a === 1 || a - b === 1;
    }
  });
}
describe("arrangement logic and verified content", () => {
  it("distinguishes order, immediate left, undirected adjacency and negative positions", () => {
    expect(satisfiesClue([0, 2, 1], { kind: "before", a: 0, b: 1 })).toBe(true);
    expect(satisfiesClue([0, 2, 1], { kind: "next", a: 0, b: 1 })).toBe(false);
    expect(satisfiesClue([1, 0, 2], { kind: "adjacent", a: 0, b: 1 })).toBe(
      true,
    );
    expect(satisfiesClue([1, 0, 2], { kind: "next", a: 0, b: 1 })).toBe(false);
    expect(satisfiesClue([0, 1, 2], { kind: "notAt", a: 0, slot: 1 })).toBe(
      true,
    );
    expect(satisfiesClue([1, 0, 2], { kind: "notAt", a: 0, slot: 1 })).toBe(
      false,
    );
  });
  it("accepts every valid solution of a multi-solution fixture and rejects duplicates and missing entities", () => {
    const clues: ArrangementClue[] = [{ kind: "before", a: 0, b: 1 }],
      q = { id: questionId(3, clues), size: 3, clues };
    const solutions = arrangementSolutions(q);
    expect(solutions).toHaveLength(3);
    for (const solution of solutions)
      expect(evaluateArrangement(q, solution).correct).toBe(true);
    for (const draft of [
      [0, 0, 1],
      [0, null, 1],
      [0, 1, 4],
      [1, 2, 0],
    ])
      expect(evaluateArrangement(q, draft).correct).toBe(false);
    expect(
      evaluateArrangement(
        {
          id: "example",
          size: 3,
          clues: [
            { kind: "at", a: 2, slot: 2 },
            { kind: "next", a: 0, b: 1 },
          ],
        },
        [0, 1, 2],
      ).correct,
    ).toBe(true);
  });
  it("creates distinct verified puzzles for every stage and independently enumerates their unique solutions", () => {
    let seed = 118;
    const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let stage = 1; stage <= 30; stage++) {
      const c = arrangementConfig(stage);
      expect(c.size).toBe([3, 3, 4, 4, 5, 6][Math.floor((stage - 1) / 5)]);
      expect(c.requiresTutorial).toBe((stage - 1) % 5 === 0);
      const example = arrangementExample(stage),
        excluded = [example.id];
      for (let n = 0; n < 4; n++) {
        const q = newArrangementQuestion(stage, excluded, rng);
        expect(excluded).not.toContain(q.id);
        excluded.push(q.id);
        expect(q.clues.length).toBeGreaterThanOrEqual(c.size);
        expect(new Set(q.clues.map(clueKey)).size).toBe(q.clues.length);
        expect(arrangementQuestionSchema.safeParse(q).success).toBe(true);
        expect(questionForArrangementStage(q, stage)).toBe(true);
        expect(q.clues.every((clue) => c.kinds.includes(clue.kind))).toBe(true);
        const expected = independentPermutations(
          Array.from({ length: q.size }, (_, i) => i),
        ).filter((p) => independentMatches(p, q.clues));
        expect(expected).toHaveLength(1);
        expect(arrangementSolutions(q)).toEqual(expected);
        expect(evaluateArrangement(q, expected[0]).correct).toBe(true);
      }
      expect(arrangementSolutions(example)).toHaveLength(1);
    }
  });
  it("makes combined adjacency and new negative conditions necessary to identify the solution", () => {
    for (let stage = 16; stage <= 30; stage++) {
      const q = arrangementExample(stage),
        removed = stage <= 20 ? "adjacent" : "notAt";
      expect(
        arrangementSolutions({
          ...q,
          clues: q.clues.filter((c) => c.kind !== removed),
        }).length,
      ).toBeGreaterThan(1);
    }
  });
  it("keeps bank entries immutable and excludes the tutorial and previous puzzle on restart", () => {
    const q = newArrangementQuestion(1, [], () => 0),
      id = q.id;
    q.clues[0].a = 99;
    expect(newArrangementQuestion(1, [], () => 0).clues[0].a).not.toBe(99);
    expect(newArrangementQuestion(1, [], () => 0).id).toBe(id);
    const a = makeArrangementAttempt(26);
    expect(a.question.id).not.toBe(arrangementExample(26).id);
    expect(arrangementEngine.remake!(a).question.id).not.toBe(a.question.id);
    expect(a.contentVersion).toBe(ARRANGEMENT_CONTENT_VERSION);
  });
  it("produces a valid explanation for the final arrangement without mutating the question", () => {
    const q = newArrangementQuestion(26);
    const before = JSON.stringify(q),
      explanation = arrangementExplanation(q);
    expect(explanation.steps).toHaveLength(q.clues.length);
    expect(explanation.steps.at(-1)?.after).toBe(1);
    expect(evaluateArrangement(q, explanation.solution!).correct).toBe(true);
    expect(JSON.stringify(q)).toBe(before);
  });
});
describe("arrangement state, correction and records", () => {
  it("requires an interactive new-band tutorial and keeps its edits out of the scored board", () => {
    let a = makeArrangementAttempt(1);
    expect(reduceArrangement(a, { type: "start" })).toBe(a);
    a = reduceArrangement(a, { type: "tutorial" });
    expect(reduceArrangement(a, { type: "confirm" })).toBe(a);
    a = place(a, [1, 0, 2]);
    a = reduceArrangement(a, { type: "confirm" });
    expect(a.tutorialPassed).toBe(false);
    expect(a.assisted).toBe(false);
    a = place(a, [0, 1, 2]);
    a = reduceArrangement(a, { type: "confirm" });
    expect(a.tutorialPassed).toBe(true);
    a = reduceArrangement(a, { type: "start" });
    expect(a.draft).toEqual([null, null, null]);
    expect(a.checks).toBe(0);
    expect(arrangementSchema.safeParse(a).success).toBe(true);
    expect(
      reduceArrangement(makeArrangementAttempt(2), { type: "start" }).phase,
    ).toBe("playing");
  });
  it("places, moves, swaps and removes without duplicating people or counting edits as checks", () => {
    let a = begin();
    a = reduceArrangement(a, { type: "select", item: 0 });
    a = reduceArrangement(a, { type: "place", slot: 0 });
    a = reduceArrangement(a, { type: "move", item: 1, slot: 1 });
    a = reduceArrangement(a, { type: "move", item: 0, slot: 1 });
    expect(a.draft).toEqual([1, 0, null]);
    a = reduceArrangement(a, { type: "move", item: 2, slot: 1 });
    expect(a.draft).toEqual([1, 2, null]);
    a = reduceArrangement(a, { type: "move", item: 2, slot: 2 });
    expect(a.draft).toEqual([1, null, 2]);
    a = reduceArrangement(a, { type: "remove", slot: 0 });
    expect(a.draft).toEqual([null, null, 2]);
    expect(a.checks).toBe(0);
    expect(a.assisted).toBe(false);
    for (const action of [
      { type: "move", item: 3, slot: 0 },
      { type: "place", slot: -1 },
      { type: "select", item: NaN },
    ] as const)
      expect(reduceArrangement(a, action)).toBe(a);
  });
  it("scores independent first-confirm success and ignores subsequent confirms", () => {
    const a = solve(begin());
    expect(outcome(a)).toEqual({
      correct: 1,
      score: 10000,
      passed: true,
      independent: true,
    });
    expect(a.checks).toBe(1);
    expect(a.answers).toHaveLength(1);
    expect(nextStage([a])).toBe(2);
    expect(reduceArrangement(a, { type: "confirm" })).toBe(a);
    expect(completedSchema.safeParse(a).success).toBe(true);
  });
  it("preserves wrong feedback for correction, gives full learning score and records assistance", () => {
    let a = begin(16);
    const wrong = allArrangements(4).find(
      (p) => !evaluateArrangement(a.question, p).correct,
    )!;
    a = reduceArrangement(place(a, wrong), { type: "confirm" });
    expect(a.phase).toBe("feedback");
    expect(a.checks).toBe(1);
    expect(a.assisted).toBe(true);
    expect(outcome(a).score).toBe(0);
    expect(reduceArrangement(a, { type: "confirm" })).toBe(a);
    expect(reduceArrangement(a, { type: "move", item: 0, slot: 0 })).toBe(a);
    a = reduceArrangement(a, { type: "retry" });
    a = solve(a);
    expect(a.checks).toBe(2);
    expect(outcome(a)).toMatchObject({
      passed: true,
      score: 10000,
      independent: false,
    });
    expect(arrangementSchema.safeParse(a).success).toBe(true);
  });
  it("preserves puzzle, draft, feedback and hints through pause, refresh and resume", () => {
    let a = begin(21);
    a = reduceArrangement(a, { type: "hint" });
    a = reduceArrangement(a, { type: "hint" });
    a = reduceArrangement(a, { type: "move", item: 0, slot: 2 });
    const paused = recoverArrangement(a);
    expect(paused).toMatchObject({
      phase: "paused",
      pausedFrom: "playing",
      draft: a.draft,
      question: a.question,
      hintLevel: 2,
      assisted: true,
      interrupted: true,
    });
    expect(recoverArrangement(paused)).toBe(paused);
    expect(arrangementSchema.safeParse(paused).success).toBe(true);
    a = reduceArrangement(paused, { type: "resume" });
    const wrong = allArrangements(5).find(
      (p) => !evaluateArrangement(a.question, p).correct,
    )!;
    a = reduceArrangement(place(a, wrong), { type: "confirm" });
    const feedback = recoverArrangement(a);
    expect(feedback.pausedFrom).toBe("feedback");
    expect(reduceArrangement(feedback, { type: "resume" }).phase).toBe(
      "feedback",
    );
    expect(arrangementSchema.safeParse(feedback).success).toBe(true);
  });
  it("does not unlock stages for practice, reveal or skip and restricts independent status after hints", () => {
    const practice = solve(begin(1, "practice"));
    expect(arrangementOutcome(practice).passed).toBe(true);
    expect(nextStage([practice])).toBe(1);
    for (const type of ["reveal", "skip"] as const) {
      const a = reduceArrangement(begin(), { type });
      expect(outcome(a)).toMatchObject({ passed: false, score: 0 });
      expect(arrangementSchema.safeParse(a).success).toBe(true);
      expect(nextStage([a])).toBe(1);
    }
    const a = solve(reduceArrangement(begin(), { type: "hint" }));
    expect(arrangementOutcome(a)).toMatchObject({
      passed: true,
      independent: false,
    });
  });
  it("rejects forged scores, contradictory histories and malformed questions without parser exceptions", () => {
    const a = begin(),
      solved = solve(a);
    const wrong = allArrangements(3).find(
      (p) => !evaluateArrangement(a.question, p).correct,
    )!;
    const forged: unknown[] = [
      { ...a, stage: 1.5 },
      { ...a, stage: 0 },
      { ...a, draft: [0, 0, 1] },
      { ...a, checks: 1 },
      { ...solved, assisted: false, checks: 2 },
      { ...a, hintLevel: 1 },
      { ...a, phase: "paused", pausedFrom: null },
      {
        ...a,
        phase: "feedback",
        checks: 1,
        lastSubmission: wrong,
        assisted: false,
      },
      { ...solved, lastSubmission: wrong },
      { ...solved, endReason: "revealed", revealed: true },
      { ...solved, answers: [] },
      { ...a, tutorialPassed: false },
      {
        ...a,
        question: {
          ...a.question,
          clues: a.question.clues.map((c, i) =>
            i ? c : { kind: "at", a: 99, slot: 0 },
          ),
        },
      },
      { ...a, question: { ...a.question, size: 2 } },
    ];
    for (const f of forged) {
      expect(() => arrangementSchema.safeParse(f)).not.toThrow();
      expect(arrangementSchema.safeParse(f).success).toBe(false);
    }
    expect(completedSchema.safeParse(a).success).toBe(false);
  });
  it("round-trips one-puzzle results alongside older games and keeps completed records immutable", async () => {
    const a = solve(begin()),
      old = makeAttempt(1),
      code = makeCodeAttempt(1);
    await saveAttempt(a);
    await saveAttempt(old);
    await saveAttempt(code);
    await saveAttempt({
      ...a,
      phase: "playing",
      answers: [],
      endReason: null,
      lastSubmission: null,
      checks: 0,
      revision: 0,
    });
    expect(
      (await readAttempts("arrangement")).find((v) => v.id === a.id),
    ).toEqual(a);
    const all = await readAllAttempts();
    expect(all.find((v) => v.id === old.id)?.version).toBe("pattern-v1");
    expect(all.find((v) => v.id === code.id)?.version).toBe("code-v1");
    expect(attemptGame(a)).toBe("arrangement");
  });
});
