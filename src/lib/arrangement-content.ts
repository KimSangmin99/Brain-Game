import { z } from "zod";
export const ARRANGEMENT_CONTENT_VERSION = "arrangement-content-v1";
export const ARRANGEMENT_ITEMS = [
  { name: "가람", glyph: "●" },
  { name: "나래", glyph: "▲" },
  { name: "다온", glyph: "■" },
  { name: "라온", glyph: "◆" },
  { name: "마루", glyph: "★" },
  { name: "보라", glyph: "✚" },
] as const;
const item = z.number().int().min(0).max(5);
export const clueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("at"), a: item, slot: item }),
  z.object({ kind: z.literal("notAt"), a: item, slot: item }),
  z.object({ kind: z.literal("before"), a: item, b: item }),
  z.object({ kind: z.literal("next"), a: item, b: item }),
  z.object({ kind: z.literal("adjacent"), a: item, b: item }),
]);
export type ArrangementClue = z.infer<typeof clueSchema>;
export interface ArrangementQuestion {
  id: string;
  size: number;
  clues: ArrangementClue[];
}
export const clueKey = (c: ArrangementClue) =>
  `${c.kind}:${c.a}:${"slot" in c ? c.slot : c.b}`;
export const questionId = (size: number, clues: readonly ArrangementClue[]) =>
  `aq1:${size}:${clues.map(clueKey).sort().join(";")}`;
export function arrangementConfig(stage: number) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 30)
    throw new Error("유효하지 않은 단계입니다.");
  const band = Math.floor((stage - 1) / 5),
    role = (stage - 1) % 5;
  const labels = [
    "직접 위치",
    "직접 위치와 바로 인접",
    "앞뒤 순서",
    "순서와 인접",
    "부정 조건",
    "전체 혼합",
  ];
  const goals = [
    [
      "자리 번호를 익혀요",
      "정해진 위치에 놓아요",
      "왼쪽과 오른쪽을 구분해요",
      "조건과 자리를 대조해요",
      "위치 조건을 모두 확인해요",
    ],
    [
      "바로 이웃한 관계를 익혀요",
      "정해진 자리부터 배치해요",
      "바로 왼쪽의 뜻을 구분해요",
      "붙어 있는 순서를 찾아요",
      "위치와 인접 조건을 함께 봐요",
    ],
    [
      "앞뒤 순서를 익혀요",
      "순서의 연결을 찾아요",
      "왼쪽과 바로 왼쪽을 구분해요",
      "여러 순서를 이어 봐요",
      "모든 순서를 확인해요",
    ],
    [
      "순서와 이웃 관계를 결합해요",
      "이웃한 두 대상을 묶어 봐요",
      "이웃의 방향을 확인해요",
      "묶음과 순서를 연결해요",
      "관계 조건을 모두 확인해요",
    ],
    [
      "놓을 수 없는 자리를 익혀요",
      "제외 조건으로 후보를 좁혀요",
      "아님과 맞음을 구분해요",
      "순서와 제외 조건을 연결해요",
      "부정 조건을 빠짐없이 확인해요",
    ],
    [
      "여러 조건을 함께 정리해요",
      "확정된 위치에서 시작해요",
      "바로 이웃과 앞뒤를 구분해요",
      "제외 조건으로 모순을 찾아요",
      "모든 관계를 연결해요",
    ],
  ];
  const kinds: ArrangementClue["kind"][][] = [
    ["at"],
    ["at", "next"],
    ["before"],
    ["before", "adjacent"],
    ["before", "notAt"],
    ["at", "before", "next", "adjacent", "notAt"],
  ];
  return {
    size: [3, 3, 4, 4, 5, 6][band],
    band,
    role,
    label: labels[band],
    goal: goals[band][role],
    kinds: kinds[band],
    requiresTutorial: role === 0,
  };
}
const permutations = new Map<number, number[][]>();
export function allArrangements(size: number) {
  if (!Number.isInteger(size) || size < 3 || size > 6)
    throw new Error("대상 수가 맞지 않습니다.");
  let pool = permutations.get(size);
  if (!pool) {
    pool = [];
    const build = (p: number[]) => {
      if (p.length === size) {
        pool!.push(p);
        return;
      }
      for (let n = 0; n < size; n++) if (!p.includes(n)) build([...p, n]);
    };
    build([]);
    permutations.set(size, pool);
  }
  return pool.map((p) => [...p]);
}
export function validArrangement(
  draft: readonly (number | null)[],
  size: number,
): draft is readonly number[] {
  return (
    draft.length === size &&
    draft.every(
      (n) => n !== null && Number.isInteger(n) && n >= 0 && n < size,
    ) &&
    new Set(draft).size === size
  );
}
export function satisfiesClue(
  layout: readonly number[],
  clue: ArrangementClue,
) {
  const a = layout.indexOf(clue.a);
  if (a < 0) return false;
  if (clue.kind === "at") return a === clue.slot;
  if (clue.kind === "notAt") return a !== clue.slot;
  const b = layout.indexOf(clue.b);
  if (b < 0) return false;
  return clue.kind === "before"
    ? a < b
    : clue.kind === "next"
      ? a + 1 === b
      : Math.abs(a - b) === 1;
}
export function evaluateArrangement(
  q: ArrangementQuestion,
  draft: readonly (number | null)[],
) {
  const valid = validArrangement(draft, q.size);
  const satisfied = q.clues.map((c) => valid && satisfiesClue(draft, c));
  return { valid, satisfied, correct: valid && satisfied.every(Boolean) };
}
export function arrangementSolutions(q: ArrangementQuestion) {
  return allArrangements(q.size).filter((p) =>
    q.clues.every((c) => satisfiesClue(p, c)),
  );
}
export const arrangementQuestionSchema = z
  .object({
    id: z.string(),
    size: z.number().int().min(3).max(6),
    clues: z.array(clueSchema).min(3).max(12),
  })
  .superRefine((q, ctx) => {
    if (
      q.clues.some(
        (c) =>
          c.a >= q.size ||
          ("slot" in c ? c.slot >= q.size : c.b >= q.size || c.a === c.b),
      ) ||
      new Set(q.clues.map(clueKey)).size !== q.clues.length ||
      q.id !== questionId(q.size, q.clues)
    )
      ctx.addIssue({
        code: "custom",
        message: "조건의 대상·자리·문제 식별자가 맞지 않습니다.",
      });
  });
