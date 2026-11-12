import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import bank from "./route-bank.json" with { type: "json" };
import {
  editRoute,
  evaluateRoute,
  newRouteQuestion,
  routeConfig,
  routeExample,
  routeFeedback,
  routeNeighbors,
  routeQuestionForStage,
  routeQuestionId,
  routeQuestionSchema,
  routeStructure,
  shortestRoute,
  type RouteQuestion,
} from "./route-content";
import {
  makeRouteAttempt,
  recoverRoute,
  reduceRoute,
  routeOutcome,
  routeSchema,
  type RouteAttempt,
} from "./route";
import { outcome, nextStage } from "./memory-common";
import { routeEngine } from "./memory-engines";
import { attemptGame } from "./memory-types";
import { completedSchema } from "../server/contracts";
import { readAllAttempts, readAttempts, saveAttempt } from "./storage";
import { makeArrangementAttempt } from "./arrangement";
import { makeAttempt } from "./pattern";
// Independent breadth-first enumeration retains every visited cell, not just waypoint state.
function enumerated(q: RouteQuestion) {
  const queue = [[q.start]],
    paths: number[][] = [];
  let head = 0;
  while (head < queue.length) {
    const path = queue[head++],
      at = path.at(-1)!;
    if (at === q.goal) {
      paths.push(path);
      continue;
    }
    const row = Math.floor(at / q.size),
      column = at % q.size;
    for (const [r, c] of [
      [row + 1, column],
      [row - 1, column],
      [row, column - 1],
      [row, column + 1],
    ])
      if (r >= 0 && c >= 0 && r < q.size && c < q.size) {
        const cell = r * q.size + c;
        if (!path.includes(cell) && !q.blocked.includes(cell))
          queue.push([...path, cell]);
      }
  }
  return paths;
}
function valid(
  q: RouteQuestion,
  p: number[],
  ignoreLimit = false,
  ignoreOrder = false,
) {
  return (
    q.required.every((c) => p.includes(c)) &&
    (ignoreOrder ||
      !q.ordered ||
      p
        .filter((c) => q.required.includes(c))
        .every((c, i) => c === q.required[i])) &&
    (ignoreLimit || q.limit === null || p.length - 1 <= q.limit)
  );
}
function begin(stage = 1, mode: RouteAttempt["mode"] = "stage") {
  let a = makeRouteAttempt(stage, mode);
  if (routeConfig(stage).requiresTutorial) {
    a = reduceRoute(a, { type: "tutorial" });
    for (const cell of shortestRoute(routeExample(stage))!.slice(1))
      a = reduceRoute(a, { type: "cell", cell });
    a = reduceRoute(a, { type: "confirm" });
  }
  return reduceRoute(a, { type: "start" });
}
function draw(a: RouteAttempt, path: readonly number[]) {
  a = reduceRoute(a, { type: "clear" });
  for (const cell of path.slice(1)) a = reduceRoute(a, { type: "cell", cell });
  return a;
}
function solve(a: RouteAttempt) {
  return reduceRoute(draw(a, shortestRoute(a.question)!), { type: "confirm" });
}
function fixture(changes: Partial<RouteQuestion> = {}): RouteQuestion {
  const q = {
    size: 3,
    start: 0,
    goal: 8,
    blocked: [4],
    required: [2],
    ordered: false,
    limit: null,
    shortest: 4,
    ...changes,
  };
  return { ...q, id: routeQuestionId(q) };
}
describe("route geometry, constraints and verified maps", () => {
  it("accepts the representative route and rejects a short path that misses its required point", () => {
    const q = fixture();
    expect(evaluateRoute(q, [0, 1, 2, 5, 8])).toMatchObject({
      correct: true,
      moves: 4,
    });
    expect(evaluateRoute(q, [0, 3, 6, 7, 8])).toMatchObject({
      correct: false,
      moves: 4,
      missing: [2],
    });
    expect(shortestRoute(q)).toEqual([0, 1, 2, 5, 8]);
  });
  it("rejects diagonal moves, row wrap, blocked cells, revisits, wrong start and passage beyond the goal", () => {
    const q = fixture();
    for (const path of [
      [0, 4, 8],
      [0, 1, 2, 3, 6, 7, 8],
      [0, 1, 4, 5, 8],
      [0, 1, 2, 1, 0, 3, 6, 7, 8],
      [1, 2, 5, 8],
      [0, 1, 2, 5, 8, 7],
    ])
      expect(evaluateRoute(q, path).correct).toBe(false);
    expect(routeNeighbors(q, 2)).not.toContain(3);
    expect(routeStructure(q, [0])).toBe(true);
    expect(evaluateRoute(q, [0]).correct).toBe(false);
  });
  it("accepts different valid paths and distinguishes order and move limits", () => {
    const q = fixture({ blocked: [], required: [], shortest: 4 });
    expect(evaluateRoute(q, [0, 1, 2, 5, 8]).correct).toBe(true);
    expect(evaluateRoute(q, [0, 3, 6, 7, 8]).correct).toBe(true);
    const long = [0, 1, 2, 5, 4, 3, 6, 7, 8];
    expect(evaluateRoute(q, long).correct).toBe(true);
    expect(evaluateRoute({ ...q, limit: 6 }, long)).toMatchObject({
      correct: false,
      limit: false,
    });
    expect(shortestRoute({ ...q, limit: 6 }, long)).toBeNull();
    const ordered = fixture({
      required: [2, 6],
      blocked: [],
      ordered: true,
      shortest: 8,
    });
    expect(evaluateRoute(ordered, [0, 1, 2, 5, 4, 3, 6, 7, 8]).correct).toBe(
      true,
    );
    expect(evaluateRoute(ordered, [0, 3, 6, 7, 4, 1, 2, 5, 8])).toMatchObject({
      correct: false,
      order: false,
    });
    expect(
      evaluateRoute({ ...ordered, ordered: false }, [0, 3, 6, 7, 4, 1, 2, 5, 8])
        .correct,
    ).toBe(true);
  });
  it("does not invent a solution that revisits an articulation cell to visit a dead-end point", () => {
    const q = fixture({ blocked: [3, 5, 6], required: [2], shortest: 5 });
    expect(enumerated(q).filter((p) => valid(q, p))).toHaveLength(0);
    expect(shortestRoute(q)).toBeNull();
  });
  it("independently verifies all 150 distinct maps, every valid endpoint path and the exact shortest distance", () => {
    const ids = new Set<string>();
    expect(bank).toHaveLength(30);
    for (const [index, entries] of bank.entries()) {
      const c = routeConfig(index + 1);
      expect(entries).toHaveLength(5);
      for (const q of entries) {
        expect(ids.has(q.id)).toBe(false);
        ids.add(q.id);
        expect(routeQuestionSchema.safeParse(q).success).toBe(true);
        expect(routeQuestionForStage(q, index + 1)).toBe(true);
        expect([
          q.size,
          q.required.length,
          q.ordered,
          q.limit !== null,
        ]).toEqual([c.size, c.points, c.ordered, c.limited]);
        const all = enumerated(q),
          correct = all.filter((p) => valid(q, p));
        expect(correct.length).toBeGreaterThan(0);
        expect(Math.min(...correct.map((p) => p.length - 1))).toBe(q.shortest);
        const solution = shortestRoute(q)!;
        expect(solution.length - 1).toBe(q.shortest);
        expect(evaluateRoute(q, solution).correct).toBe(true);
        for (const path of all)
          expect(evaluateRoute(q, path).correct).toBe(valid(q, path));
      }
    }
    expect(ids.size).toBe(150);
  });
  it("makes waypoint detours, both unordered visits, ordered visits and the final upper bound meaningful", () => {
    for (const [index, entries] of bank.entries())
      for (const q of entries) {
        const all = enumerated(q);
        if (index >= 5 && index < 15)
          expect(Math.min(...all.map((p) => p.length - 1))).toBeLessThan(
            q.shortest,
          );
        if (index >= 15 && index < 20)
          expect(
            new Set(
              all
                .filter((p) => valid(q, p))
                .map((p) => p.filter((c) => q.required.includes(c)).join(",")),
            ).size,
          ).toBe(2);
        if (index >= 20)
          expect(
            all.some((p) => valid(q, p, true, true) && !valid(q, p, true)),
          ).toBe(true);
        if (index >= 25)
          expect(all.some((p) => valid(q, p, true) && !valid(q, p))).toBe(true);
      }
  });
  it("gives exact prefix extensions, refuses impossible prefixes and isolates map and solution caches", () => {
    const q = routeExample(26),
      solution = shortestRoute(q)!,
      prefix = solution.slice(0, 5),
      extension = shortestRoute(q, prefix)!;
    expect(extension.slice(0, 5)).toEqual(prefix);
    expect(evaluateRoute(q, extension).correct).toBe(true);
    extension[0] = 99;
    expect(shortestRoute(q, prefix)![0]).toBe(q.start);
    const wrong = enumerated(q).find(
      (p) => valid(q, p, true, true) && !valid(q, p, true),
    )!;
    expect(shortestRoute(q, wrong)).toBeNull();
    const original = routeExample(1),
      copy = routeExample(1);
    copy.blocked.push(99);
    expect(routeExample(1)).toEqual(original);
    const a = makeRouteAttempt(1);
    expect(a.question.id).not.toBe(routeExample(1).id);
    expect(routeEngine.remake!(a).question.id).not.toBe(a.question.id);
  });
});
describe("route session, learning score and storage", () => {
  it("requires an interactive band example, permits correction and leaves the scored map untouched", () => {
    let a = makeRouteAttempt(1);
    expect(reduceRoute(a, { type: "start" })).toBe(a);
    a = reduceRoute(a, { type: "tutorial" });
    expect(reduceRoute(a, { type: "confirm" })).toBe(a);
    const path = shortestRoute(routeExample(1))!;
    a = reduceRoute(a, { type: "cell", cell: path[1] });
    a = reduceRoute(a, { type: "confirm" });
    expect(a.tutorialPassed).toBe(false);
    expect(a.assisted).toBe(false);
    for (const cell of path.slice(2))
      a = reduceRoute(a, { type: "cell", cell });
    a = reduceRoute(a, { type: "confirm" });
    expect(a.tutorialPassed).toBe(true);
    a = reduceRoute(a, { type: "start" });
    expect(a.draft).toEqual([a.question.start]);
    expect(a.checks).toBe(0);
    expect(routeSchema.safeParse(a).success).toBe(true);
  });
  it("ignores bad input, truncates rather than revisits, and counts neither edits nor undo as attempts", () => {
    let a = begin(),
      solution = shortestRoute(a.question)!;
    expect(reduceRoute(a, { type: "cell", cell: -1 })).toBe(a);
    expect(reduceRoute(a, { type: "cell", cell: a.question.blocked[0] })).toBe(
      a,
    );
    a = draw(a, solution.slice(0, 4));
    expect(a.draft).toEqual(solution.slice(0, 4));
    a = reduceRoute(a, { type: "cell", cell: solution[1] });
    expect(a.draft).toEqual(solution.slice(0, 2));
    a = reduceRoute(a, { type: "undo" });
    expect(a.draft).toEqual([a.question.start]);
    expect(a.checks).toBe(0);
    expect(a.assisted).toBe(false);
    expect(editRoute(fixture(), [0], 4).message).toContain("장애물");
    expect(editRoute(fixture(), [0], 8).message).toContain("상하좌우");
  });
  it("scores the shortest independent solution as 10000 and ignores a second final confirmation", () => {
    const a = solve(begin());
    expect(outcome(a)).toEqual({
      correct: 1,
      passed: true,
      score: 10000,
      independent: true,
    });
    expect(nextStage([a])).toBe(2);
    expect(a.answers).toHaveLength(1);
    expect(a.checks).toBe(1);
    expect(reduceRoute(a, { type: "confirm" })).toBe(a);
    expect(completedSchema.safeParse(a).success).toBe(true);
  });
  it("accepts a longer valid first submission and recomputes its 8000+floor(2000L/S) score", () => {
    let a = begin();
    const longer = enumerated(a.question).find(
      (p) => valid(a.question, p) && p.length - 1 > a.question.shortest,
    )!;
    expect(longer).toBeDefined();
    a = reduceRoute(draw(a, longer), { type: "confirm" });
    expect(routeOutcome(a)).toMatchObject({
      passed: true,
      independent: true,
      score:
        8000 + Math.floor((2000 * a.question.shortest) / (longer.length - 1)),
    });
    expect(routeOutcome(a).score).toBeLessThan(10000);
    expect(routeSchema.safeParse(a).success).toBe(true);
  });
  it("explains an incomplete submission and preserves it for correction with assistance marked", () => {
    let a = begin(6),
      path = shortestRoute(a.question)!;
    a = reduceRoute(draw(a, path.slice(0, 2)), { type: "confirm" });
    expect(a.phase).toBe("feedback");
    expect(a.assisted).toBe(true);
    expect(
      routeFeedback(a.question, a.lastSubmission!).some((r) => !r.ok),
    ).toBe(true);
    expect(reduceRoute(a, { type: "confirm" })).toBe(a);
    expect(reduceRoute(a, { type: "cell", cell: path[2] })).toBe(a);
    a = reduceRoute(a, { type: "retry" });
    a = solve(a);
    expect(a.checks).toBe(2);
    expect(routeOutcome(a)).toMatchObject({
      score: 10000,
      independent: false,
      passed: true,
    });
    expect(routeSchema.safeParse(a).success).toBe(true);
  });
  it("preserves the same puzzle, path, hints and feedback through interruption", () => {
    let a = begin(26);
    a = reduceRoute(a, { type: "hint" });
    a = reduceRoute(a, { type: "hint" });
    a = draw(a, shortestRoute(a.question)!.slice(0, 4));
    const paused = recoverRoute(a);
    expect(paused).toMatchObject({
      phase: "paused",
      pausedFrom: "playing",
      draft: a.draft,
      question: a.question,
      hintLevel: 2,
      interrupted: true,
      assisted: true,
    });
    expect(recoverRoute(paused)).toBe(paused);
    expect(routeSchema.safeParse(paused).success).toBe(true);
    a = reduceRoute(paused, { type: "resume" });
    a = reduceRoute(a, { type: "confirm" });
    const feedback = recoverRoute(a);
    expect(feedback.pausedFrom).toBe("feedback");
    expect(reduceRoute(feedback, { type: "resume" }).phase).toBe("feedback");
    expect(routeSchema.safeParse(feedback).success).toBe(true);
  });
  it("keeps practice, reveal and skip out of progress and excludes hints from independent solutions", () => {
    const practice = solve(begin(1, "practice"));
    expect(routeOutcome(practice).passed).toBe(true);
    expect(nextStage([practice])).toBe(1);
    for (const type of ["skip", "reveal"] as const) {
      const a = reduceRoute(begin(), { type });
      expect(routeOutcome(a)).toMatchObject({ passed: false, score: 0 });
      expect(nextStage([a])).toBe(1);
      expect(routeSchema.safeParse(a).success).toBe(true);
    }
    expect(
      routeOutcome(solve(reduceRoute(begin(), { type: "hint" }))).independent,
    ).toBe(false);
  });
  it("rejects altered maps, shortest metadata, impossible histories and malformed records without parser exceptions", () => {
    const a = begin(),
      solved = solve(a),
      partial = shortestRoute(a.question)!.slice(0, 2);
    for (const value of [
      { ...a, stage: 1.5 },
      { ...a, stage: 0 },
      { ...a, draft: [] },
      { ...a, draft: [a.question.start, a.question.start] },
      { ...a, question: { ...a.question, shortest: 1 } },
      { ...a, question: { ...a.question, blocked: [] } },
      { ...a, question: { ...a.question, size: 7 } },
      { ...a, checks: 1 },
      { ...solved, checks: 2, assisted: false },
      { ...solved, answers: [] },
      { ...solved, lastSubmission: partial },
      { ...solved, endReason: "revealed", revealed: true },
      { ...a, hintLevel: 1 },
      { ...a, tutorialPassed: false },
      { ...a, phase: "paused", pausedFrom: null },
      {
        ...a,
        phase: "feedback",
        lastSubmission: partial,
        checks: 1,
        assisted: false,
      },
    ]) {
      expect(() => routeSchema.safeParse(value)).not.toThrow();
      expect(routeSchema.safeParse(value).success).toBe(false);
    }
    expect(completedSchema.safeParse(a).success).toBe(false);
  });
  it("round-trips one-route results beside earlier games and prevents stale overwrites", async () => {
    const a = solve(begin()),
      old = makeAttempt(1),
      arrangement = makeArrangementAttempt(1);
    await saveAttempt(a);
    await saveAttempt(old);
    await saveAttempt(arrangement);
    await saveAttempt({
      ...a,
      phase: "playing",
      answers: [],
      endReason: null,
      lastSubmission: null,
      checks: 0,
      revision: 0,
    });
    expect((await readAttempts("route")).find((v) => v.id === a.id)).toEqual(a);
    const all = await readAllAttempts();
    expect(all.find((v) => v.id === old.id)?.version).toBe("pattern-v1");
    expect(all.find((v) => v.id === arrangement.id)?.version).toBe(
      "arrangement-v1",
    );
    expect(attemptGame(a)).toBe("route");
  });
});
