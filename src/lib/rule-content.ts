import { z } from "zod";
export const CONTENT_VERSION = "rule-content-v1";
export const DIRECTIONS = ["위", "오른쪽", "아래", "왼쪽"] as const;
export const MARKS = [
  { name: "원", glyph: "●" },
  { name: "삼각형", glyph: "▲" },
  { name: "사각형", glyph: "■" },
  { name: "마름모", glyph: "◆" },
] as const;
export const termSchema = z.object({
  direction: z.number().int().min(0).max(3),
  count: z.number().int().min(1).max(7),
  mark: z.number().int().min(0).max(3),
});
export type RuleTerm = z.infer<typeof termSchema>;
export const FAMILIES = [
  "rotation",
  "marks",
  "count",
  "dual-marks",
  "dual-count",
  "alternate-direction",
  "alternate-mark",
  "combined",
] as const;
export type RuleFamily = (typeof FAMILIES)[number];
const descriptions: Record<
  RuleFamily,
  { name: string; scope: string; hint: string }
> = {
  rotation: {
    name: "방향의 순환",
    scope:
      "방향이 매번 90도씩 같은 쪽으로 회전합니다. 개수와 표식은 그대로입니다.",
    hint: "방향만 살펴보세요. 첫 번째에서 두 번째로 어느 쪽으로 돌아갔나요?",
  },
  marks: {
    name: "표식의 순환",
    scope:
      "표식이 원 → 삼각형 → 사각형 → 마름모 순서 또는 반대 순서로 한 칸씩 바뀝니다. 방향과 개수는 그대로입니다.",
    hint: "표식의 이름을 차례로 읽어 보세요. 순환의 끝에서는 처음으로 돌아갑니다.",
  },
  count: {
    name: "개수의 증감",
    scope:
      "표식의 개수가 매번 1개씩 늘거나 줄어듭니다. 방향과 표식 종류는 그대로입니다.",
    hint: "앞뒤 두 항목의 개수를 빼 보세요. 모든 사이에서 같은 차이가 나나요?",
  },
  "dual-marks": {
    name: "방향과 표식",
    scope:
      "방향은 매번 90도, 표식은 원 → 삼각형 → 사각형 → 마름모 순서 또는 반대 순서로 한 칸씩 바뀝니다. 두 변화는 독립이며 개수는 그대로입니다.",
    hint: "방향과 표식을 따로 확인하세요. 한 속성만 맞는 선택지는 정답이 아닙니다.",
  },
  "dual-count": {
    name: "방향과 개수",
    scope:
      "방향은 매번 90도씩 회전하고 개수는 매번 1개씩 늘거나 줄어듭니다. 표식 종류는 그대로입니다.",
    hint: "방향을 먼저 예상한 뒤, 개수도 같은 선택지와 맞는지 확인하세요.",
  },
  "alternate-direction": {
    name: "번갈아 보는 방향",
    scope:
      "홀수 번째와 짝수 번째를 따로 봅니다. 각 줄에서 방향이 90도씩 같은 쪽으로 회전합니다. 개수와 표식은 그대로입니다.",
    hint: "1·3·5번째를 한 줄로, 2·4·6번째를 다른 줄로 묶어 보세요. 빈칸은 어느 줄인가요?",
  },
  "alternate-mark": {
    name: "번갈아 보는 표식",
    scope:
      "홀수 번째와 짝수 번째를 따로 봅니다. 각 줄에서 표식이 순환 순서로 한 칸씩 변합니다. 방향과 개수는 그대로입니다.",
    hint: "홀수 번째 표식만 먼저 읽어 보세요. 바로 앞 항목보다 두 칸 앞 항목이 기준입니다.",
  },
  combined: {
    name: "교대와 두 속성",
    scope:
      "홀수·짝수 줄을 따로 봅니다. 방향은 두 줄에서 서로 반대로 90도씩 회전하며 표식은 두 줄에서 같은 쪽으로 한 칸씩 순환합니다. 개수는 그대로입니다.",
    hint: "빈칸이 속한 줄에서 방향과 표식을 각각 예상한 다음 두 조건을 합쳐 보세요.",
  },
};
export const familyInfo = (family: RuleFamily) => descriptions[family];
export function ruleConfig(stage: number) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 30)
    throw new Error("유효하지 않은 단계입니다.");
  const band = Math.floor((stage - 1) / 5),
    role = (stage - 1) % 5;
  const families: readonly RuleFamily[][] = [
    ["rotation", "marks"],
    ["count"],
    ["dual-marks", "dual-count"],
    ["alternate-direction", "alternate-mark"],
    ["combined"],
    [...FAMILIES],
  ];
  const goals = [
    [
      "방향의 변화를 찾아요",
      "표식의 변화를 찾아요",
      "바뀌지 않는 속성을 골라요",
      "반대 순환도 살펴봐요",
      "한 속성 규칙을 정리해요",
    ],
    [
      "개수의 차이를 찾아요",
      "늘어나는 개수를 이어요",
      "줄어드는 개수를 이어요",
      "방향과 개수를 구분해요",
      "증감 규칙을 확인해요",
    ],
    [
      "두 속성을 나누어 봐요",
      "방향과 표식을 연결해요",
      "방향과 개수를 연결해요",
      "한 조건만 맞는 답을 걸러요",
      "두 조건을 함께 확인해요",
    ],
    [
      "홀수와 짝수를 나눠요",
      "홀수 줄의 방향을 이어요",
      "홀수 줄의 표식을 이어요",
      "바로 앞 항목과 구분해요",
      "교대 규칙을 확인해요",
    ],
    [
      "교대 속 두 변화를 찾아요",
      "방향의 두 줄을 비교해요",
      "표식의 두 줄을 비교해요",
      "두 조건을 빠짐없이 이어요",
      "교대와 결합을 정리해요",
    ],
    [
      "배운 규칙을 다시 만나요",
      "변화의 종류를 구분해요",
      "헷갈린 조건을 확인해요",
      "새 사례에도 적용해요",
      "여러 규칙을 함께 돌아봐요",
    ],
  ];
  let allowed = [...families[band]];
  if (band === 0 && role < 2) allowed = [role === 0 ? "rotation" : "marks"];
  if (band === 2 && (role === 1 || role === 2))
    allowed = [role === 1 ? "dual-marks" : "dual-count"];
  if (band === 3 && (role === 1 || role === 2))
    allowed = [role === 1 ? "alternate-direction" : "alternate-mark"];
  return {
    band,
    countDirection:
      band === 1 && role === 1 ? 1 : band === 1 && role === 2 ? -1 : undefined,
    goal: goals[band][role],
    families: allowed,
    requiresTutorial: role === 0,
    label: [
      "단일 속성 순환",
      "단일 속성 증감",
      "두 속성 독립",
      "교대 부분열",
      "독립 + 교대",
      "배운 규칙 혼합",
    ][band],
  };
}
const mod = (n: number) => ((n % 4) + 4) % 4;
export const sameTerm = (a: RuleTerm, b: RuleTerm) =>
  a.direction === b.direction && a.count === b.count && a.mark === b.mark;
