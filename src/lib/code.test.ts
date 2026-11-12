import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  candidateCodes,
  codeConfig,
  codeExample,
  gradeCode,
  matchesClues,
  newCode,
  sameCode,
  validCode,
  type CodeGuess,
} from "./code-rules";
import {
  codeOutcome,
  codeSchema,
  makeCodeAttempt,
  recoverCode,
  reduceCode,
  type CodeAttempt,
} from "./code";
import { outcome, nextStage } from "./memory-common";
import { attemptGame } from "./memory-types";
import { codeEngine } from "./memory-engines";
import { readAllAttempts, readAttempts, saveAttempt } from "./storage";
import { makeAttempt } from "./pattern";
import { completedSchema } from "../server/contracts";
function begin(stage = 1, mode: CodeAttempt["mode"] = "stage") {
  let a = makeCodeAttempt(stage, mode);
  if (codeConfig(stage).requiresTutorial) {
    a = reduceCode(a, { type: "tutorial" });
    const e = codeExample(stage);
    a = reduceCode(a, {
      type: "example",
      exact: e.exact,
      misplaced: e.misplaced,
    });
  }
  return reduceCode(a, { type: "start" });
}
function guess(a: CodeAttempt, symbols: number[]) {
  for (let i = 0; i < symbols.length; i++) {
    a = reduceCode(a, { type: "slot", index: i });
    a = reduceCode(a, { type: "clear" });
  }
  for (let i = 0; i < symbols.length; i++) {
    a = reduceCode(a, { type: "slot", index: i });
    a = reduceCode(a, { type: "fill", symbol: symbols[i] });
  }
  return reduceCode(a, { type: "confirm" });
}
describe("code deduction and content", () => {
  it("matches exact first and never overcounts repeated symbols", () => {
    expect(gradeCode([0, 1, 0, 2], [0, 0, 1, 3])).toEqual({
      exact: 1,
      misplaced: 2,
    });
    expect(gradeCode([0, 0, 1, 2], [0, 0, 0, 0])).toEqual({
      exact: 2,
      misplaced: 0,
    });
    expect(gradeCode([0, 1, 2, 3], [3, 2, 1, 0])).toEqual({
      exact: 0,
      misplaced: 4,
    });
    expect(gradeCode([0, 1, 0, 1], [1, 0, 1, 0])).toEqual({
      exact: 0,
      misplaced: 4,
    });
    expect(() => gradeCode([0], [0, 1])).toThrow();
  });
  it("agrees with independent multiset intersection for every pair of three-symbol triples", () => {
    const codes = Array.from({ length: 27 }, (_, n) => [
      Math.floor(n / 9),
      Math.floor(n / 3) % 3,
      n % 3,
    ]);
    for (const a of codes)
      for (const b of codes) {
        const r = gradeCode(a, b);
        const exact = a.filter((v, i) => v === b[i]).length;
        const total = [0, 1, 2].reduce(
          (sum, n) =>
            sum +
            Math.min(
              a.filter((v) => v === n).length,
              b.filter((v) => v === n).length,
            ),
          0,
        );
        expect(r).toEqual({ exact, misplaced: total - exact });
        expect(r).toEqual(gradeCode(b, a));
      }
  });
  it("generates all 30 stages with the specified six bands and distinct tutorial codes", () => {
    let seed = 47;
    const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let stage = 1; stage <= 30; stage++) {
      const c = codeConfig(stage),
        band = Math.floor((stage - 1) / 5);
      expect([c.length, c.choices, c.repeats, c.maxGuesses]).toEqual(
        [
          [3, 4, false, 6],
          [3, 5, false, 6],
          [4, 5, false, 7],
          [4, 6, false, 8],
          [4, 6, true, 9],
          [5, 6, true, 10],
        ][band],
      );
      expect(c.requiresTutorial).toBe((stage - 1) % 5 === 0);
      for (let n = 0; n < 30; n++) {
        const code = newCode(stage, [], rng);
        expect(validCode(code, stage)).toBe(true);
      }
      expect(
        sameCode(makeCodeAttempt(stage).secret, codeExample(stage).target),
      ).toBe(false);
      expect(codeSchema.safeParse(begin(stage)).success).toBe(true);
    }
  });
  it("filters candidates using public feedback, retains the secret and isolates the cached pool", () => {
    const history = [{ symbols: [0, 0, 1, 3], exact: 1, misplaced: 2 }];
    const candidates = candidateCodes(21, history);
    expect(candidates).toContainEqual([0, 1, 0, 2]);
    expect(candidates.every((c) => matchesClues(c, history))).toBe(true);
    expect(candidateCodes(1, [])).toHaveLength(24);
    candidates[0][0] = 99;
    expect(candidateCodes(21, history).some((c) => c.includes(99))).toBe(false);
  });
  it("can solve every introductory code using only earlier feedback within six guesses", () => {
    for (const secret of candidateCodes(1, [])) {
      const history: CodeGuess[] = [];
      let solved = false;
      for (let n = 0; n < 6; n++) {
        const symbols = candidateCodes(1, history)[0];
        const r = gradeCode(secret, symbols);
        history.push({ symbols, ...r });
        if (r.exact === 3) {
          solved = true;
          break;
        }
      }
      expect(solved).toBe(true);
    }
  });
});
describe("code session, results and storage", () => {
  it("requires new-band tutorials, rejects a wrong example and allows direct start elsewhere", () => {
    let a = makeCodeAttempt(1);
    expect(reduceCode(a, { type: "start" })).toBe(a);
    a = reduceCode(a, { type: "tutorial" });
    a = reduceCode(a, { type: "example", exact: 0, misplaced: 0 });
    expect(reduceCode(a, { type: "start" })).toBe(a);
    const e = codeExample(1);
    a = reduceCode(a, {
      type: "example",
      exact: e.exact,
      misplaced: e.misplaced,
    });
    expect(reduceCode(a, { type: "start" }).phase).toBe("playing");
    expect(reduceCode(makeCodeAttempt(2), { type: "start" }).phase).toBe(
      "playing",
    );
  });
  it("rejects incomplete, out-of-range, repeated symbols and duplicate guesses without using an attempt", () => {
    let a = begin();
    expect(reduceCode(a, { type: "confirm" })).toBe(a);
    expect(reduceCode(a, { type: "fill", symbol: 4 })).toBe(a);
    a = reduceCode(a, { type: "fill", symbol: 0 });
    expect(reduceCode(a, { type: "fill", symbol: 0 })).toBe(a);
    const wrong = candidateCodes(1, []).find((c) => !sameCode(c, a.secret))!;
    a = guess(a, wrong);
    expect(a.guesses).toHaveLength(1);
    expect(reduceCode(a, { type: "confirm" })).toBe(a);
    a = guess(a, wrong);
    expect(a.guesses).toHaveLength(1);
    expect(a.phase).toBe("playing");
    a = reduceCode(a, { type: "slot", index: 0 });
    a = reduceCode(a, { type: "clear" });
    expect(a.draft[0]).toBeNull();
  });
  it("scores first and final successes correctly and ends at the attempt limit", () => {
    let a = begin();
    a = guess(a, a.secret);
    expect(outcome(a)).toEqual({
      correct: 1,
      passed: true,
      score: 10000,
      independent: true,
    });
    expect(nextStage([a])).toBe(2);
    expect(reduceCode(a, { type: "confirm" })).toBe(a);
    expect(completedSchema.safeParse(a).success).toBe(true);
    let last = begin();
    const wrong = candidateCodes(1, []).filter(
      (c) => !sameCode(c, last.secret),
    );
    for (const c of wrong.slice(0, 5)) last = guess(last, c);
    last = guess(last, last.secret);
    expect(codeOutcome(last).score).toBe(8000);
    expect(codeSchema.safeParse(last).success).toBe(true);
    let failed = begin();
    for (const c of candidateCodes(1, [])
      .filter((c) => !sameCode(c, failed.secret))
      .slice(0, 6))
      failed = guess(failed, c);
    expect(failed.endReason).toBe("exhausted");
    expect(outcome(failed).score).toBe(0);
    expect(nextStage([failed])).toBe(1);
    expect(codeSchema.safeParse(failed).success).toBe(true);
  });
  it("preserves the same puzzle, guesses, draft and hints on interruption", () => {
    let a = begin(21);
    const wrong = candidateCodes(21, []).find((c) => !sameCode(c, a.secret))!;
    a = guess(a, wrong);
    a = reduceCode(a, { type: "fill", symbol: 0 });
    a = reduceCode(a, { type: "fill", symbol: 0 });
    a = reduceCode(a, { type: "hint" });
    a = reduceCode(a, { type: "hint" });
    const paused = recoverCode(a);
    expect(paused).toMatchObject({
      phase: "paused",
      secret: a.secret,
      draft: a.draft,
      guesses: a.guesses,
      hintLevel: 2,
      assisted: true,
      interrupted: true,
    });
    expect(recoverCode(paused)).toBe(paused);
    const resumed = reduceCode(paused, { type: "resume" });
    expect(resumed.secret).toEqual(a.secret);
    expect(codeSchema.safeParse(resumed).success).toBe(true);
    expect(outcome(guess(resumed, resumed.secret)).independent).toBe(false);
  });
  it("keeps practice out of progress and marks hints, skips and revealed answers", () => {
    let practice = begin(1, "practice");
    practice = guess(practice, practice.secret);
    expect(nextStage([practice])).toBe(1);
    let helped = reduceCode(begin(), { type: "hint" });
    helped = guess(helped, helped.secret);
    expect(outcome(helped)).toMatchObject({ passed: true, independent: false });
    for (const type of ["skip", "reveal"] as const) {
      const a = reduceCode(begin(), { type });
      expect(outcome(a)).toMatchObject({ passed: false, score: 0 });
      expect(codeSchema.safeParse(a).success).toBe(true);
      expect(nextStage([a])).toBe(1);
    }
    const a = begin();
    expect(codeEngine.remake!(a).secret).not.toEqual(a.secret);
  });
  it("rejects contradictory or malformed imported records without throwing from validation", () => {
    const a = begin(),
      solved = guess(a, a.secret);
    for (const value of [
      { ...a, stage: 1.5 },
      { ...a, stage: 0 },
      { ...a, secret: [0] },
      { ...solved, answers: [] },
      { ...solved, endReason: "skipped" },
      {
        ...solved,
        guesses: solved.guesses.map((g) => ({ ...g, misplaced: 1 })),
      },
      {
        ...a,
        phase: "result",
        endReason: "solved",
        answers: [{ correct: true }],
      },
      { ...a, hintLevel: 1 },
      { ...a, tutorialPassed: false },
      { ...a, draft: [0, 0, 1] },
    ]) {
      expect(() => codeSchema.safeParse(value)).not.toThrow();
      expect(codeSchema.safeParse(value).success).toBe(false);
    }
    expect(completedSchema.safeParse(a).success).toBe(false);
  });
  it("round-trips completed one-code records alongside older games and prevents stale overwrites", async () => {
    let a = begin();
    a = guess(a, a.secret);
    const older = makeAttempt(1);
    await saveAttempt(a);
    await saveAttempt(older);
    await saveAttempt({
      ...a,
      revision: 0,
      phase: "intro",
      answers: [],
      guesses: [],
      endReason: null,
    });
    expect((await readAttempts("code")).find((r) => r.id === a.id)).toEqual(a);
    expect(
      (await readAllAttempts()).find((r) => r.id === older.id)?.version,
    ).toBe("pattern-v1");
    expect(attemptGame(a)).toBe("code");
  });
});
