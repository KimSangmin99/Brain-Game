import {
  makeAttempt,
  recoverAttempt,
  reduceAttempt,
  type Attempt,
  type Action,
} from "./pattern";
import {
  makeSequenceAttempt,
  recoverSequence,
  reduceSequence,
  type SequenceAttempt,
  type SequenceAction,
} from "./sequence";
import type { MemoryEngine } from "./memory-types";
export const patternEngine: MemoryEngine<Attempt, Action> = {
  game: "pattern",
  isAttempt: (a): a is Attempt => a.version === "pattern-v1",
  make: makeAttempt,
  recover: recoverAttempt,
  reduce: reduceAttempt,
};
export const sequenceEngine: MemoryEngine<SequenceAttempt, SequenceAction> = {
  game: "sequence",
  isAttempt: (a): a is SequenceAttempt => a.version === "sequence-v1",
  make: makeSequenceAttempt,
  recover: recoverSequence,
  reduce: reduceSequence,
};
