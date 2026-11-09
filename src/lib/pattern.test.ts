import { describe, expect, it, beforeEach } from "vitest";
import {
  makeAttempt,
  reduceAttempt,
  recoverAttempt,
  outcome,
  nextStage,
  configFor,
  sameCells,
  attemptSchema,
  newPattern,
} from "./pattern";
import "fake-indexeddb/auto";
import { readAttempts, saveAttempt } from "./storage";

describe("pattern rules", () => {
  it("uses the six documented bands and rejects invalid stages", () => {
    expect(configFor(1)).toMatchObject({ size: 3, count: 2, seconds: 3 });
    expect(configFor(6).count).toBe(3);
    expect(configFor(30)).toMatchObject({ size: 5, count: 7, seconds: 5 });
    expect(() => configFor(31)).toThrow();
  });
  it("generates five distinct valid patterns at every stage", () => {
    for (let stage = 1; stage <= 30; stage++)
      expect(attemptSchema.safeParse(makeAttempt(stage)).success).toBe(true);
  });
  it("compares sets but rejects duplicate cells", () => {
    expect(sameCells([2, 1], [1, 2])).toBe(true);
    expect(sameCells([1, 1], [1, 2])).toBe(false);
  });
  it("blocks premature and duplicate submissions, and caps selections", () => {
    let a = makeAttempt(1);
    expect(reduceAttempt(a, { type: "confirm" })).toBe(a);
    a = reduceAttempt(a, { type: "start" });
    a = reduceAttempt(a, { type: "show", now: 0 });
    expect(reduceAttempt(a, { type: "toggle", cell: 0 })).toBe(a);
    a = reduceAttempt(a, { type: "hide" });
    expect(reduceAttempt(a, { type: "confirm" })).toBe(a);
    for (const cell of [0, 1, 2])
      a = reduceAttempt(a, { type: "toggle", cell });
    expect(a.selected).toEqual([0, 1]);
    a = reduceAttempt(a, { type: "confirm" });
    expect(reduceAttempt(a, { type: "confirm" })).toBe(a);
  });
  it("passes four of five, grants the next stage, and preserves assistance", () => {
    let a = reduceAttempt(makeAttempt(1), { type: "start" });
    for (let i = 0; i < 5; i++) {
      a = reduceAttempt(a, { type: "show", now: 0 });
      a = reduceAttempt(a, { type: "hide" });
      if (i === 0) {
        a = reduceAttempt(a, { type: "hint" });
        a = reduceAttempt(a, { type: "skip" });
      } else {
        for (const cell of a.targets[i])
          a = reduceAttempt(a, { type: "toggle", cell });
        a = reduceAttempt(a, { type: "confirm" });
      }
      a = reduceAttempt(a, { type: "next" });
    }
    expect(outcome(a)).toEqual({
      correct: 4,
      score: 8000,
      passed: true,
      independent: false,
    });
    expect(nextStage([a])).toBe(2);
    expect(attemptSchema.safeParse(a).success).toBe(true);
  });
  it("interrupts exposed questions on recovery and requires a different pattern", () => {
    let a = reduceAttempt(makeAttempt(1), { type: "start" });
    a = reduceAttempt(a, { type: "show", now: 100 });
    a = recoverAttempt(a);
    expect(a.phase).toBe("paused");
    expect(a.interrupted).toBe(true);
    expect(reduceAttempt(a, { type: "resume", target: a.targets[0] })).toBe(a);
    const b = reduceAttempt(a, {
      type: "resume",
      target: newPattern(1, a.targets),
    });
    expect(b.phase).toBe("ready");
    expect(b.targets[0]).not.toEqual(a.targets[0]);
  });
  it("does not unlock through gaps or practice results", () => {
    expect(nextStage([])).toBe(1);
    expect(
      nextStage([
        {
          ...makeAttempt(3),
          phase: "result",
          answers: Array(5).fill({ correct: true }),
        },
      ]),
    ).toBe(1);
    expect(
      nextStage([
        {
          ...makeAttempt(1, "practice"),
          phase: "result",
          answers: Array(5).fill({ correct: true }),
        },
      ]),
    ).toBe(1);
  });
  it("rejects corrupted stored outcomes", () => {
    const a = makeAttempt(1);
    expect(attemptSchema.safeParse({ ...a, phase: "result" }).success).toBe(
      false,
    );
    expect(
      attemptSchema.safeParse({ ...a, targets: Array(5).fill([0, 0]) }).success,
    ).toBe(false);
  });
});
describe("guest persistence", () => {
  beforeEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.deleteDatabase("brain-game-guest");
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  });
  it("persists, deduplicates, and rejects stale writes", async () => {
    const a = makeAttempt(1);
    await saveAttempt(a);
    await saveAttempt(a);
    const b = reduceAttempt(a, { type: "start" });
    await saveAttempt(b);
    await saveAttempt(a);
    expect(await readAttempts()).toEqual([b]);
  });
});