export const termLabel = (t: RuleTerm) =>
  `${DIRECTIONS[t.direction]} 방향 · ${MARKS[t.mark].name} ${t.count}개`;
const termKey = (t: RuleTerm) => `${t.direction}${t.count}${t.mark}`;
export const contentKey = (family: RuleFamily, shown: RuleTerm[]) =>
  `rc1:${family}:${shown.map(termKey).join("-")}`;
interface Model {
  family: RuleFamily;
  term: (index: number) => RuleTerm;
  description: string;
}
interface Entry {
  id: string;
  family: RuleFamily;
  shown: RuleTerm[];
  expected: RuleTerm;
  description: string;
}
let cached: Map<string, Entry> | undefined;
// Finite, announced rule families. Retain a prefix only if all matching models agree on the next term.
function bank() {
  if (cached) return cached;
  const models: Model[] = [];
  const add = (family: RuleFamily, term: Model["term"], description: string) =>
    models.push({ family, term, description });
  for (let direction = 0; direction < 4; direction++)
    for (let mark = 0; mark < 4; mark++) {
      const base = { direction, mark, count: 1 };
      for (const count of [1, 2, 3])
        for (const step of [-1, 1]) {
          const dir = step === 1 ? "시계" : "반시계";
          add(
            "rotation",
            (i) => ({ ...base, count, direction: mod(direction + i * step) }),
            `방향이 매번 ${dir} 방향으로 90도씩 회전합니다.`,
          );
          add(
            "marks",
            (i) => ({ ...base, count, mark: mod(mark + i * step) }),
            `표식이 순환 순서의 ${step === 1 ? "다음" : "이전"} 항목으로 한 칸씩 바뀝니다.`,
          );
          for (const markStep of [-1, 1]) {
            add(
              "dual-marks",
              (i) => ({
                direction: mod(direction + i * step),
                mark: mod(mark + i * markStep),
                count,
              }),
              `방향은 ${dir} 방향 90도씩, 표식은 순환 순서의 ${markStep === 1 ? "다음" : "이전"} 항목으로 바뀝니다. 개수는 같습니다.`,
            );
            add(
              "combined",
              (i) => {
                const odd = i % 2 === 0,
                  k = Math.floor(i / 2);
                return {
                  direction: mod(
                    direction + (odd ? 0 : 2) + k * (odd ? step : -step),
                  ),
                  mark: mod(mark + (odd ? 0 : 1) + k * markStep),
                  count,
                };
              },
              `홀수 줄의 방향은 ${dir} 방향, 짝수 줄은 반대 방향으로 90도씩 회전합니다. 두 줄의 표식은 순환 순서의 ${markStep === 1 ? "다음" : "이전"} 항목으로 바뀝니다.`,
            );
          }
          for (const offset of [1, 2, 3])
            for (const secondStep of [-1, 1]) {
              add(
                "alternate-direction",
                (i) => ({
                  ...base,
                  count,
                  direction: mod(
                    direction +
                      (i % 2 ? offset : 0) +
                      Math.floor(i / 2) * (i % 2 ? secondStep : step),
                  ),
                }),
                `홀수 줄의 방향은 ${dir} 방향, 짝수 줄은 ${secondStep === 1 ? "시계" : "반시계"} 방향으로 각각 90도씩 회전합니다.`,
              );
              add(
                "alternate-mark",
                (i) => ({
                  ...base,
                  count,
                  mark: mod(
                    mark +
                      (i % 2 ? offset : 0) +
                      Math.floor(i / 2) * (i % 2 ? secondStep : step),
                  ),
                }),
                `홀수 줄의 표식은 순환 순서의 ${step === 1 ? "다음" : "이전"} 항목으로, 짝수 줄은 ${secondStep === 1 ? "다음" : "이전"} 항목으로 바뀝니다.`,
              );
            }
        }
      for (const step of [-1, 1])
        for (const start of step === 1 ? [1, 2, 3] : [5, 6, 7]) {
          add(
            "count",
            (i) => ({ ...base, count: start + i * step }),
            `개수가 매번 1개씩 ${step === 1 ? "늘어납니다" : "줄어듭니다"}. 방향과 표식 종류는 같습니다.`,
          );
          for (const dirStep of [-1, 1])
            add(
              "dual-count",
              (i) => ({
                ...base,
                count: start + i * step,
                direction: mod(direction + i * dirStep),
              }),
              `방향은 ${dirStep === 1 ? "시계" : "반시계"} 방향으로 90도씩 회전하고, 개수는 매번 1개씩 ${step === 1 ? "늘어납니다" : "줄어듭니다"}.`,
            );
        }
    }
  const entries = new Map<string, Entry>(),
    ambiguous = new Set<string>();
  for (const model of models) {
    const length =
      model.family.startsWith("alternate") || model.family === "combined"
        ? 6
        : 4;
    const shown = Array.from({ length }, (_, i) => model.term(i)),
      expected = model.term(length),
      id = contentKey(model.family, shown);
    const previous = entries.get(id);
    if (previous && !sameTerm(previous.expected, expected)) ambiguous.add(id);
    else if (!previous)
      entries.set(id, {
        id,
        family: model.family,
        shown,
        expected,
        description: model.description,
      });
  }
  for (const id of ambiguous) entries.delete(id);
  cached = entries;
  return entries;
}
export function inferNext(
  family: RuleFamily,
  shown: RuleTerm[],
): RuleTerm | null {
  const expected = bank().get(contentKey(family, shown))?.expected;
  return expected ? { ...expected } : null;
}
function shuffle<T>(values: readonly T[], random: () => number) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export const questionSchema = z
  .object({
    id: z.string().max(150),
    family: z.enum(FAMILIES),
    shown: z.array(termSchema).min(4).max(6),
    options: z.array(termSchema).length(4),
  })
  .superRefine((q, ctx) => {
    const expected = inferNext(q.family, q.shown);
    if (
      q.id !== contentKey(q.family, q.shown) ||
      !expected ||
      new Set(q.options.map(termKey)).size !== 4 ||
      q.options.filter((t) => expected && sameTerm(t, expected)).length !== 1
    )
      ctx.addIssue({
        code: "custom",
        message: "유일한 다음 항목을 확인할 수 없는 문제입니다.",
      });
  });
