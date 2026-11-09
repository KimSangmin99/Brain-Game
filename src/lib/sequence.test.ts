import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  makeSequenceAttempt,
  reduceSequence,
  recoverSequence,
  sequenceConfig,
  sequenceSchema,
  sameSequence,
  newSequence,
  visibleSymbol,
} from "./sequence";
import { makeAttempt, reduceAttempt } from "./pattern";
import { outcome, nextStage } from "./memory-common";
import { readAttempts, readAllAttempts, saveAttempt } from "./storage";

describe("sequence memory rules", () => {
  it("generates distinct ordered questions at all 30 levels with correct repeat rules", () => {
    for (let stage = 1; stage <= 30; stage++) {
      const a = makeSequenceAttempt(stage);
      expect(sequenceSchema.safeParse(a).success).toBe(true);
      if (stage < 21)
        expect(a.targets.every((t) => new Set(t).size === t.length)).toBe(true);
    }
    expect(sequenceConfig(30)).toMatchObject({
      choices: 6,
      length: 7,
      repeats: true,
      onMs: 900,
      gapMs: 300,
    });
  });
  it("requires ordered equality and accepts repeated symbols when the sequence matches", () => {
    expect(sameSequence([1, 2, 0], [2, 1, 0])).toBe(false);
    expect(sameSequence([1, 1, 2], [1, 1, 2])).toBe(true);
  });
  it("displays each item for 900ms with a 300ms blank gap", () => {
    let a = reduceSequence(makeSequenceAttempt(1), { type: "start" });
    a = reduceSequence(a, { type: "show", now: 1000 });
    expect(visibleSymbol(a, 1000)).toEqual({
      symbol: a.targets[0][0],
      index: 0,
    });
    expect(visibleSymbol(a, 1899)?.index).toBe(0);
    expect(visibleSymbol(a, 1900)).toBeNull();
    expect(visibleSymbol(a, 2199)).toBeNull();
    expect(visibleSymbol(a, 2200)?.index).toBe(1);
    expect(visibleSymbol(a, 4600)).toBeNull();
    expect(reduceSequence(a, { type: "append", symbol: 0 })).toBe(a);
  });
  it("allows undo, rejects overlong input, and grades exactly once", () => {
    let a = reduceSequence(makeSequenceAttempt(1), { type: "start" });
    a = reduceSequence(a, { type: "show", now: 0 });
    a = reduceSequence(a, { type: "hide" });
    a = reduceSequence(a, { type: "append", symbol: 0 });
    a = reduceSequence(a, { type: "undo" });
    expect(a.selected).toEqual([]);
    expect(reduceSequence(a, { type: "confirm" })).toBe(a);
    for (const symbol of a.targets[0])
      a = reduceSequence(a, { type: "append", symbol });
    expect(reduceSequence(a, { type: "append", symbol: 0 })).toBe(a);
    a = reduceSequence(a, { type: "confirm" });
    expect(a.answers[0].correct).toBe(true);
    expect(reduceSequence(a, { type: "confirm" })).toBe(a);
  });
  it("preserves completed answers and marks interruption before replacing a sequence", () => {
    let a = reduceSequence(makeSequenceAttempt(1), { type: "start" });
    a = reduceSequence(a, { type: "show", now: 0 });
    a = reduceSequence(a, { type: "hide" });
    a = reduceSequence(a, { type: "skip" });
    a = reduceSequence(a, { type: "next" });
    a = reduceSequence(a, { type: "show", now: 0 });
    a = recoverSequence(a);
    expect(a.phase).toBe("paused");
    expect(a.answers).toHaveLength(1);
    expect(a.interrupted).toBe(true);
    expect(reduceSequence(a, { type: "resume", target: a.targets[1] })).toBe(a);
    a = reduceSequence(a, {
      type: "resume",
      target: newSequence(1, a.targets),
    });
    expect(a.phase).toBe("ready");
    expect(a.round).toBe(1);
  });
  it("stores a completed assisted attempt without granting independent achievement", () => {
    let a = reduceSequence(makeSequenceAttempt(1), { type: "start" });
    for (let i = 0; i < 5; i++) {
      a = reduceSequence(a, { type: "show", now: 0 });
      a = reduceSequence(a, { type: "hide" });
      if (i === 0) a = reduceSequence(a, { type: "hint" });
      for (const symbol of a.targets[i])
        a = reduceSequence(a, { type: "append", symbol });
      a = reduceSequence(a, { type: "confirm" });
      a = reduceSequence(a, { type: "next" });
    }
    expect(outcome(a)).toEqual({
      correct: 5,
      score: 10000,
      passed: true,
      independent: false,
    });
    expect(sequenceSchema.safeParse(a).success).toBe(true);
    const corrupted = {
      ...a,
      answers: a.answers.map((answer, i) =>
        i === 0 ? { ...answer, correct: false } : answer,
      ),
    };
    expect(sequenceSchema.safeParse(corrupted).success).toBe(false);
  });
});
describe("backwards-compatible game storage", () => {
  beforeEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("brain-game-guest");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
  it("retains old pattern-v1 records and separates unlocks and active sessions", async () => {
    let p = reduceAttempt(makeAttempt(1), { type: "start" });
    for (let i = 0; i < 5; i++) {
      p = reduceAttempt(p, { type: "show", now: 0 });
      p = reduceAttempt(p, { type: "hide" });
      for (const cell of p.targets[i])
        p = reduceAttempt(p, { type: "toggle", cell });
      p = reduceAttempt(p, { type: "confirm" });
      p = reduceAttempt(p, { type: "next" });
    }
    const s = makeSequenceAttempt(1);
    await saveAttempt(p);
    await saveAttempt(s);
    await saveAttempt(p);
    expect(await readAllAttempts()).toHaveLength(2);
    expect(await readAttempts()).toEqual([p]);
    expect(await readAttempts("sequence")).toEqual([s]);
    expect(nextStage(await readAttempts("pattern"))).toBe(2);
    expect(nextStage(await readAttempts("sequence"))).toBe(1);
  });
});
