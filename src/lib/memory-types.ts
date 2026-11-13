import type { Attempt } from "./pattern";
import type { SequenceAttempt } from "./sequence";
import type { RuleAttempt } from "./rule";
import type { CodeAttempt } from "./code";
import type { ArrangementAttempt } from "./arrangement";
import type { RouteAttempt } from "./route";
import type { SearchAttempt } from "./search";
import type { SwitchAttempt } from "./switch";
export type MemoryAttempt =
  | Attempt
  | SequenceAttempt
  | RuleAttempt
  | CodeAttempt
  | ArrangementAttempt
  | RouteAttempt
  | SearchAttempt
  | SwitchAttempt;
export type MemoryGame =
  | "pattern"
  | "sequence"
  | "rule"
  | "code"
  | "arrangement"
  | "route"
  | "search"
  | "switch";
export function attemptGame(a: MemoryAttempt): MemoryGame {
  return a.version === "switch-v1"
    ? "switch"
    : a.version === "search-v1"
      ? "search"
      : a.version === "route-v1"
        ? "route"
        : a.version === "arrangement-v1"
          ? "arrangement"
          : a.version === "code-v1"
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
