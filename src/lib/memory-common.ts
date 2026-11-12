import { codeOutcome, type CodeAttempt } from "./code";
import { arrangementOutcome, type ArrangementAttempt } from "./arrangement";
export interface MemoryResultState {
  version?: "pattern-v1" | "sequence-v1" | "rule-v1";
  stage: number;
  mode: "stage" | "practice";
  phase: string;
  assisted: boolean;
  interrupted: boolean;
  answers: readonly { correct: boolean }[];
}
export function outcome(
  state: MemoryResultState | CodeAttempt | ArrangementAttempt,
) {
  if (state.version === "arrangement-v1") return arrangementOutcome(state);
  if (state.version === "code-v1") return codeOutcome(state);
  const correct = state.answers.filter((a) => a.correct).length;
  const passed = state.phase === "result" && correct >= 4;
  return {
    correct,
    score: correct * 2000,
    passed,
    independent: passed && !state.assisted && !state.interrupted,
  };
}
// Call with only one game's records: progress is always game-specific.
export function nextStage(
  attempts: readonly (MemoryResultState | CodeAttempt | ArrangementAttempt)[],
) {
  const passed = new Set(
    attempts
      .filter((a) => a.mode === "stage" && outcome(a).passed)
      .map((a) => a.stage),
  );
  let stage = 1;
  while (stage < 30 && passed.has(stage)) stage++;
  return stage;
}
