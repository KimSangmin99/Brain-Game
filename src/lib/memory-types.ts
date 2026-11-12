import type { Attempt } from "./pattern";
import type { SequenceAttempt } from "./sequence";
import type { RuleAttempt } from "./rule";
import type { CodeAttempt } from "./code";
export type MemoryAttempt =
  Attempt | SequenceAttempt | RuleAttempt | CodeAttempt;
export type MemoryGame = "pattern" | "sequence" | "rule" | "code";
export function attemptGame(a: MemoryAttempt): MemoryGame {
  return a.version === "code-v1"
    ? "code"
    : a.version === "rule-v1"
      ? "rule"
      : a.version === "sequence-v1"
        ? "sequence"
        : "pattern";
}
export interface MemoryEngine<T extends MemoryAttempt, A> {
  game: MemoryGame;
  remake?: (previous: T) => T;
  isAttempt: (a: MemoryAttempt) => a is T;
  make: (stage: number, mode: "stage" | "practice") => T;
  recover: (a: T) => T;
  reduce: (a: T, action: A) => T;
}
