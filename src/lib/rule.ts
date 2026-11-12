import { z } from "zod";
import {
  CONTENT_VERSION,
  questionSchema,
  newRuleQuestion,
  ruleConfig,
  answerIndex,
  type RuleQuestion,
  ruleQuestionForStage,
} from "./rule-content";
export { ruleConfig } from "./rule-content";
export { outcome, nextStage } from "./memory-common";
export const RULE_VERSION = "rule-v1";
export const ruleSchema = z
  .object({
    id: z.string(),
    version: z.literal(RULE_VERSION),
    contentVersion: z.literal(CONTENT_VERSION),
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
    questions: z.array(questionSchema).length(5),
    round: z.number().int().min(0).max(4),
    selected: z.number().int().min(0).max(3).nullable(),
    answers: z
      .array(
        z.object({
          selected: z.number().int().min(0).max(3).nullable(),
          correct: z.boolean(),
          skipped: z.boolean(),
          hintLevel: z.number().int().min(0).max(2),
        }),
      )
      .max(5),
    hintLevel: z.number().int().min(0).max(2),
    assisted: z.boolean(),
    interrupted: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number(),
    revision: z.number().int().min(0),
  })
  .superRefine((a, ctx) => {
    if (!Number.isInteger(a.stage) || a.stage < 1 || a.stage > 30) return;
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      (a.phase === "intro" || a.phase === "tutorial") &&
      (a.round !== 0 || a.answers.length)
    )
      fail("안내 단계의 문항 순서가 맞지 않습니다.");
    if (
      a.questions.some((q) => !ruleQuestionForStage(q, a.stage)) ||
      new Set(a.questions.map((q) => q.id)).size !== 5
    )
      fail("단계에 맞지 않거나 중복된 문제입니다.");
    if (
      a.answers.length !==
        (a.phase === "result"
          ? 5
          : a.phase === "feedback"
            ? a.round + 1
            : a.round) ||
      (a.phase === "result" && a.round !== 4)
    )
      fail("문항 순서가 맞지 않습니다.");
    a.answers.forEach((answer, i) => {
      if (
        answer.correct !==
          (!answer.skipped &&
            answer.selected === answerIndex(a.questions[i])) ||
        (answer.skipped && answer.selected !== null)
      )
        fail("잘못된 규칙 답안입니다.");
    });
    if (
      !a.assisted &&
      (a.hintLevel > 0 || a.answers.some((a) => a.hintLevel > 0))
    )
      fail("힌트 사용 이력이 누락됐습니다.");
  });
export type RuleAttempt = z.infer<typeof ruleSchema>;
export function makeRuleAttempt(
  stage: number,
  mode: RuleAttempt["mode"] = "stage",
): RuleAttempt {
  const questions: RuleQuestion[] = [];
  const example = tutorialQuestion(stage);
  for (let i = 0; i < 5; i++)
    questions.push(
      newRuleQuestion(stage, [example.id, ...questions.map((q) => q.id)]),
    );
  return {
    id: crypto.randomUUID(),
    version: RULE_VERSION,
    contentVersion: CONTENT_VERSION,
    stage,
    mode,
    phase: "intro",
    questions,
    round: 0,
    selected: null,
    answers: [],
    hintLevel: 0,
    assisted: false,
    interrupted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    revision: 0,
  };
}
// A deterministic, explained example; distinct from the five scored questions.
export function tutorialQuestion(stage: number) {
  return newRuleQuestion(stage, [], () => 0);
}
export type RuleAction =
  | {
      type:
        "tutorial" | "start" | "confirm" | "skip" | "next" | "hint" | "pause";
    }
  | { type: "select"; option: number }
  | { type: "resume"; question: RuleAttempt["questions"][number] };
export function reduceRule(a: RuleAttempt, action: RuleAction): RuleAttempt {
  let next = a;
  switch (action.type) {
    case "tutorial":
      if (a.phase === "intro")
        next = { ...a, phase: "tutorial", selected: null };
      break;
    case "start":
      if (
        (a.phase === "intro" && !ruleConfig(a.stage).requiresTutorial) ||
        (a.phase === "tutorial" &&
          a.selected === answerIndex(tutorialQuestion(a.stage)))
      )
        next = { ...a, phase: "question", selected: null };
      break;
    case "select":
      if (
        (a.phase === "question" || a.phase === "tutorial") &&
        Number.isInteger(action.option) &&
        action.option >= 0 &&
        action.option < 4
      )
        next = { ...a, selected: action.option };
      break;
    case "hint":
      if (a.phase === "question" && a.hintLevel < 2)
        next = { ...a, hintLevel: a.hintLevel + 1, assisted: true };
      break;
    case "confirm":
    case "skip":
      if (
        a.phase === "question" &&
        (action.type === "skip" || a.selected !== null)
      ) {
        const skipped = action.type === "skip";
        next = {
          ...a,
          phase: "feedback",
          selected: skipped ? null : a.selected,
          answers: [
            ...a.answers,
            {
              selected: skipped ? null : a.selected,
              correct:
                !skipped && a.selected === answerIndex(a.questions[a.round]),
              skipped,
              hintLevel: a.hintLevel,
            },
          ],
        };
      }
      break;
    case "next":
      if (a.phase === "feedback")
        next =
          a.round === 4
            ? { ...a, phase: "result" }
            : {
                ...a,
                phase: "question",
                round: a.round + 1,
                selected: null,
                hintLevel: 0,
              };
      break;
    case "pause":
      if (a.phase === "question")
        next = { ...a, phase: "paused", selected: null, interrupted: true };
      break;
    case "resume":
      if (
        a.phase === "paused" &&
        questionSchema.safeParse(action.question).success &&
        ruleQuestionForStage(action.question, a.stage) &&
        !a.questions.some((q) => q.id === action.question.id)
      )
        next = {
          ...a,
          phase: "question",
          questions: a.questions.map((q, i) =>
            i === a.round ? action.question : q,
          ),
          selected: null,
          hintLevel: 0,
        };
      break;
  }
  return next === a
    ? a
    : { ...next, revision: a.revision + 1, updatedAt: Date.now() };
}
export const recoverRule = (a: RuleAttempt) => reduceRule(a, { type: "pause" });
