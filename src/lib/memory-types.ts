import type { Attempt } from "./pattern";
import type { SequenceAttempt } from "./sequence";
export type MemoryAttempt = Attempt | SequenceAttempt;
export type MemoryGame = "pattern" | "sequence";
export function attemptGame(a: MemoryAttempt): MemoryGame {
  return a.version === "sequence-v1" ? "sequence" : "pattern";
}
export interface MemoryEngine<T extends MemoryAttempt, A> {
  game: MemoryGame;
  isAttempt: (a: MemoryAttempt) => a is T;
  make: (stage: number, mode: "stage" | "practice") => T;
  recover: (a: T) => T;
  reduce: (a: T, action: A) => T;
}
