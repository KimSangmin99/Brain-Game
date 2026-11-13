import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  SWITCH_RULES,
  balancedSwitchQuestions,
  newSwitchQuestions,
  replacementSwitchQuestion,
  switchAnswer,
  switchChanged,
  switchConfig,
  switchExample,
  switchRuleAt,
  switchSignalKey,
  type SwitchQuestion,
} from "./switch-content";
import {
  makeSwitchAttempt,
  reduceSwitch,
  recoverSwitch,
  switchSchema,
  switchStats,
  type SwitchAttempt,
  type SwitchAction,
} from "./switch";
import { outcome, nextStage } from "./memory-common";
import { attemptGame } from "./memory-types";
import { completedSchema } from "../server/contracts";
import { saveAttempt, readAttempts, readAllAttempts } from "./storage";
import { makeAttempt } from "./pattern";
export function beginSwitch(stage = 1, mode: SwitchAttempt["mode"] = "stage") {
  let a = makeSwitchAttempt(stage, mode);
  if (switchConfig(stage).requiresTutorial) {
    a = reduceSwitch(a, { type: "tutorial" });
    a = reduceSwitch(a, {
      type: "tutorialAnswer",
      choice: switchAnswer(switchExample(stage)),
    });
  }
  return reduceSwitch(a, { type: "start", now: 10000 });
}
function ready(a: SwitchAttempt) {
  while (a.phase === "cue" || a.phase === "gap")
    a = reduceSwitch(a, {
      type: "tick",
      questionId: a.questions[a.round].id,
      now: a.endsAt!,
    });
  return a;
}
function show(a: SwitchAttempt) {
  a = ready(a);
  return reduceSwitch(a, {
    type: "show",
    questionId: a.questions[a.round].id,
    now: 100000 + a.round * 100000,
  });
}
export function finishSwitch(
  stage = 1,
  mode: SwitchAttempt["mode"] = "stage",
  correct = 20,
) {
  let a = beginSwitch(stage, mode);
  for (let i = 0; i < 20; i++) {
    a = show(a);
    a = reduceSwitch(a, {
      type: "answer",
      questionId: a.questions[i].id,
      choice: (switchAnswer(a.questions[i]) ^ (i < correct ? 0 : 1)) as 0 | 1,
      now: a.startedAt! + 250,
    });
    a = reduceSwitch(a, { type: "next", now: 100000 + i * 100000 + 1000 });
  }
  return a;
}
describe("rule switch content and independent truth table", () => {
  it("matches all six published bands and balances 20 answers under every schedule", () => {
    let seed = 962;
    const random = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let stage = 1; stage <= 30; stage++) {
      const c = switchConfig(stage),
        band = Math.floor((stage - 1) / 5);
      expect([c.rules.length, c.interval, c.seconds]).toEqual(
        [
          [1, 20, 5],
          [1, 20, 4],
          [2, 5, 5],
          [2, 4, 4],
          [2, 3, 4],
          [3, 2, 4],
        ][band],
      );
      expect(c.requiresTutorial).toBe((stage - 1) % 5 === 0);
      for (let n = 0; n < 10; n++) {
        const qs = newSwitchQuestions(stage, random),
          values = qs.map((q) => q.signal[q.rule]);
        expect(qs).toHaveLength(20);
        expect(new Set(qs.map((q) => q.id)).size).toBe(20);
        expect(values.filter((v) => v === 1)).toHaveLength(10);
        expect(balancedSwitchQuestions(qs, stage)).toBe(true);
        qs.forEach((q, i) => {
          expect(q.rule).toBe(
            c.rules[Math.floor(i / c.interval) % c.rules.length],
          );
          SWITCH_RULES.forEach((k) =>
            expect(q.signal[k] === null).toBe(!c.visible.includes(k)),
          );
        });
        expect(
          values.some(
            (v, i) =>
              i >= 3 && values.slice(i - 3, i + 1).every((x) => x === v),
          ),
        ).toBe(false);
        expect(values.some((v, i) => i > 0 && v === values[i - 1])).toBe(true);
        if (c.visible.length > 1)
          expect(
            qs.filter((q) =>
              c.visible.some(
                (k) => k !== q.rule && q.signal[k] !== q.signal[q.rule],
              ),
            ).length,
          ).toBeGreaterThanOrEqual(6);
      }
    }
  });
  it("uses only the instructed attribute for all 24 combinations", () => {
    for (let mask = 0; mask < 8; mask++)
      for (const [index, rule] of SWITCH_RULES.entries()) {
        const q: SwitchQuestion = {
          id: crypto.randomUUID(),
          rule,
          signal: {
            shape: (mask & 1) as 0 | 1,
            tone: ((mask >> 1) & 1) as 0 | 1,
            direction: ((mask >> 2) & 1) as 0 | 1,
          },
        };
        expect(switchAnswer(q)).toBe((mask >> index) & 1);
      }
  });
  it("keeps examples immutable and replaces exposed stimuli rather than just IDs", () => {
    for (let stage = 1; stage <= 30; stage++) {
      const a = makeSwitchAttempt(stage);
      expect(switchSchema.safeParse(a).success).toBe(true);
      const q = replacementSwitchQuestion(stage, 0, a.questions[0]);
      expect(q.id).not.toBe(a.questions[0].id);
      expect(q.rule).toBe(switchRuleAt(stage, 0));
      expect(switchSignalKey(q.signal)).not.toBe(
        switchSignalKey(a.questions[0].signal),
      );
    }
    const q = switchExample(1);
    q.signal.shape = 1;
    expect(switchExample(1).signal.shape).toBe(0);
  });
});
describe("rule switch timing, scoring and recovery", () => {
  it("requires the interactive example in each first band stage, without penalizing mistakes", () => {
    let a = makeSwitchAttempt(1);
    expect(reduceSwitch(a, { type: "start", now: 100 })).toBe(a);
    a = reduceSwitch(a, { type: "tutorial" });
    a = reduceSwitch(a, { type: "tutorialAnswer", choice: 1 });
    expect(reduceSwitch(a, { type: "start", now: 100 })).toBe(a);
    a = reduceSwitch(a, { type: "tutorialAnswer", choice: 0 });
    a = reduceSwitch(a, { type: "start", now: 100 });
    expect(a.phase).toBe("cue");
    expect(a.assisted).toBe(false);
    expect(switchSchema.safeParse(a).success).toBe(true);
  });
  it("ignores preparation input and accepts the first response exactly once with stale-token protection", () => {
    let a = beginSwitch(),
      qid = a.questions[0].id;
    const answer: SwitchAction = {
      type: "answer",
      questionId: qid,
      choice: 0,
      now: 10100,
    };
    expect(reduceSwitch(a, answer)).toBe(a);
    a = ready(a);
    expect(reduceSwitch(a, answer)).toBe(a);
    a = show(a);
    expect(
      reduceSwitch(a, {
        ...answer,
        questionId: crypto.randomUUID(),
        now: a.startedAt! + 1,
      }),
    ).toBe(a);
    expect(reduceSwitch(a, { ...answer, now: a.startedAt! - 1 })).toBe(a);
    for (const time of [NaN, Infinity, -1, 1.5])
      expect(reduceSwitch(a, { ...answer, now: time })).toBe(a);
    a = reduceSwitch(a, { ...answer, now: a.startedAt! + 3 });
    expect(a.answers).toHaveLength(1);
    expect(reduceSwitch(a, answer)).toBe(a);
    a = reduceSwitch(a, { type: "next", now: 110000 });
    a = show(a);
    expect(reduceSwitch(a, { ...answer, now: a.startedAt! + 1 })).toBe(a);
  });
  it("excludes the 500ms blank gap and 1000ms rule cue from response time", () => {
    let a = beginSwitch(11);
    const qid = a.questions[0].id;
    expect(reduceSwitch(a, { type: "tick", questionId: qid, now: 10999 })).toBe(
      a,
    );
    a = reduceSwitch(a, { type: "tick", questionId: qid, now: 11000 });
    expect(a.phase).toBe("ready");
    a = reduceSwitch(a, { type: "show", questionId: qid, now: 50000 });
    a = reduceSwitch(a, {
      type: "answer",
      questionId: qid,
      choice: switchAnswer(a.questions[0]),
      now: 50200,
    });
    expect(a.answers[0].elapsedMs).toBe(200);
    a = reduceSwitch(a, { type: "next", now: 60000 });
    expect(a.phase).toBe("gap");
    expect(a.endsAt).toBe(60500);
    expect(switchSchema.safeParse(a).success).toBe(true);
    expect(
      reduceSwitch(a, {
        type: "tick",
        questionId: a.questions[1].id,
        now: 60499,
      }),
    ).toBe(a);
    a = ready(a);
    expect(a.phase).toBe("ready");
    for (let i = 1; i < 5; i++) {
      a = show(a);
      a = reduceSwitch(a, {
        type: "skip",
        questionId: a.questions[i].id,
        now: a.startedAt! + 100,
      });
      a = reduceSwitch(a, { type: "next", now: a.round * 100000 + 150000 });
      if (i < 4) a = ready(a);
    }
    a = reduceSwitch(a, {
      type: "tick",
      questionId: a.questions[5].id,
      now: a.endsAt!,
    });
    expect(a.phase).toBe("cue");
    expect(a.endsAt! - a.startedAt!).toBe(1000);
  });
  it("accepts a response 1ms before the deadline and records exact or late arrival as timeout", () => {
    const original = show(beginSwitch(1)),
      qid = original.questions[0].id,
      choice = switchAnswer(original.questions[0]);
    const before = reduceSwitch(original, {
      type: "answer",
      questionId: qid,
      choice,
      now: original.endsAt! - 1,
    });
    expect(before.answers[0]).toMatchObject({
      reason: "answered",
      correct: true,
      elapsedMs: 4999,
    });
    for (const type of ["answer", "skip", "reveal"] as const)
      for (const delay of [0, 1, 100000]) {
        const late = reduceSwitch(original, {
          type,
          questionId: qid,
          choice,
          now: original.endsAt! + delay,
        });
        expect(late.answers[0]).toMatchObject({
          reason: "timeout",
          selected: null,
          correct: false,
          elapsedMs: 5000,
        });
        expect(late.assisted).toBe(false);
        expect(switchSchema.safeParse(late).success).toBe(true);
      }
  });
  it("makes practice untimed and keeps its progress separate", () => {
    let a = show(beginSwitch(1, "practice"));
    expect(a.endsAt).toBeNull();
    expect(
      reduceSwitch(a, {
        type: "timeout",
        questionId: a.questions[0].id,
        now: 1000000000,
      }),
    ).toBe(a);
    a = reduceSwitch(a, {
      type: "answer",
      questionId: a.questions[0].id,
      choice: switchAnswer(a.questions[0]),
      now: 1000000000,
    });
    expect(a.answers[0].elapsedMs).toBeGreaterThan(5000);
    expect(switchSchema.safeParse(a).success).toBe(true);
    expect(nextStage([finishSwitch(1, "practice")])).toBe(1);
  });
  it("passes exactly 16 of 20, preserves game-specific scores and reports per-rule transitions", () => {
    const a = finishSwitch(26, "stage", 16);
    expect(outcome(a)).toEqual({
      correct: 16,
      score: 8000,
      passed: true,
      independent: true,
    });
    expect(outcome(finishSwitch(1, "stage", 15)).passed).toBe(false);
    expect(nextStage([finishSwitch()])).toBe(2);
    expect(switchStats(a).changedTotal).toBe(9);
    expect(switchStats(a).byRule.map((r) => r.total)).toEqual([8, 6, 6]);
    expect(switchStats(a).meanCorrectMs).toBe(250);
    expect(completedSchema.safeParse(a).success).toBe(true);
  });
  it("keeps skip, reveal, wrong answer and timeout distinct and preserves assistance", () => {
    let a = ready(beginSwitch());
    a = reduceSwitch(a, {
      type: "hint",
      questionId: a.questions[0].id,
      now: 20000,
    });
    a = show(a);
    expect(
      reduceSwitch(a, {
        type: "hint",
        questionId: a.questions[0].id,
        now: a.startedAt! + 1,
      }),
    ).toBe(a);
    for (let i = 0; i < 20; i++) {
      if (i) a = show(a);
      const qid = a.questions[i].id;
      a =
        i === 0
          ? reduceSwitch(a, {
              type: "reveal",
              questionId: qid,
              now: a.startedAt! + 10,
            })
          : i === 1
            ? reduceSwitch(a, {
                type: "skip",
                questionId: qid,
                now: a.startedAt! + 10,
              })
            : i === 2
              ? reduceSwitch(a, {
                  type: "timeout",
                  questionId: qid,
                  now: a.endsAt!,
                })
              : reduceSwitch(a, {
                  type: "answer",
                  questionId: qid,
                  choice: switchAnswer(a.questions[i]),
                  now: a.startedAt! + 10,
                });
      a = reduceSwitch(a, { type: "next", now: 200000 + i * 100000 });
      expect(switchSchema.safeParse(a).success).toBe(true);
    }
    expect(outcome(a)).toMatchObject({
      correct: 17,
      passed: true,
      independent: false,
    });
    expect(switchStats(a)).toMatchObject({
      timeouts: 1,
      skipped: 1,
      revealed: 1,
      wrong: 0,
    });
  });
  it("pauses before exposure without penalty, but replaces only an exposed question and preserves history", () => {
    let a = ready(beginSwitch());
    let paused = recoverSwitch(a);
    expect(paused.interrupted).toBe(false);
    a = reduceSwitch(paused, { type: "resume", now: 30000 });
    expect(a.questions).toEqual(paused.questions);
    a = show(a);
    a = reduceSwitch(a, {
      type: "answer",
      questionId: a.questions[0].id,
      choice: 0,
      now: a.startedAt! + 1,
    });
    expect(recoverSwitch(a)).toBe(a);
    a = reduceSwitch(a, { type: "next", now: 200000 });
    a = show(a);
    paused = recoverSwitch(a);
    expect(paused.interrupted).toBe(true);
    expect(recoverSwitch(paused)).toBe(paused);
    expect(
      reduceSwitch(paused, {
        type: "resume",
        now: 300000,
        question: a.questions[1],
      }),
    ).toBe(paused);
    const newQ = replacementSwitchQuestion(1, 1, a.questions[1]);
    const resumed = reduceSwitch(paused, {
      type: "resume",
      now: 300000,
      question: newQ,
    });
    expect(resumed.questions[0]).toEqual(a.questions[0]);
    expect(resumed.questions[1]).toEqual(newQ);
    expect(resumed.questions.slice(2)).toEqual(a.questions.slice(2));
    expect(resumed.answers).toEqual(a.answers);
    expect(switchSchema.safeParse(resumed).success).toBe(true);
  });
  it("rejects invalid clocks, answer metadata, schedules and malformed arrays without parser exceptions", () => {
    const a = show(beginSwitch()),
      done = finishSwitch();
    const invalid: unknown[] = [
      { ...a, stage: 0 },
      { ...a, stage: 1.5 },
      { ...a, round: 20 },
      { ...a, questions: [] },
      { ...a, questions: [...a.questions, a.questions[0]] },
      { ...done, answers: [...done.answers, done.answers[0]] },
      { ...done, answers: done.answers.slice(1) },
      { ...a, endsAt: a.endsAt! + 1 },
      { ...a, timing: "untimed" },
      { ...a, tutorialChoice: null },
      {
        ...done,
        answers: done.answers.map((r, i) =>
          i ? r : { ...r, correct: !r.correct },
        ),
      },
      {
        ...done,
        answers: done.answers.map((r, i) =>
          i ? r : { ...r, elapsedMs: 5000 },
        ),
      },
      {
        ...done,
        answers: done.answers.map((r, i) =>
          i ? r : { ...r, reason: "timeout" },
        ),
      },
      {
        ...a,
        questions: a.questions.map((q, i) =>
          i
            ? q
            : { ...q, signal: { shape: null, tone: null, direction: null } },
        ),
      },
    ];
    for (const value of invalid) {
      expect(() => switchSchema.safeParse(value)).not.toThrow();
      expect(switchSchema.safeParse(value).success).toBe(false);
      expect(() => completedSchema.safeParse(value)).not.toThrow();
      expect(completedSchema.safeParse(value).success).toBe(false);
    }
    expect(completedSchema.safeParse(a).success).toBe(false);
  });
  it("round-trips 20-answer records beside existing games and refuses stale overwrites", async () => {
    const a = finishSwitch(),
      old = makeAttempt(1);
    await saveAttempt(a);
    await saveAttempt(old);
    const stale = { ...makeSwitchAttempt(1), id: a.id };
    await saveAttempt(stale);
    expect((await readAttempts("switch")).find((r) => r.id === a.id)).toEqual(
      a,
    );
    expect(
      (await readAllAttempts()).find((r) => r.id === old.id)?.version,
    ).toBe("pattern-v1");
    expect(attemptGame(a)).toBe("switch");
  });
});
