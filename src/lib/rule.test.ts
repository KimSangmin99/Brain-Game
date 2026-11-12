import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  answerIndex,
  explainRule,
  inferNext,
  newRuleQuestion,
  questionSchema,
  ruleConfig,
  sameTerm,
  CONTENT_VERSION,
  type RuleFamily,
  type RuleTerm,
} from "./rule-content";
import {
  makeRuleAttempt,
  reduceRule,
  recoverRule,
  ruleSchema,
  tutorialQuestion,
  outcome,
  nextStage,
  type RuleAttempt,
} from "./rule";
import { makeAttempt } from "./pattern";
import { makeSequenceAttempt } from "./sequence";
import { saveAttempt, readAllAttempts, readAttempts } from "./storage";
import { attemptGame } from "./memory-types";
const t = (direction: number, count = 2, mark = 0): RuleTerm => ({
  direction,
  count,
  mark,
});
function random() {
  let seed = 47;
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
function predicted(family: RuleFamily, shown: RuleTerm[]) {
  const alternating = family.startsWith("alternate") || family === "combined",
    a = shown[alternating ? 2 : shown.length - 2],
    b = shown[alternating ? 4 : shown.length - 1];
  return {
    direction: (((2 * b.direction - a.direction) % 4) + 4) % 4,
    mark: (((2 * b.mark - a.mark) % 4) + 4) % 4,
    count: 2 * b.count - a.count,
  };
}
export function begin(a: RuleAttempt) {
  if (ruleConfig(a.stage).requiresTutorial) {
    a = reduceRule(a, { type: "tutorial" });
    a = reduceRule(a, {
      type: "select",
      option: answerIndex(tutorialQuestion(a.stage)),
    });
  }
  return reduceRule(a, { type: "start" });
}
export function finish(stage = 1, mode: RuleAttempt["mode"] = "stage") {
  let a = begin(makeRuleAttempt(stage, mode));
  for (let i = 0; i < 5; i++) {
    a = reduceRule(a, { type: "select", option: answerIndex(a.questions[i]) });
    a = reduceRule(a, { type: "confirm" });
    a = reduceRule(a, { type: "next" });
  }
  return a;
}
describe("rule content and reasoning", () => {
  it("solves clockwise, reverse symbol, increasing/decreasing and interleaved fixtures", () => {
    expect(inferNext("rotation", [t(0), t(1), t(2), t(3)])).toEqual(t(0));
    expect(
      inferNext("marks", [t(0, 2, 0), t(0, 2, 3), t(0, 2, 2), t(0, 2, 1)]),
    ).toEqual(t(0, 2, 0));
    expect(inferNext("count", [t(0, 1), t(0, 2), t(0, 3), t(0, 4)])).toEqual(
      t(0, 5),
    );
    expect(inferNext("count", [t(0, 5), t(0, 4), t(0, 3), t(0, 2)])).toEqual(
      t(0, 1),
    );
    expect(
      inferNext("dual-count", [t(0, 1), t(1, 2), t(2, 3), t(3, 4)]),
    ).toEqual(t(0, 5));
    expect(
      inferNext("alternate-direction", [t(0), t(2), t(1), t(1), t(2), t(0)]),
    ).toEqual(t(3));
    expect(
      inferNext("combined", [
        t(0, 2, 0),
        t(2, 2, 1),
        t(1, 2, 1),
        t(1, 2, 2),
        t(2, 2, 2),
        t(0, 2, 3),
      ]),
    ).toEqual(t(3, 2, 3));
    expect(inferNext("rotation", [t(0), t(0), t(1), t(3)])).toBeNull();
  });
  it("generates valid, non-duplicate five-question sessions for all 30 stages with one independently predicted option", () => {
    const rng = random();
    for (let stage = 1; stage <= 30; stage++)
      for (let set = 0; set < 10; set++) {
        const questions = [];
        for (let n = 0; n < 5; n++) {
          const q = newRuleQuestion(
            stage,
            questions.map((q) => q.id),
            rng,
          );
          questions.push(q);
          expect(questionSchema.safeParse(q).success).toBe(true);
          expect(ruleConfig(stage).families).toContain(q.family);
          const expected = predicted(q.family, q.shown);
          expect(inferNext(q.family, q.shown)).toEqual(expected);
          expect(q.options.filter((o) => sameTerm(o, expected))).toHaveLength(
            1,
          );
        }
        expect(new Set(questions.map((q) => q.id)).size).toBe(5);
      }
  });
  it("keeps increase/decrease stage goals and makes both attributes necessary in dual questions", () => {
    const rng = random();
    for (let i = 0; i < 60; i++) {
      const increasing = newRuleQuestion(7, [], rng),
        decreasing = newRuleQuestion(8, [], rng);
      expect(increasing.shown[1].count - increasing.shown[0].count).toBe(1);
      expect(decreasing.shown[1].count - decreasing.shown[0].count).toBe(-1);
      for (const stage of [11, 12, 13, 21, 30]) {
        const q = newRuleQuestion(stage, [], rng);
        if (!["dual-marks", "dual-count", "combined"].includes(q.family))
          continue;
        const correct = inferNext(q.family, q.shown)!,
          second = q.family === "dual-count" ? "count" : "mark";
        const wrong = q.options.filter((o) => !sameTerm(o, correct));
        expect(
          wrong.some(
            (o) =>
              o.direction !== correct.direction &&
              o[second] === correct[second],
          ),
        ).toBe(true);
        expect(
          wrong.some(
            (o) =>
              o.direction === correct.direction &&
              o[second] !== correct[second],
          ),
        ).toBe(true);
        expect(
          wrong.some(
            (o) =>
              o.direction !== correct.direction &&
              o[second] !== correct[second],
          ),
        ).toBe(true);
      }
    }
  });
  it("does not expose mutable bank entries and excludes the explained example from scored questions", () => {
    const q = newRuleQuestion(1, [], () => 0),
      expected = inferNext(q.family, q.shown)!;
    q.options[answerIndex(q)].count = 5;
    expect(inferNext(q.family, q.shown)).toEqual(expected);
    for (const stage of [1, 6, 11, 16, 21, 26]) {
      const a = makeRuleAttempt(stage);
      expect(a.questions.some((q) => q.id === tutorialQuestion(stage).id)).toBe(
        false,
      );
    }
  });
  it("explains every clue in alternating problems and identifies a missed condition", async () => {
    const { optionReason } = await import("./rule-content");
    const q = newRuleQuestion(21, [], () => 0);
    const e = explainRule(q);
    expect(e.steps).toHaveLength(6);
    expect(e.steps.filter((s) => s.startsWith("홀수"))).toHaveLength(3);
    expect(e.steps.filter((s) => s.startsWith("짝수"))).toHaveLength(3);
    expect(e.conclusion).toContain("7번째");
    expect(optionReason(q, answerIndex(q))).toContain("모두");
    expect(optionReason(q, (answerIndex(q) + 1) % 4)).toContain("조건이 맞지");
  });
});
describe("rule session state and storage", () => {
  it("requires the new-band example, permits revision before confirmation, and confirms only once", () => {
    let a = makeRuleAttempt(1);
    expect(reduceRule(a, { type: "start" })).toBe(a);
    a = reduceRule(a, { type: "tutorial" });
    const right = answerIndex(tutorialQuestion(1));
    a = reduceRule(a, { type: "select", option: (right + 1) % 4 });
    expect(reduceRule(a, { type: "start" })).toBe(a);
    a = reduceRule(a, { type: "select", option: right });
    a = reduceRule(a, { type: "start" });
    expect(a.phase).toBe("question");
    expect(a.selected).toBeNull();
    expect(reduceRule(a, { type: "confirm" })).toBe(a);
    expect(reduceRule(a, { type: "select", option: 7 })).toBe(a);
    a = reduceRule(a, { type: "select", option: 0 });
    a = reduceRule(a, { type: "select", option: 1 });
    expect(a.selected).toBe(1);
    a = reduceRule(a, { type: "confirm" });
    expect(a.answers).toHaveLength(1);
    expect(reduceRule(a, { type: "confirm" })).toBe(a);
    expect(reduceRule(a, { type: "select", option: 2 })).toBe(a);
  });
  it("scores four correct answers as 8000 and does not unlock stages for practice", () => {
    let a = begin(makeRuleAttempt(2));
    for (let i = 0; i < 5; i++) {
      if (i === 4) a = reduceRule(a, { type: "skip" });
      else {
        a = reduceRule(a, {
          type: "select",
          option: answerIndex(a.questions[i]),
        });
        a = reduceRule(a, { type: "confirm" });
      }
      a = reduceRule(a, { type: "next" });
    }
    expect(outcome(a)).toMatchObject({
      score: 8000,
      passed: true,
      independent: true,
    });
    expect(ruleSchema.safeParse(a).success).toBe(true);
    const practice = finish(1, "practice");
    expect(outcome(practice).passed).toBe(true);
    expect(nextStage([practice])).toBe(1);
    let skipped = begin(makeRuleAttempt(1));
    for (let i = 0; i < 5; i++) {
      skipped = reduceRule(skipped, { type: "skip" });
      skipped = reduceRule(skipped, { type: "next" });
    }
    expect(outcome(skipped)).toMatchObject({ score: 0, passed: false });
    expect(ruleSchema.safeParse(skipped).success).toBe(true);
  });
  it("persists two hint levels and interruption, replacing only the unanswered question", () => {
    let a = begin(makeRuleAttempt(16));
    a = reduceRule(a, { type: "select", option: answerIndex(a.questions[0]) });
    a = reduceRule(a, { type: "confirm" });
    a = reduceRule(a, { type: "next" });
    a = reduceRule(a, { type: "hint" });
    a = reduceRule(a, { type: "hint" });
    expect(reduceRule(a, { type: "hint" })).toBe(a);
    a = reduceRule(a, { type: "select", option: 1 });
    const old = a.questions,
      answers = a.answers;
    a = recoverRule(a);
    expect(a.phase).toBe("paused");
    expect(a.selected).toBeNull();
    expect(a.interrupted).toBe(true);
    expect(reduceRule(a, { type: "resume", question: old[1] })).toBe(a);
    a = reduceRule(a, {
      type: "resume",
      question: newRuleQuestion(
        16,
        old.map((q) => q.id),
      ),
    });
    expect(a.questions[0]).toBe(old[0]);
    expect(a.questions[1].id).not.toBe(old[1].id);
    expect(a.answers).toBe(answers);
    expect(a.assisted).toBe(true);
    expect(a.hintLevel).toBe(0);
    expect(ruleSchema.safeParse(a).success).toBe(true);
  });
  it("rejects incorrect grading, duplicate options, impossible clues, foreign families and lost hint history without throwing", () => {
    const completed = finish();
    expect(ruleSchema.safeParse(completed).success).toBe(true);
    const bad = structuredClone(completed);
    bad.answers[0].correct = false;
    expect(ruleSchema.safeParse(bad).success).toBe(false);
    const duplicated = structuredClone(completed);
    duplicated.questions[0].options[0] = duplicated.questions[0].options[1];
    expect(ruleSchema.safeParse(duplicated).success).toBe(false);
    const impossible = structuredClone(completed);
    impossible.questions[0].shown[1].count = 5;
    expect(() => ruleSchema.safeParse(impossible)).not.toThrow();
    expect(ruleSchema.safeParse(impossible).success).toBe(false);
    const wrong = structuredClone(completed);
    wrong.questions[0] = newRuleQuestion(21);
    expect(ruleSchema.safeParse(wrong).success).toBe(false);
    const assisted = structuredClone(completed);
    assisted.answers[0].hintLevel = 1;
    expect(ruleSchema.safeParse(assisted).success).toBe(false);
    expect(
      ruleSchema.safeParse({ ...completed, contentVersion: "unknown" }).success,
    ).toBe(false);
    expect(completed.contentVersion).toBe(CONTENT_VERSION);
  });
  it("rejects truncated clues, missing questions and out-of-range stages as validation errors", () => {
    const a = finish();
    const b = finish(7);
    b.questions[0].shown = [];
    for (const bad of [
      { ...a, stage: 0 },
      { ...a, stage: 31 },
      { ...a, questions: [] },
      b,
    ]) {
      expect(() => ruleSchema.safeParse(bad)).not.toThrow();
      expect(ruleSchema.safeParse(bad).success).toBe(false);
    }
  });
  it("retains old pattern/sequence records, separate progress, and immutable rule results", async () => {
    const p = makeAttempt(1),
      s = makeSequenceAttempt(1),
      r = finish();
    await saveAttempt(p);
    await saveAttempt(s);
    await saveAttempt(r);
    await saveAttempt({ ...r, revision: r.revision + 1, assisted: true });
    const all = await readAllAttempts();
    expect(all.map(attemptGame)).toEqual(
      expect.arrayContaining(["pattern", "sequence", "rule"]),
    );
    expect((await readAttempts("rule"))[0].assisted).toBe(false);
    expect(nextStage(await readAttempts("rule"))).toBe(2);
    expect(nextStage(await readAttempts("pattern"))).toBe(1);
    expect(nextStage(await readAttempts("sequence"))).toBe(1);
  });
});
