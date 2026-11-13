import { z } from "zod";
export const SWITCH_CONTENT_VERSION = "switch-content-v1";
export const SWITCH_RULES = ["shape", "tone", "direction"] as const;
export type SwitchRule = (typeof SWITCH_RULES)[number];
export const SWITCH_NAMES: Record<SwitchRule, string> = {
  shape: "모양",
  tone: "밝기",
  direction: "방향",
};
export const SWITCH_OPTIONS: Record<SwitchRule, readonly [string, string]> = {
  shape: ["원", "삼각형"],
  tone: ["밝은 표식", "어두운 표식"],
  direction: ["위", "아래"],
};
export const switchSignalSchema = z.object({
  shape: z.union([z.literal(0), z.literal(1)]).nullable(),
  tone: z.union([z.literal(0), z.literal(1)]).nullable(),
  direction: z.union([z.literal(0), z.literal(1)]).nullable(),
});
export type SwitchSignal = z.infer<typeof switchSignalSchema>;
export const switchQuestionSchema = z
  .object({
    id: z.uuid(),
    rule: z.enum(SWITCH_RULES),
    signal: switchSignalSchema,
  })
  .superRefine((q, ctx) => {
    if (q.signal[q.rule] === null)
      ctx.addIssue({
        code: "custom",
        message: "현재 규칙에 필요한 자극이 없습니다.",
      });
  });
export type SwitchQuestion = z.infer<typeof switchQuestionSchema>;
export function switchConfig(stage: number) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 30)
    throw new Error("유효하지 않은 단계입니다.");
  const band = Math.floor((stage - 1) / 5),
    role = (stage - 1) % 5;
  const rules: SwitchRule[][] = [
    ["shape"],
    ["tone"],
    ["shape", "tone"],
    ["shape", "direction"],
    ["tone", "direction"],
    ["shape", "tone", "direction"],
  ];
  const goals = [
    [
      "현재 모양 지시를 익혀요",
      "지시와 응답 버튼을 연결해요",
      "원과 삼각형을 구분해요",
      "먼저 지시를 읽고 반응해요",
      "같은 기준을 끝까지 유지해요",
    ],
    [
      "밝기 지시를 익혀요",
      "모양에 흔들리지 않고 반응해요",
      "밝은 표식과 어두운 표식을 구분해요",
      "불필요한 속성을 잠시 내려놓아요",
      "밝기 기준을 끝까지 유지해요",
    ],
    [
      "모양과 밝기 전환을 익혀요",
      "바뀐 지시부터 확인해요",
      "직전 규칙과 현재 규칙을 구분해요",
      "전환 뒤 응답 기준을 다시 세워요",
      "두 규칙을 차례로 적용해요",
    ],
    [
      "모양과 방향 전환을 익혀요",
      "화살표와 바깥 모양을 나눠 봐요",
      "맞는 속성만 골라 반응해요",
      "전환 안내에서 기준을 바꿔요",
      "두 기준을 안정적으로 오가요",
    ],
    [
      "밝기와 방향을 자주 바꿔요",
      "짧은 묶음마다 지시를 확인해요",
      "밝기와 화살표의 충돌을 구분해요",
      "바뀐 기준을 다시 읽어요",
      "빠른 전환에서도 정확히 반응해요",
    ],
    [
      "세 규칙의 전환을 익혀요",
      "모양·밝기·방향을 나눠 봐요",
      "같은 자극도 지시에 맞게 판단해요",
      "전환 직후 기준을 다시 확인해요",
      "세 규칙을 끝까지 적용해요",
    ],
  ];
  return {
    rules: rules[band],
    visible:
      band === 0
        ? (["shape"] as SwitchRule[])
        : band === 1
          ? (["shape", "tone"] as SwitchRule[])
          : rules[band],
    interval: [20, 20, 5, 4, 3, 2][band],
    seconds: [5, 4, 5, 4, 4, 4][band],
    requiresTutorial: role === 0,
    goal: goals[band][role],
  };
}
export function switchRuleAt(stage: number, round: number) {
  const c = switchConfig(stage);
  if (!Number.isInteger(round) || round < 0 || round >= 20)
    throw new Error("유효하지 않은 문항입니다.");
  return c.rules[Math.floor(round / c.interval) % c.rules.length];
}
export const switchChanged = (stage: number, round: number) =>
  round === 0 || switchRuleAt(stage, round) !== switchRuleAt(stage, round - 1);
export function switchAnswer(q: SwitchQuestion): 0 | 1 {
  const answer = q.signal[q.rule];
  if (answer === null) throw new Error("규칙과 자극이 맞지 않습니다.");
  return answer;
}
export const switchSignalKey = (s: SwitchSignal) =>
  SWITCH_RULES.map((k) => s[k] ?? "n").join(".");
