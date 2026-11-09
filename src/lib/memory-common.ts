export interface MemoryResultState {
  stage: number;
  mode: "stage" | "practice";
  phase: string;
  assisted: boolean;
  interrupted: boolean;
  answers: readonly { correct: boolean }[];
}
export function outcome(state: MemoryResultState) {
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
export function nextStage(attempts: readonly MemoryResultState[]) {
  const passed = new Set(
    attempts
      .filter((a) => a.mode === "stage" && outcome(a).passed)
      .map((a) => a.stage),
  );
  let stage = 1;
  while (stage < 30 && passed.has(stage)) stage++;
  return stage;
}
