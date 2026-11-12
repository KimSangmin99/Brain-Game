import { z } from "zod";
export const SEARCH_CONTENT_VERSION = "search-content-v1";
export const SEARCH_SHAPES = ["원", "삼각형", "사각형", "마름모"] as const;
export const SEARCH_MARKS = [
  "점 하나",
  "점 두 개",
  "가로줄 하나",
  "가로줄 두 개",
] as const;
export function searchConfig(stage: number) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 30)
    throw new Error("유효하지 않은 단계입니다.");
  const band = Math.floor((stage - 1) / 5),
    role = (stage - 1) % 5;
  const goals = [
    [
      "모양 조건을 익혀요",
      "한 줄씩 살펴봐요",
      "다른 모양을 구분해요",
      "빠뜨린 칸을 다시 살펴요",
      "모양 조건을 끝까지 유지해요",
    ],
    [
      "표식 조건을 익혀요",
      "모양에 흔들리지 않고 찾아요",
      "점과 줄을 구분해요",
      "선택한 칸을 다시 확인해요",
      "표식 조건을 끝까지 유지해요",
    ],
    [
      "두 조건을 함께 익혀요",
      "모양 다음 표식을 확인해요",
      "한 조건만 맞는 대상을 구분해요",
      "두 조건을 차례로 대조해요",
      "두 조건이 모두 맞는 대상을 찾아요",
    ],
    [
      "비슷한 표식을 구분해요",
      "하나와 둘을 다시 확인해요",
      "같은 모양의 방해 대상을 구분해요",
      "두 조건을 빠짐없이 확인해요",
      "비슷한 대상 속에서 목표를 찾아요",
    ],
    [
      "넓어진 탐색판을 만나요",
      "일정한 순서로 살펴봐요",
      "줄이 바뀌어도 조건을 유지해요",
      "오선택과 놓침을 함께 줄여요",
      "전체 판을 차근차근 확인해요",
    ],
    [
      "많아진 목표를 찾아요",
      "두 조건을 안정적으로 유지해요",
      "비슷하지만 다른 표식을 구분해요",
      "선택과 미선택을 다시 확인해요",
      "끝까지 조건에 맞춰 탐색해요",
    ],
  ];
  return {
    size: [3, 3, 4, 4, 5, 5][band],
    targets: [2, 3, 3, 4, 5, 6][band],
    attribute:
      band === 0
        ? ("shape" as const)
        : band === 1
          ? ("mark" as const)
          : ("both" as const),
    similar: band >= 3,
    goal: goals[band][role],
    requiresTutorial: role === 0,
  };
}
export interface SearchSignal {
  shape: number;
  mark: number;
}
export interface SearchTarget {
  shape: number | null;
  mark: number | null;
}
export interface SearchQuestion {
  id: string;
  size: number;
  target: SearchTarget;
  cells: SearchSignal[];
}
export const matchesSearch = (signal: SearchSignal, target: SearchTarget) =>
  (target.shape === null || signal.shape === target.shape) &&
  (target.mark === null || signal.mark === target.mark);
export const searchQuestionId = (q: Omit<SearchQuestion, "id">) =>
  `sq1:${q.size}:${q.target.shape ?? "n"}:${q.target.mark ?? "n"}:${q.cells.map((c) => `${c.shape}${c.mark}`).join(".")}`;
const attribute = z.number().int().min(0).max(3);
export const searchQuestionSchema = z
  .object({
    id: z.string(),
    size: z.number().int().min(3).max(5),
    target: z.object({
      shape: attribute.nullable(),
      mark: attribute.nullable(),
    }),
    cells: z
      .array(z.object({ shape: attribute, mark: attribute }))
      .min(9)
      .max(25),
  })
  .superRefine((q, ctx) => {
    if (
      (q.target.shape === null && q.target.mark === null) ||
      q.cells.length !== q.size * q.size ||
      !q.cells.some((c) => matchesSearch(c, q.target)) ||
      q.id !== searchQuestionId(q)
    )
      ctx.addIssue({
        code: "custom",
        message: "탐색 조건·격자·문제 식별자가 맞지 않습니다.",
      });
  });
export const searchTargets = (q: SearchQuestion) =>
  q.cells.flatMap((cell, i) => (matchesSearch(cell, q.target) ? [i] : []));
export const validSearchSelection = (
  q: SearchQuestion,
  selected: readonly number[],
) =>
  new Set(selected).size === selected.length &&
  selected.every((i) => Number.isInteger(i) && i >= 0 && i < q.cells.length);
