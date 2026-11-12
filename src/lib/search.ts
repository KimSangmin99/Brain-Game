import { z } from "zod";
import {
  SEARCH_CONTENT_VERSION,
  gradeSearch,
  newSearchQuestion,
  searchConfig,
  searchExample,
  searchQuestionForStage,
  searchQuestionSchema,
  validSearchSelection,
  type SearchQuestion,
} from "./search-content";
export const SEARCH_VERSION = "search-v1";
const selection = z.array(z.number().int().min(0).max(24)).max(25);
const answerSchema = z.object({
  selected: selection,
  skipped: z.boolean(),
  revealed: z.boolean(),
  hintLevel: z.number().int().min(0).max(2),
  tp: z.number().int().min(0).max(25),
  fp: z.number().int().min(0).max(25),
  fn: z.number().int().min(0).max(25),
  score: z.number().int().min(0).max(10000),
  correct: z.boolean(),
});
export const searchSchema = z
  .object({
    id: z.string(),
    version: z.literal(SEARCH_VERSION),
    contentVersion: z.literal(SEARCH_CONTENT_VERSION),
    stage: z.number().int().min(1).max(30),
    mode: z.enum(["stage", "practice"]),
    phase: z.enum([
      "intro",
      "tutorial",
      "question",
      "feedback",
      "paused",
      "result",
    ]),
    questions: z.array(searchQuestionSchema).length(3),
    round: z.number().int().min(0).max(2),
    selected: selection,
    exampleSelected: selection,
    exampleChecked: z.boolean(),
    tutorialPassed: z.boolean(),
    answers: z.array(answerSchema).max(3),
    hintLevel: z.number().int().min(0).max(2),
    revealed: z.boolean(),
    assisted: z.boolean(),
    interrupted: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number(),
    revision: z.number().int().min(0),
  })
  .superRefine((a, ctx) => {
    if (
      !Number.isInteger(a.stage) ||
      a.stage < 1 ||
      a.stage > 30 ||
      a.questions.length !== 3 ||
      !Number.isInteger(a.round) ||
      a.round < 0 ||
      a.round > 2
    )
      return;
    const fail = (message: string) => ctx.addIssue({ code: "custom", message }),
      example = searchExample(a.stage);
    if (
      a.questions.some(
        (q) => !searchQuestionForStage(q, a.stage) || q.id === example.id,
      ) ||
      new Set(a.questions.map((q) => q.id)).size !== 3
    ) {
      fail("단계에 맞지 않거나 중복된 탐색판입니다.");
      return;
    }
    if (
      !validSearchSelection(a.questions[a.round], a.selected) ||
      !validSearchSelection(example, a.exampleSelected) ||
      a.answers.some(
        (answer, i) => !validSearchSelection(a.questions[i], answer.selected),
      )
    ) {
      fail("선택한 칸의 형식이 맞지 않습니다.");
      return;
    }
    if (
      a.tutorialPassed !==
      (a.exampleChecked && gradeSearch(example, a.exampleSelected).correct)
    )
      fail("예제 완료 이력이 맞지 않습니다.");
    if (
      searchConfig(a.stage).requiresTutorial &&
      ["question", "feedback", "paused", "result"].includes(a.phase) &&
      !a.tutorialPassed
    )
      fail("구간 예제를 먼저 완료해 주세요.");
    if (
      ["intro", "tutorial"].includes(a.phase) &&
      (a.round !== 0 || a.answers.length || a.selected.length)
    )
      fail("안내 단계의 진행 상태가 맞지 않습니다.");
    if (
      a.answers.length !==
        (a.phase === "result"
          ? 3
          : a.phase === "feedback"
            ? a.round + 1
            : a.round) ||
      (a.phase === "result" && a.round !== 2)
    )
      fail("탐색판 순서가 맞지 않습니다.");
    a.answers.forEach((answer, i) => {
      const raw = gradeSearch(a.questions[i], answer.selected),
        zero = answer.skipped || answer.revealed;
      if (
        (answer.skipped && answer.revealed) ||
        (zero && answer.selected.length) ||
        answer.tp !== raw.tp ||
        answer.fp !== raw.fp ||
        answer.fn !== raw.fn ||
        answer.score !== (zero ? 0 : raw.score) ||
        answer.correct !== (!zero && raw.correct)
      )
        fail("탐색 결과와 판정이 맞지 않습니다.");
    });
    if (a.phase === "feedback" || a.phase === "result") {
      const answer = a.answers[a.round];
      if (
        !answer ||
        answer.hintLevel !== a.hintLevel ||
        answer.selected.length !== a.selected.length ||
        answer.selected.some((i) => !a.selected.includes(i))
      )
        fail("피드백과 확정한 선택이 맞지 않습니다.");
    }
    if (a.phase === "paused" && (a.selected.length || !a.interrupted))
      fail("중단 상태가 맞지 않습니다.");
    if (
      a.revealed !== a.answers.some((a) => a.revealed) ||
      (!a.assisted &&
        (a.hintLevel > 0 ||
          a.answers.some((a) => a.hintLevel > 0 || a.revealed)))
    )
      fail("도움 이력이 누락됐습니다.");
  });