export function switchQuestionForStage(
  q: SwitchQuestion,
  stage: number,
  round: number,
) {
  const c = switchConfig(stage);
  return (
    q.rule === switchRuleAt(stage, round) &&
    SWITCH_RULES.every((key) =>
      c.visible.includes(key)
        ? q.signal[key] === 0 || q.signal[key] === 1
        : q.signal[key] === null,
    )
  );
}
function shuffle<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function balancedSwitchQuestions(
  questions: readonly SwitchQuestion[],
  stage: number,
) {
  if (questions.length !== 20) return false;
  const c = switchConfig(stage),
    answers = questions.map(switchAnswer);
  if (
    answers.filter((a) => a === 1).length !== 10 ||
    !answers.some((a, i) => i > 0 && a === answers[i - 1]) ||
    answers.some(
      (a, i) => i >= 3 && answers.slice(i - 3, i + 1).every((b) => b === a),
    )
  )
    return false;
  if (
    c.rules.some((rule) => {
      const values = questions.filter((q) => q.rule === rule).map(switchAnswer);
      return (
        Math.abs(
          values.filter((v) => v === 0).length -
            values.filter((v) => v === 1).length,
        ) > 1
      );
    })
  )
    return false;
  if (c.visible.length > 1) {
    const conflict = (q: SwitchQuestion) =>
      c.visible.some((k) => k !== q.rule && q.signal[k] !== switchAnswer(q));
    if (
      questions.filter(conflict).length < 6 ||
      c.rules.some(
        (rule) => !questions.some((q) => q.rule === rule && conflict(q)),
      )
    )
      return false;
  }
  return true;
}
export function newSwitchQuestions(
  stage: number,
  random = Math.random,
): SwitchQuestion[] {
  const c = switchConfig(stage),
    schedule = Array.from({ length: 20 }, (_, i) => switchRuleAt(stage, i));
  for (let attempt = 0; attempt < 1000; attempt++) {
    const choices = new Map<SwitchRule, (0 | 1)[]>();
    let odd = 0;
    for (const rule of c.rules) {
      const n = schedule.filter((r) => r === rule).length,
        ones = Math.floor(n / 2) + (n % 2 ? (odd++ % 2 === 0 ? 1 : 0) : 0);
      choices.set(
        rule,
        shuffle(
          Array.from({ length: n }, (_, i) =>
            i < ones ? (1 as const) : (0 as const),
          ),
          random,
        ),
      );
    }
    const questions = schedule.map((rule) => {
      const signal: SwitchSignal = { shape: null, tone: null, direction: null };
      for (const key of c.visible)
        signal[key] =
          key === rule ? choices.get(rule)!.pop()! : random() < 0.5 ? 0 : 1;
      return { id: crypto.randomUUID(), rule, signal };
    });
    if (balancedSwitchQuestions(questions, stage)) return questions;
  }
  throw new Error("균형 잡힌 새 문항을 준비하지 못했습니다.");
}
export function replacementSwitchQuestion(
  stage: number,
  round: number,
  previous: SwitchQuestion,
  random = Math.random,
): SwitchQuestion {
  const c = switchConfig(stage),
    choices: SwitchSignal[] = [];
  for (let mask = 0; mask < 1 << c.visible.length; mask++) {
    const signal: SwitchSignal = { shape: null, tone: null, direction: null };
    c.visible.forEach((key, i) => {
      signal[key] = ((mask >> i) & 1) as 0 | 1;
    });
    if (switchSignalKey(signal) !== switchSignalKey(previous.signal))
      choices.push(signal);
  }
  return {
    id: crypto.randomUUID(),
    rule: switchRuleAt(stage, round),
    signal: choices[Math.floor(random() * choices.length)],
  };
}
export function switchExample(stage: number): SwitchQuestion {
  const c = switchConfig(stage),
    rule = switchRuleAt(stage, 0),
    signal: SwitchSignal = { shape: null, tone: null, direction: null };
  for (const key of c.visible) signal[key] = key === rule ? 0 : 1;
  return {
    id: `00000000-0000-4000-8000-${String(stage).padStart(12, "0")}`,
    rule,
    signal,
  };
}
export const switchSignalLabel = (signal: SwitchSignal) =>
  SWITCH_RULES.flatMap((key) =>
    signal[key] === null
      ? []
      : [`${SWITCH_NAMES[key]}: ${SWITCH_OPTIONS[key][signal[key]!]}`],
  ).join(" · ");
export function explainSwitch(q: SwitchQuestion) {
  return `이번 지시는 ‘${SWITCH_NAMES[q.rule]}’예요. ${SWITCH_OPTIONS[q.rule][switchAnswer(q)]}에 해당하므로 ${switchAnswer(q) + 1}번 응답이 맞아요. 다른 속성은 이번 판단에 포함하지 않아요.`;
}