export function gradeSearch(q: SearchQuestion, selected: readonly number[]) {
  if (!validSearchSelection(q, selected))
    throw new Error("선택한 칸의 형식이 맞지 않습니다.");
  const targets = searchTargets(q),
    total = targets.length;
  if (!total) throw new Error("목표가 없는 탐색판입니다.");
  const tp = selected.filter((i) => targets.includes(i)).length,
    fp = selected.length - tp,
    fn = total - tp;
  return {
    tp,
    fp,
    fn,
    total,
    score: Math.floor((10000 * Math.max(0, tp - fp)) / total),
    correct: fp === 0 && fn === 0,
  };
}
export function searchQuestionForStage(q: SearchQuestion, stage: number) {
  const c = searchConfig(stage),
    s = q.target.shape,
    m = q.target.mark;
  if (
    q.size !== c.size ||
    q.cells.length !== c.size * c.size ||
    searchTargets(q).length !== c.targets ||
    q.id !== searchQuestionId(q)
  )
    return false;
  if (c.attribute === "shape")
    return s !== null && m === null && q.cells.every((cell) => cell.mark === 0);
  if (c.attribute === "mark")
    return (
      s === null &&
      m !== null &&
      q.cells.every(
        (cell) =>
          cell.mark === m || Math.floor(cell.mark / 2) !== Math.floor(m / 2),
      )
    );
  if (s === null || m === null) return false;
  const shapeOnly = q.cells.filter(
      (cell) => cell.shape === s && cell.mark !== m,
    ),
    markOnly = q.cells.filter((cell) => cell.mark === m && cell.shape !== s);
  const partial = c.similar
    ? Math.floor((c.size * c.size - c.targets) * 0.38)
    : 2;
  return (
    shapeOnly.length === partial &&
    markOnly.length === partial &&
    shapeOnly.every(
      (cell) => cell.mark === (c.similar ? m ^ 1 : (m + 2) % 4),
    ) &&
    (!c.similar ? markOnly.every((cell) => cell.shape === (s + 2) % 4) : true)
  );
}
export function newSearchQuestion(
  stage: number,
  excluded: readonly string[] = [],
  random = Math.random,
): SearchQuestion {
  const c = searchConfig(stage),
    pick = (n: number) => Math.floor(random() * n);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const shape = pick(4),
      mark = pick(4),
      target = {
        shape: c.attribute === "mark" ? null : shape,
        mark: c.attribute === "shape" ? null : mark,
      },
      cells: SearchSignal[] = [];
    for (let i = 0; i < c.targets; i++)
      cells.push({
        shape: c.attribute === "mark" ? pick(4) : shape,
        mark: c.attribute === "shape" ? 0 : mark,
      });
    if (c.attribute === "both") {
      const partial = c.similar
        ? Math.floor((c.size * c.size - c.targets) * 0.38)
        : 2;
      for (let i = 0; i < partial; i++) {
        cells.push({ shape, mark: c.similar ? mark ^ 1 : (mark + 2) % 4 });
        cells.push({
          shape: c.similar ? (shape + 1 + pick(3)) % 4 : (shape + 2) % 4,
          mark,
        });
      }
    }
    while (cells.length < c.size * c.size)
      cells.push({
        shape: c.attribute === "mark" ? pick(4) : (shape + 1 + pick(3)) % 4,
        mark:
          c.attribute === "shape"
            ? 0
            : c.attribute === "mark"
              ? (Math.floor(mark / 2) ^ 1) * 2 + pick(2)
              : (mark + 2 + pick(2)) % 4,
      });
    for (let i = cells.length - 1; i > 0; i--) {
      const j = pick(i + 1);
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    const q = {
      id: searchQuestionId({ size: c.size, target, cells }),
      size: c.size,
      target,
      cells,
    };
    if (!excluded.includes(q.id)) return q;
  }
  throw new Error("새 탐색판을 준비하지 못했습니다.");
}
const examples = new Map<number, SearchQuestion>();
export function searchExample(stage: number) {
  let q = examples.get(stage);
  if (!q) {
    let seed = stage * 20261113;
    const random = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    q = newSearchQuestion(stage, [], random);
    examples.set(stage, q);
  }
  return {
    ...q,
    target: { ...q.target },
    cells: q.cells.map((c) => ({ ...c })),
  };
}
export function searchTargetLabel(target: SearchTarget) {
  return [
    target.shape !== null ? `모양: ${SEARCH_SHAPES[target.shape]}` : null,
    target.mark !== null ? `표식: ${SEARCH_MARKS[target.mark]}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
export function searchCellReason(signal: SearchSignal, target: SearchTarget) {
  const shape =
      target.shape === null
        ? "모양은 이번 조건에 없어요."
        : signal.shape === target.shape
          ? "모양이 맞아요."
          : `모양이 ${SEARCH_SHAPES[signal.shape]}이라 ${SEARCH_SHAPES[target.shape]} 조건과 달라요.`,
    mark =
      target.mark === null
        ? "표식은 이번 조건에 없어요."
        : signal.mark === target.mark
          ? "표식이 맞아요."
          : `표식이 ${SEARCH_MARKS[signal.mark]}라 ${SEARCH_MARKS[target.mark]} 조건과 달라요.`;
  return `${shape} ${mark}`;
}