export type RuleQuestion = z.infer<typeof questionSchema>;
function matchesConfig(
  q: Pick<RuleQuestion, "family" | "shown">,
  config: ReturnType<typeof ruleConfig>,
) {
  return (
    q.shown.length >= 2 &&
    config.families.includes(q.family) &&
    (!config.countDirection ||
      q.shown[1].count - q.shown[0].count === config.countDirection)
  );
}
export function ruleQuestionForStage(
  q: Pick<RuleQuestion, "family" | "shown">,
  stage: number,
) {
  return matchesConfig(q, ruleConfig(stage));
}
export function newRuleQuestion(
  stage: number,
  excluded: string[] = [],
  random = Math.random,
): RuleQuestion {
  const config = ruleConfig(stage);
  const pool = [...bank().values()].filter(
    (e) => matchesConfig(e, config) && !excluded.includes(e.id),
  );
  if (!pool.length) throw new Error("새 규칙 문제를 준비하지 못했습니다.");
  const entry = pool[Math.floor(random() * pool.length)],
    correct = entry.expected;
  const distractors: RuleTerm[] = [];
  // Prefer plausible single-condition errors, then two-condition errors for combined rules.
  const axes =
    entry.family === "rotation" || entry.family === "alternate-direction"
      ? (["direction"] as const)
      : entry.family === "marks" || entry.family === "alternate-mark"
        ? (["mark"] as const)
        : entry.family === "count"
          ? (["count"] as const)
          : entry.family === "dual-count"
            ? (["direction", "count"] as const)
            : (["direction", "mark"] as const);
  for (const axis of axes)
    for (
      let value = axis === "count" ? 1 : 0;
      value <= (axis === "count" ? 7 : 3);
      value++
    )
      if (value !== correct[axis])
        distractors.push({ ...correct, [axis]: value });
  let wrong = shuffle(distractors, random).slice(0, 3);
  if (axes.length === 2) {
    const [firstAxis, secondAxis] = axes;
    const first = shuffle(
      distractors.filter(
        (t) =>
          t[firstAxis] !== correct[firstAxis] &&
          t[secondAxis] === correct[secondAxis],
      ),
      random,
    )[0];
    const second = shuffle(
      distractors.filter(
        (t) =>
          t[secondAxis] !== correct[secondAxis] &&
          t[firstAxis] === correct[firstAxis],
      ),
      random,
    )[0];
    wrong = [first, second, { ...first, [secondAxis]: second[secondAxis] }];
  }
  const options = shuffle([correct, ...wrong], random);
  return {
    id: entry.id,
    family: entry.family,
    shown: entry.shown.map((t) => ({ ...t })),
    options: options.map((t) => ({ ...t })),
  };
}
export const answerIndex = (q: RuleQuestion | undefined) => {
  if (!q) return -1;
  const expected = inferNext(q.family, q.shown);
  return expected ? q.options.findIndex((t) => sameTerm(t, expected)) : -1;
};
export function explainRule(q: RuleQuestion) {
  const entry = bank().get(q.id);
  if (!entry) throw new Error("해설을 찾지 못했습니다.");
  const alternating = q.shown.length === 6;
  const steps = alternating
    ? [0, 2, 4, 1, 3, 5].map(
        (i) =>
          `${i % 2 === 0 ? "홀수" : "짝수"} 줄 · ${i + 1}번째: ${termLabel(q.shown[i])}`,
      )
    : q.shown.map((t, i) => `${i + 1}번째: ${termLabel(t)}`);
  return {
    description: entry.description,
    steps,
    conclusion: `따라서 ${q.shown.length + 1}번째${alternating ? "(홀수 줄)" : ""}는 ${termLabel(entry.expected)}입니다.`,
  };
}
export function optionReason(q: RuleQuestion, index: number) {
  const expected = inferNext(q.family, q.shown)!,
    actual = q.options[index];
  if (!actual) return "선택하지 않은 문항입니다.";
  const differences = [
    actual.direction !== expected.direction ? "방향" : null,
    actual.count !== expected.count ? "개수" : null,
    actual.mark !== expected.mark ? "표식" : null,
  ].filter(Boolean);
  return differences.length
    ? `${differences.join("·")} 조건이 맞지 않아요. 예상한 항목은 ${termLabel(expected)}입니다.`
    : "방향·개수·표식이 모두 규칙과 맞아요.";
}