export type SearchAttempt = z.infer<typeof searchSchema>;
export function searchOutcome(a: SearchAttempt) {
  const score = Math.floor(
      a.answers.reduce((sum, answer) => sum + answer.score, 0) / 3,
    ),
    correct = a.answers.filter((a) => a.correct).length,
    passed = a.phase === "result" && a.answers.length === 3 && score >= 8000;
  return {
    correct,
    score,
    passed,
    independent: passed && !a.assisted && !a.interrupted && !a.revealed,
  };
}
export function makeSearchAttempt(
  stage: number,
  mode: SearchAttempt["mode"] = "stage",
): SearchAttempt {
  const example = searchExample(stage),
    questions: SearchQuestion[] = [];
  for (let i = 0; i < 3; i++)
    questions.push(
      newSearchQuestion(stage, [example.id, ...questions.map((q) => q.id)]),
    );
  return {
    id: crypto.randomUUID(),
    version: SEARCH_VERSION,
    contentVersion: SEARCH_CONTENT_VERSION,
    stage,
    mode,
    phase: "intro",
    questions,
    round: 0,
    selected: [],
    exampleSelected: [],
    exampleChecked: false,
    tutorialPassed: false,
    answers: [],
    hintLevel: 0,
    revealed: false,
    assisted: false,
    interrupted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    revision: 0,
  };
}
export type SearchAction =
  | {
      type:
        | "tutorial"
        | "start"
        | "confirm"
        | "skip"
        | "reveal"
        | "next"
        | "hint"
        | "clear"
        | "pause";
    }
  | { type: "toggle"; cell: number }
  | { type: "resume"; question: SearchQuestion };
export function reduceSearch(
  a: SearchAttempt,
  action: SearchAction,
): SearchAttempt {
  let next = a;
  const example = a.phase === "tutorial",
    editing = example || a.phase === "question",
    q = example ? searchExample(a.stage) : a.questions[a.round],
    selected = example ? a.exampleSelected : a.selected;
  const update = (selection: number[]) => ({
    ...a,
    ...(example
      ? {
          exampleSelected: selection,
          exampleChecked: false,
          tutorialPassed: false,
        }
      : { selected: selection }),
  });
  switch (action.type) {
    case "tutorial":
      if (a.phase === "intro") next = { ...a, phase: "tutorial" };
      break;
    case "start":
      if (
        (a.phase === "intro" && !searchConfig(a.stage).requiresTutorial) ||
        (a.phase === "tutorial" && a.tutorialPassed)
      )
        next = { ...a, phase: "question", selected: [] };
      break;
    case "toggle":
      if (
        editing &&
        Number.isInteger(action.cell) &&
        action.cell >= 0 &&
        action.cell < q.cells.length
      )
        next = update(
          selected.includes(action.cell)
            ? selected.filter((i) => i !== action.cell)
            : [...selected, action.cell].sort((a, b) => a - b),
        );
      break;
    case "clear":
      if (editing && selected.length) next = update([]);
      break;
    case "confirm":
      if (example)
        next = {
          ...a,
          exampleChecked: true,
          tutorialPassed: gradeSearch(q, selected).correct,
        };
      else if (a.phase === "question") {
        const raw = gradeSearch(q, selected);
        next = {
          ...a,
          phase: "feedback",
          answers: [
            ...a.answers,
            {
              selected: [...selected],
              skipped: false,
              revealed: false,
              hintLevel: a.hintLevel,
              tp: raw.tp,
              fp: raw.fp,
              fn: raw.fn,
              score: raw.score,
              correct: raw.correct,
            },
          ],
        };
      }
      break;
    case "skip":
    case "reveal":
      if (a.phase === "question") {
        const revealed = action.type === "reveal",
          raw = gradeSearch(q, []);
        next = {
          ...a,
          phase: "feedback",
          selected: [],
          assisted: a.assisted || revealed,
          revealed: a.revealed || revealed,
          answers: [
            ...a.answers,
            {
              selected: [],
              skipped: !revealed,
              revealed,
              hintLevel: a.hintLevel,
              tp: 0,
              fp: 0,
              fn: raw.fn,
              score: 0,
              correct: false,
            },
          ],
        };
      }
      break;
    case "next":
      if (a.phase === "feedback")
        next =
          a.round === 2
            ? { ...a, phase: "result" }
            : {
                ...a,
                phase: "question",
                round: a.round + 1,
                selected: [],
                hintLevel: 0,
              };
      break;
    case "hint":
      if (a.phase === "question" && a.hintLevel < 2)
        next = { ...a, hintLevel: a.hintLevel + 1, assisted: true };
      break;
    case "pause":
      if (a.phase === "question")
        next = { ...a, phase: "paused", selected: [], interrupted: true };
      break;
    case "resume":
      if (
        a.phase === "paused" &&
        searchQuestionSchema.safeParse(action.question).success &&
        searchQuestionForStage(action.question, a.stage) &&
        action.question.id !== searchExample(a.stage).id &&
        !a.questions.some((q) => q.id === action.question.id)
      )
        next = {
          ...a,
          phase: "question",
          questions: a.questions.map((q, i) =>
            i === a.round ? action.question : q,
          ),
          selected: [],
          hintLevel: 0,
        };
      break;
  }
  return next === a
    ? a
    : { ...next, revision: a.revision + 1, updatedAt: Date.now() };
}
export const recoverSearch = (a: SearchAttempt) =>
  reduceSearch(a, { type: "pause" });