// Canonical templates are exhaustively solved once; relabelling preserves their unique solution.
const templates = new Map<number, ArrangementClue[]>();
function template(stage: number): ArrangementClue[] {
  const cached = templates.get(stage);
  if (cached) return cached.map((c) => ({ ...c }));
  const c = arrangementConfig(stage),
    n = c.size,
    r = c.role;
  let clues: ArrangementClue[] = [];
  if (c.band === 0)
    clues = Array.from({ length: n }, (_, a) => ({
      kind: "at" as const,
      a,
      slot: a,
    }));
  else if (c.band === 1)
    clues = [
      { kind: "at", a: r % 3, slot: r % 3 },
      { kind: "next", a: 0, b: 1 },
      { kind: "next", a: 1, b: 2 },
    ];
  else if (c.band === 2)
    clues = [
      { kind: "before", a: 0, b: 1 },
      { kind: "before", a: 1, b: 2 },
      { kind: "before", a: 2, b: 3 },
      { kind: "before", a: r % 2, b: 3 },
    ];
  else if (c.band === 3)
    clues = [
      { kind: "adjacent", a: 0, b: 1 },
      { kind: "adjacent", a: 2, b: 3 },
      { kind: "before", a: 0, b: 1 },
      { kind: "before", a: r % 2, b: 3 },
      { kind: "before", a: 2, b: 3 },
    ];
  else {
    // Keep a swapped rival valid under every positive clue. The negative clue is therefore necessary.
    const k = r % (n - 1),
      identity = Array.from({ length: n }, (_, i) => i),
      rival = [...identity];
    [rival[k], rival[k + 1]] = [rival[k + 1], rival[k]];
    const pool: ArrangementClue[] = [];
    for (let a = 0; a < n; a++) {
      if (c.band === 5) pool.push({ kind: "at", a, slot: a });
      for (let b = 0; b < n; b++)
        if (a !== b) {
          pool.push({ kind: "before", a, b });
          if (c.band === 5) {
            pool.push({ kind: "next", a, b });
            if (a < b) pool.push({ kind: "adjacent", a, b });
          }
        }
    }
    const common = pool.filter(
      (p) => satisfiesClue(identity, p) && satisfiesClue(rival, p),
    );
    clues = [{ kind: "notAt", a: k, slot: k + 1 }];
    if (c.band === 5)
      for (const kind of ["at", "before", "next", "adjacent"] as const) {
        const pick = common.find((p) => p.kind === kind);
        if (!pick) throw new Error("혼합 예제 조건이 없습니다.");
        clues.push(pick);
      }
    let candidates = allArrangements(n).filter((p) =>
      clues.every((c) => satisfiesClue(p, c)),
    );
    while (candidates.length > 1) {
      const choices = common
        .filter((p) => !clues.some((c) => clueKey(c) === clueKey(p)))
        .map((clue) => ({
          clue,
          remaining: candidates.filter((p) => satisfiesClue(p, clue)),
        }))
        .sort((a, b) => a.remaining.length - b.remaining.length);
      const best = choices[0];
      if (!best || best.remaining.length >= candidates.length)
        throw new Error("유일한 배열을 만들지 못했습니다.");
      clues.push(best.clue);
      candidates = best.remaining;
    }
    for (const p of common) {
      if (clues.length >= n) break;
      if (!clues.some((c) => clueKey(c) === clueKey(p))) clues.push(p);
    }
  }
  const q = { id: questionId(n, clues), size: n, clues };
  if (
    !arrangementQuestionSchema.safeParse(q).success ||
    arrangementSolutions(q).length !== 1 ||
    clues.length < n
  )
    throw new Error("검수된 배열 문제를 준비하지 못했습니다.");
  templates.set(
    stage,
    clues.map((c) => ({ ...c })),
  );
  return clues;
}
const banks = new Map<number, Map<string, ArrangementQuestion>>();
function bank(stage: number) {
  let entries = banks.get(stage);
  if (!entries) {
    const c = arrangementConfig(stage),
      base = template(stage);
    entries = new Map();
    for (const labels of allArrangements(c.size)) {
      const clues = base.map((p) =>
        "slot" in p
          ? { ...p, a: labels[p.a] }
          : { ...p, a: labels[p.a], b: labels[p.b] },
      );
      const id = questionId(c.size, clues);
      entries.set(id, { id, size: c.size, clues });
    }
    banks.set(stage, entries);
  }
  return entries;
}
function copy(q: ArrangementQuestion): ArrangementQuestion {
  return { ...q, clues: q.clues.map((c) => ({ ...c })) };
}
export function arrangementExample(stage: number) {
  const c = arrangementConfig(stage),
    clues = template(stage);
  return { id: questionId(c.size, clues), size: c.size, clues };
}
export function newArrangementQuestion(
  stage: number,
  excluded: readonly string[] = [],
  random = Math.random,
) {
  const choices = [...bank(stage).values()].filter(
    (q) => !excluded.includes(q.id),
  );
  if (!choices.length) throw new Error("새 배열 문제를 준비하지 못했습니다.");
  return copy(choices[Math.floor(random() * choices.length)]);
}
export function questionForArrangementStage(
  q: ArrangementQuestion,
  stage: number,
) {
  const expected = bank(stage).get(q.id);
  return (
    !!expected &&
    q.size === expected.size &&
    q.clues.length === expected.clues.length &&
    q.clues.every((c, i) => clueKey(c) === clueKey(expected.clues[i]))
  );
}
export function clueText(c: ArrangementClue) {
  const a = ARRANGEMENT_ITEMS[c.a].name;
  if ("slot" in c)
    return c.kind === "at"
      ? `${a}의 자리는 ${c.slot + 1}번입니다.`
      : `${a}의 자리는 ${c.slot + 1}번이 아닙니다.`;
  const b = ARRANGEMENT_ITEMS[c.b].name;
  return c.kind === "before"
    ? `${a}의 자리는 ${b}보다 왼쪽입니다.`
    : c.kind === "next"
      ? `${a}의 자리는 ${b}의 바로 왼쪽입니다.`
      : `${a}, ${b}의 자리는 서로 바로 이웃합니다. (양쪽 방향 가능)`;
}
export function clueReason(c: ArrangementClue, layout: readonly number[]) {
  const a = layout.indexOf(c.a) + 1;
  if ("slot" in c)
    return `${ARRANGEMENT_ITEMS[c.a].name}의 현재 자리는 ${a}번이에요. ${c.kind === "at" ? `${c.slot + 1}번에 있어야 해요.` : `${c.slot + 1}번에는 놓을 수 없어요.`}`;
  const b = layout.indexOf(c.b) + 1;
  return `${ARRANGEMENT_ITEMS[c.a].name} ${a}번 · ${ARRANGEMENT_ITEMS[c.b].name} ${b}번. ${c.kind === "before" ? "첫 대상의 번호가 더 작아야 해요. 중간에 다른 대상이 있어도 괜찮아요." : c.kind === "next" ? "첫 대상이 왼쪽이고 번호 차이가 1이어야 해요." : "번호 차이가 1이어야 해요. 어느 쪽이 왼쪽이어도 괜찮아요."}`;
}
export function arrangementExplanation(q: ArrangementQuestion) {
  let candidates = allArrangements(q.size);
  const fixed = new Set<number>();
  const steps = q.clues.map((clue, index) => {
    const before = candidates.length;
    candidates = candidates.filter((p) => satisfiesClue(p, clue));
    const decided: string[] = [];
    for (let item = 0; item < q.size; item++)
      if (candidates.length && !fixed.has(item)) {
        const positions = new Set(candidates.map((p) => p.indexOf(item)));
        if (positions.size === 1) {
          fixed.add(item);
          decided.push(
            `${ARRANGEMENT_ITEMS[item].name}의 자리 ${[...positions][0] + 1}번`,
          );
        }
      }
    return {
      index,
      before,
      after: candidates.length,
      text: `조건 ${index + 1}을 함께 적용하면 가능한 배치가 ${before === candidates.length ? `${before}개로 유지돼요.` : `${before}개에서 ${candidates.length}개로 줄어요.`}${decided.length ? ` ${decided.join("、")}으로 정해져요.` : ""}`,
    };
  });
  return { steps, solution: candidates[0] ?? null };
}
