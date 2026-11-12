import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  gradeSearch,
  matchesSearch,
  newSearchQuestion,
  searchConfig,
  searchExample,
  searchQuestionForStage,
  searchQuestionId,
  searchQuestionSchema,
  searchTargets,
  type SearchQuestion,
} from "./search-content";
import {
  makeSearchAttempt,
  recoverSearch,
  reduceSearch,
  searchOutcome,
  searchSchema,
  type SearchAttempt,
} from "./search";
import { outcome, nextStage } from "./memory-common";
import { attemptGame } from "./memory-types";
import { completedSchema } from "../server/contracts";
import { saveAttempt, readAttempts, readAllAttempts } from "./storage";
import { makeAttempt } from "./pattern";
import { makeRouteAttempt } from "./route";
function begin(stage = 1, mode: SearchAttempt["mode"] = "stage") {
  let a = makeSearchAttempt(stage, mode);
  if (searchConfig(stage).requiresTutorial) {
    a = reduceSearch(a, { type: "tutorial" });
    for (const cell of searchTargets(searchExample(stage)))
      a = reduceSearch(a, { type: "toggle", cell });
    a = reduceSearch(a, { type: "confirm" });
  }
  return reduceSearch(a, { type: "start" });
}
function answer(a: SearchAttempt, selected: number[]) {
  a = reduceSearch(a, { type: "clear" });
  for (const cell of selected) a = reduceSearch(a, { type: "toggle", cell });
  return reduceSearch(a, { type: "confirm" });
}
function finish(
  stage = 1,
  mode: SearchAttempt["mode"] = "stage",
  lastCount?: number,
) {
  let a = begin(stage, mode);
  for (let n = 0; n < 3; n++) {
    a = answer(
      a,
      searchTargets(a.questions[n]).slice(0, n === 2 ? lastCount : undefined),
    );
    a = reduceSearch(a, { type: "next" });
  }
  return a;
}
function fixture(): SearchQuestion {
  const q = {
    size: 3,
    target: { shape: 0, mark: null },
    cells: Array.from({ length: 9 }, (_, i) => ({
      shape: [0, 2, 4].includes(i) ? 0 : 1,
      mark: 0,
    })),
  };
  return { ...q, id: searchQuestionId(q) };
}
describe("signal search classification and content", () => {
  it("scores the specification example with TP=2 FP=1 FN=1 as 3333", () => {
    expect(gradeSearch(fixture(), [0, 2, 1])).toEqual({
      tp: 2,
      fp: 1,
      fn: 1,
      total: 3,
      score: 3333,
      correct: false,
    });
    expect(gradeSearch(fixture(), [0, 2, 4]).score).toBe(10000);
    expect(gradeSearch(fixture(), []).score).toBe(0);
    expect(
      gradeSearch(
        fixture(),
        Array.from({ length: 9 }, (_, i) => i),
      ).score,
    ).toBe(0);
  });
  it("independently checks all 512 selections on a three-target board and rejects invalid sets", () => {
    const q = fixture(),
      targets = new Set([0, 2, 4]);
    for (let mask = 0; mask < 512; mask++) {
      const selected = Array.from({ length: 9 }, (_, i) => i).filter(
          (i) => mask & (1 << i),
        ),
        tp = selected.filter((i) => targets.has(i)).length,
        fp = selected.length - tp;
      expect(gradeSearch(q, selected)).toMatchObject({
        tp,
        fp,
        fn: 3 - tp,
        score: Math.floor((10000 * Math.max(0, tp - fp)) / 3),
        correct: tp === 3 && fp === 0,
      });
    }
    for (const selected of [[0, 0], [-1], [9], [1.5], [NaN]])
      expect(() => gradeSearch(q, selected)).toThrow();
  });
  it("creates independently classified distinct boards under every stage parameter", () => {
    let seed = 711;
    const random = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let stage = 1; stage <= 30; stage++) {
      const c = searchConfig(stage),
        example = searchExample(stage),
        excluded = [example.id];
      expect([c.size, c.targets]).toEqual(
        [
          [3, 2],
          [3, 3],
          [4, 3],
          [4, 4],
          [5, 5],
          [5, 6],
        ][Math.floor((stage - 1) / 5)],
      );
      expect(c.requiresTutorial).toBe((stage - 1) % 5 === 0);
      for (let n = 0; n < 20; n++) {
        const q = newSearchQuestion(stage, excluded, random);
        expect(excluded).not.toContain(q.id);
        excluded.push(q.id);
        const expected = q.cells.flatMap((cell, i) =>
          (q.target.shape === null || cell.shape === q.target.shape) &&
          (q.target.mark === null || cell.mark === q.target.mark)
            ? [i]
            : [],
        );
        expect(expected).toHaveLength(c.targets);
        expect(searchTargets(q)).toEqual(expected);
        expect(q.cells).toHaveLength(c.size * c.size);
        expect(searchQuestionSchema.safeParse(q).success).toBe(true);
        expect(searchQuestionForStage(q, stage)).toBe(true);
        expect(gradeSearch(q, expected).score).toBe(10000);
        expect(
          gradeSearch(
            q,
            q.cells.map((_, i) => i),
          ).score,
        ).toBe(0);
      }
    }
  });
  it("requires both attributes in conjunction boards and introduces same-family near patterns from band four", () => {
    for (let stage = 11; stage <= 30; stage++) {
      const q = newSearchQuestion(stage),
        shape = q.target.shape!,
        mark = q.target.mark!,
        shapeOnly = q.cells.filter((c) => c.shape === shape && c.mark !== mark),
        markOnly = q.cells.filter((c) => c.mark === mark && c.shape !== shape);
      expect(shapeOnly.length).toBeGreaterThan(0);
      expect(markOnly.length).toBeGreaterThan(0);
      expect(
        gradeSearch(
          q,
          q.cells.flatMap((c, i) => (c.shape === shape ? [i] : [])),
        ).score,
      ).toBeLessThan(10000);
      expect(
        gradeSearch(
          q,
          q.cells.flatMap((c, i) => (c.mark === mark ? [i] : [])),
        ).score,
      ).toBeLessThan(10000);
      expect(
        shapeOnly.every(
          (c) => c.mark === (stage >= 16 ? mark ^ 1 : (mark + 2) % 4),
        ),
      ).toBe(true);
      if (stage >= 16) {
        expect(shapeOnly.length).toBeGreaterThanOrEqual(4);
        expect(
          shapeOnly.every(
            (c) => Math.floor(c.mark / 2) === Math.floor(mark / 2),
          ),
        ).toBe(true);
      }
    }
    for (let n = 0; n < 30; n++) {
      const q = newSearchQuestion(6),
        mark = q.target.mark!;
      expect(
        q.cells
          .filter((c) => c.mark !== mark)
          .every((c) => Math.floor(c.mark / 2) !== Math.floor(mark / 2)),
      ).toBe(true);
    }
  });
  it("preserves deterministic examples without exposing mutable cache entries and excludes them from scored sessions", () => {
    const first = searchExample(1),
      copy = searchExample(1);
    copy.cells[0].shape = 99;
    copy.target.shape = 99;
    expect(searchExample(1)).toEqual(first);
    for (let stage = 1; stage <= 30; stage++) {
      const a = makeSearchAttempt(stage);
      expect(a.questions).toHaveLength(3);
      expect(new Set(a.questions.map((q) => q.id)).size).toBe(3);
      expect(a.questions.some((q) => q.id === searchExample(stage).id)).toBe(
        false,
      );
      expect(searchSchema.safeParse(a).success).toBe(true);
    }
  });
});
describe("search session, three-board scoring and records", () => {
  it("requires a perfect interactive band example and does not count its errors as help", () => {
    let a = makeSearchAttempt(1);
    expect(reduceSearch(a, { type: "start" })).toBe(a);
    a = reduceSearch(a, { type: "tutorial" });
    a = reduceSearch(a, { type: "confirm" });
    expect(a.exampleChecked).toBe(true);
    expect(a.tutorialPassed).toBe(false);
    expect(a.assisted).toBe(false);
    expect(reduceSearch(a, { type: "start" })).toBe(a);
    for (const cell of searchTargets(searchExample(1)))
      a = reduceSearch(a, { type: "toggle", cell });
    a = reduceSearch(a, { type: "confirm" });
    a = reduceSearch(a, { type: "start" });
    expect(a.phase).toBe("question");
    expect(a.selected).toEqual([]);
    expect(a.answers).toEqual([]);
    expect(searchSchema.safeParse(a).success).toBe(true);
    expect(reduceSearch(makeSearchAttempt(2), { type: "start" }).phase).toBe(
      "question",
    );
  });
  it("allows toggling, clearing and an empty final selection; freezes the submitted board exactly once", () => {
    let a = begin();
    for (const cell of [-1, 9, NaN, 1.5])
      expect(reduceSearch(a, { type: "toggle", cell })).toBe(a);
    a = reduceSearch(a, { type: "toggle", cell: 2 });
    a = reduceSearch(a, { type: "toggle", cell: 0 });
    expect(a.selected).toEqual([0, 2]);
    a = reduceSearch(a, { type: "toggle", cell: 2 });
    expect(a.selected).toEqual([0]);
    a = reduceSearch(a, { type: "clear" });
    expect(a.selected).toEqual([]);
    a = reduceSearch(a, { type: "confirm" });
    expect(a.phase).toBe("feedback");
    expect(a.answers[0]).toMatchObject({
      tp: 0,
      fp: 0,
      fn: 2,
      score: 0,
      correct: false,
    });
    expect(a.assisted).toBe(false);
    expect(reduceSearch(a, { type: "confirm" })).toBe(a);
    expect(reduceSearch(a, { type: "toggle", cell: 0 })).toBe(a);
    expect(recoverSearch(a)).toBe(a);
    expect(searchSchema.safeParse(a).success).toBe(true);
  });
  it("uses the floor of the three-board mean and passes 8000 even without three perfect boards", () => {
    const a = finish(21, "stage", 2);
    expect(a.answers.map((b) => b.score)).toEqual([10000, 10000, 4000]);
    expect(outcome(a)).toEqual({
      correct: 2,
      score: 8000,
      passed: true,
      independent: true,
    });
    expect(searchSchema.safeParse(a).success).toBe(true);
    expect(searchOutcome(finish(21, "stage", 1))).toMatchObject({
      score: 7333,
      passed: false,
    });
    const complete = finish();
    expect(outcome(complete).score).toBe(10000);
    expect(nextStage([complete])).toBe(2);
    expect(searchOutcome({ ...complete, phase: "feedback" }).passed).toBe(
      false,
    );
  });
  it("keeps fractional board rounding, penalties and misses separate from perfect-board counts", () => {
    let a = begin(11);
    for (let i = 0; i < 3; i++) {
      a = answer(a, searchTargets(a.questions[i]).slice(0, 2));
      a = reduceSearch(a, { type: "next" });
    }
    expect(a.answers.map((b) => b.score)).toEqual([6666, 6666, 6666]);
    expect(outcome(a)).toMatchObject({
      score: 6666,
      correct: 0,
      passed: false,
    });
    expect(a.answers.reduce((s, b) => s + b.fn, 0)).toBe(3);
    expect(a.answers.reduce((s, b) => s + b.fp, 0)).toBe(0);
  });
  it("gives skipped and revealed boards zero, retains completed boards and excludes practice from progress", () => {
    let a = begin();
    a = reduceSearch(a, { type: "toggle", cell: 0 });
    a = reduceSearch(a, { type: "reveal" });
    expect(a.answers[0]).toMatchObject({
      selected: [],
      score: 0,
      correct: false,
      revealed: true,
    });
    expect(a.assisted).toBe(true);
    expect(a.revealed).toBe(true);
    a = reduceSearch(a, { type: "next" });
    for (let i = 1; i < 3; i++) {
      a = answer(a, searchTargets(a.questions[i]));
      a = reduceSearch(a, { type: "next" });
    }
    expect(outcome(a)).toMatchObject({
      score: 6666,
      passed: false,
      independent: false,
    });
    expect(searchSchema.safeParse(a).success).toBe(true);
    let skipped = begin();
    for (let i = 0; i < 3; i++) {
      skipped = reduceSearch(skipped, { type: "skip" });
      skipped = reduceSearch(skipped, { type: "next" });
    }
    expect(outcome(skipped).score).toBe(0);
    expect(searchSchema.safeParse(skipped).success).toBe(true);
    const practice = finish(1, "practice");
    expect(outcome(practice).passed).toBe(true);
    expect(nextStage([practice])).toBe(1);
  });
  it("replaces only the interrupted unconfirmed board, clearing its selection and preserving help and completed answers", () => {
    let a = begin(16);
    a = answer(a, searchTargets(a.questions[0]));
    a = reduceSearch(a, { type: "next" });
    a = reduceSearch(a, { type: "toggle", cell: 0 });
    a = reduceSearch(a, { type: "hint" });
    a = reduceSearch(a, { type: "hint" });
    const before = a,
      paused = recoverSearch(a);
    expect(paused).toMatchObject({
      phase: "paused",
      selected: [],
      round: 1,
      answers: a.answers,
      hintLevel: 2,
      assisted: true,
      interrupted: true,
    });
    expect(recoverSearch(paused)).toBe(paused);
    expect(
      reduceSearch(paused, { type: "resume", question: before.questions[1] }),
    ).toBe(paused);
    const replacement = newSearchQuestion(16, [
      searchExample(16).id,
      ...a.questions.map((q) => q.id),
    ]);
    a = reduceSearch(paused, { type: "resume", question: replacement });
    expect(a.questions[0]).toEqual(before.questions[0]);
    expect(a.questions[2]).toEqual(before.questions[2]);
    expect(a.questions[1].id).not.toBe(before.questions[1].id);
    expect(a.answers).toEqual(before.answers);
    expect(a.hintLevel).toBe(0);
    expect(a.assisted).toBe(true);
    expect(searchSchema.safeParse(a).success).toBe(true);
  });
  it("keeps hint-assisted completion valid while excluding independent status", () => {
    let a = reduceSearch(begin(), { type: "hint" });
    a = reduceSearch(a, { type: "hint" });
    for (let i = 0; i < 3; i++) {
      a = answer(a, searchTargets(a.questions[i]));
      a = reduceSearch(a, { type: "next" });
    }
    expect(outcome(a)).toMatchObject({
      score: 10000,
      passed: true,
      independent: false,
    });
    expect(searchSchema.safeParse(a).success).toBe(true);
  });
  it("rejects forged counts, scores, board shapes and state transitions without parser exceptions", () => {
    const a = begin(),
      complete = finish(),
      badQuestion = {
        ...a.questions[0],
        target: { shape: 3, mark: 3 },
        cells: a.questions[0].cells.map(() => ({ shape: 0, mark: 0 })),
      };
    badQuestion.id = searchQuestionId(badQuestion);
    const values: unknown[] = [
      { ...a, stage: 1.5 },
      { ...a, stage: 0 },
      { ...a, round: 4 },
      { ...a, questions: a.questions.slice(1) },
      { ...a, questions: [a.questions[0], a.questions[0], a.questions[2]] },
      { ...a, questions: [badQuestion, ...a.questions.slice(1)] },
      { ...a, selected: [0, 0] },
      { ...a, selected: [9] },
      { ...a, tutorialPassed: false },
      { ...a, hintLevel: 1 },
      { ...a, phase: "paused", selected: [0] },
      {
        ...complete,
        answers: complete.answers.map((b, i) =>
          i ? b : { ...b, tp: b.tp + 1 },
        ),
      },
      {
        ...complete,
        answers: complete.answers.map((b, i) =>
          i ? b : { ...b, score: 9000 },
        ),
      },
      { ...complete, answers: complete.answers.slice(1) },
      {
        ...complete,
        answers: complete.answers.map((b, i) =>
          i ? b : { ...b, revealed: true },
        ),
      },
      { ...complete, hintLevel: 2 },
    ];
    for (const value of values) {
      expect(() => searchSchema.safeParse(value)).not.toThrow();
      expect(searchSchema.safeParse(value).success).toBe(false);
      expect(() => completedSchema.safeParse(value)).not.toThrow();
      expect(completedSchema.safeParse(value).success).toBe(false);
    }
    expect(completedSchema.safeParse(a).success).toBe(false);
    expect(completedSchema.safeParse(complete).success).toBe(true);
  });
  it("round-trips three-board results beside older games and prevents a stale tab overwriting a completed record", async () => {
    const a = finish(),
      old = makeAttempt(1),
      route = makeRouteAttempt(1);
    await saveAttempt(a);
    await saveAttempt(old);
    await saveAttempt(route);
    const active = {
      ...a,
      phase: "question" as const,
      answers: [],
      round: 0,
      selected: [],
      hintLevel: 0,
      revision: 0,
    };
    await saveAttempt(active);
    expect((await readAttempts("search")).find((r) => r.id === a.id)).toEqual(
      a,
    );
    const all = await readAllAttempts();
    expect(all.find((r) => r.id === old.id)?.version).toBe("pattern-v1");
    expect(all.find((r) => r.id === route.id)?.version).toBe("route-v1");
    expect(attemptGame(a)).toBe("search");
  });
});
