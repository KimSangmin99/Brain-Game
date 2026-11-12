import { z } from "zod";
import data from "./route-bank.json" with { type: "json" };
export const ROUTE_CONTENT_VERSION = "route-content-v1";
export interface RouteQuestion {
  id: string;
  size: number;
  start: number;
  goal: number;
  blocked: number[];
  required: number[];
  ordered: boolean;
  limit: number | null;
  shortest: number;
}
export function routeConfig(stage: number) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 30)
    throw new Error("유효하지 않은 단계입니다.");
  const band = Math.floor((stage - 1) / 5),
    role = (stage - 1) % 5;
  const goals = [
    [
      "상하좌우 길을 익혀요",
      "장애물을 피해 가요",
      "대각선과 이웃 칸을 구분해요",
      "되돌려 다른 길을 살펴봐요",
      "출발부터 도착까지 연결해요",
    ],
    [
      "필수 지점을 익혀요",
      "지점을 먼저 살펴봐요",
      "짧지만 지점을 놓친 길을 구분해요",
      "목적지에서 거꾸로 생각해요",
      "지점을 포함한 길을 완성해요",
    ],
    [
      "넓어진 지도를 만나요",
      "막다른 길을 확인해요",
      "재방문 없이 지점을 찾아요",
      "갈림길에서 계획을 세워요",
      "조건과 길이를 함께 봐요",
    ],
    [
      "두 지점을 모두 찾아요",
      "지점의 방문 순서를 계획해요",
      "한 지점만 지난 길을 구분해요",
      "두 지점을 구간으로 연결해요",
      "여러 지점을 빠짐없이 지나가요",
    ],
    [
      "정해진 방문 순서를 익혀요",
      "A와 B를 차례로 연결해요",
      "위치와 방문 순서를 구분해요",
      "순서를 지키는 갈림길을 찾아요",
      "순서와 재방문 조건을 함께 봐요",
    ],
    [
      "이동 상한을 익혀요",
      "세 지점을 구간으로 나눠요",
      "도착해도 상한을 넘긴 길을 구분해요",
      "순서와 이동 수를 함께 확인해요",
      "모든 조건을 만족하는 길을 설계해요",
    ],
  ];
  return {
    size: [4, 4, 5, 5, 6, 6][band],
    points: [0, 1, 1, 2, 2, 3][band],
    ordered: band >= 4,
    limited: band === 5,
    goal: goals[band][role],
    requiresTutorial: role === 0,
  };
}
export const routeQuestionId = (q: Omit<RouteQuestion, "id" | "shortest">) =>
  `rp1:${q.size}:${q.start}:${q.goal}:${q.blocked.join(".")}:${q.required.join(".")}:${q.ordered ? "o" : "a"}:${q.limit ?? "n"}`;
const cell = z.number().int().min(0).max(35);
export const routeQuestionSchema = z
  .object({
    id: z.string(),
    size: z.number().int().min(4).max(6),
    start: cell,
    goal: cell,
    blocked: z.array(cell).max(34),
    required: z.array(cell).max(3),
    ordered: z.boolean(),
    limit: z.number().int().min(1).max(35).nullable(),
    shortest: z.number().int().min(1).max(35),
  })
  .superRefine((q, ctx) => {
    const all = [q.start, q.goal, ...q.blocked, ...q.required];
    if (
      all.some((c) => c >= q.size * q.size) ||
      q.start === q.goal ||
      new Set(all).size !== all.length ||
      q.blocked.some((n, i) => i > 0 && n <= q.blocked[i - 1]) ||
      q.id !== routeQuestionId(q) ||
      (q.limit !== null && q.limit < q.shortest)
    )
      ctx.addIssue({
        code: "custom",
        message: "지도 형식이나 검수 정보가 맞지 않습니다.",
      });
  });
const bank: readonly (readonly RouteQuestion[])[] = data;
const clone = (q: RouteQuestion): RouteQuestion => ({
  ...q,
  blocked: [...q.blocked],
  required: [...q.required],
});
export function routeExample(stage: number) {
  routeConfig(stage);
  return clone(bank[stage - 1][0]);
}
export function newRouteQuestion(
  stage: number,
  excluded: readonly string[] = [],
  random = Math.random,
) {
  routeConfig(stage);
  const choices = bank[stage - 1].filter((q) => !excluded.includes(q.id));
  if (!choices.length) throw new Error("새 경로 지도를 준비하지 못했습니다.");
  return clone(choices[Math.floor(random() * choices.length)]);
}
export function routeQuestionForStage(q: RouteQuestion, stage: number) {
  const c = routeConfig(stage),
    expected = bank[stage - 1].find((p) => p.id === q.id);
  return (
    !!expected &&
    q.size === c.size &&
    q.required.length === c.points &&
    q.ordered === c.ordered &&
    (q.limit !== null) === c.limited &&
    JSON.stringify(q) === JSON.stringify(expected)
  );
}
export function routeNeighbors(q: Pick<RouteQuestion, "size">, at: number) {
  const r = Math.floor(at / q.size),
    c = at % q.size;
  return [
    [r - 1, c],
    [r, c + 1],
    [r + 1, c],
    [r, c - 1],
  ]
    .filter(([y, x]) => y >= 0 && x >= 0 && y < q.size && x < q.size)
    .map(([y, x]) => y * q.size + x);
}
export const cellName = (cell: number, size: number) =>
  `${Math.floor(cell / size) + 1}행 ${(cell % size) + 1}열`;
export function routeStructure(q: RouteQuestion, path: readonly number[]) {
  return (
    path.length > 0 &&
    path[0] === q.start &&
    path.every(
      (c, i) =>
        Number.isInteger(c) &&
        c >= 0 &&
        c < q.size * q.size &&
        !q.blocked.includes(c) &&
        (i === 0 || routeNeighbors(q, path[i - 1]).includes(c)) &&
        (c !== q.goal || i === path.length - 1),
    ) &&
    new Set(path).size === path.length
  );
}
export function evaluateRoute(q: RouteQuestion, path: readonly number[]) {
  const structure = routeStructure(q, path),
    goal = path.at(-1) === q.goal,
    missing = q.required.filter((c) => !path.includes(c)),
    observed = path.filter((c) => q.required.includes(c)),
    order = !q.ordered || observed.every((c, i) => c === q.required[i]),
    moves = Math.max(0, path.length - 1),
    limit = q.limit === null || moves <= q.limit;
  return {
    structure,
    goal,
    missing,
    order,
    limit,
    moves,
    correct: structure && goal && missing.length === 0 && order && limit,
  };
}
export function routeFeedback(q: RouteQuestion, path: readonly number[]) {
  const g = evaluateRoute(q, path);
  return [
    {
      ok: g.structure,
      text: g.structure
        ? "상하좌우로 연결하고 같은 칸을 다시 지나가지 않았어요."
        : "출발·장애물·상하좌우 연결·같은 칸 재방문 여부를 확인해 주세요.",
    },
    {
      ok: g.goal,
      text: g.goal
        ? "도착지까지 연결했어요."
        : "마지막 칸이 도착지인지 확인해 주세요.",
    },
    {
      ok: g.missing.length === 0,
      text: g.missing.length
        ? `아직 지나지 않은 필수 지점: ${g.missing.map((c) => String.fromCharCode(65 + q.required.indexOf(c))).join(" · ")}.`
        : q.required.length
          ? "모든 필수 지점을 지나갔어요."
          : "필수 지점이 없는 지도예요.",
    },
    {
      ok: g.order,
      text: g.order
        ? q.ordered
          ? "필수 지점의 순서를 지켰어요."
          : "이 지도는 필수 지점의 방문 순서가 자유로워요."
        : `방문 순서는 ${q.required.map((_, i) => String.fromCharCode(65 + i)).join(" → ")}예요. 현재 경로의 지점 순서를 다시 살펴보세요.`,
    },
    {
      ok: g.limit,
      text: g.limit
        ? q.limit === null
          ? `${g.moves}회 이동했어요. 이동 상한은 없어요.`
          : `${g.moves}회 이동 · 상한 ${q.limit}회 이내예요.`
        : `${g.moves}회 이동해 상한 ${q.limit}회를 넘었어요. 되돌려 더 짧은 경로를 찾아보세요.`,
    },
  ];
}
export function editRoute(
  q: RouteQuestion,
  path: readonly number[],
  target: number,
) {
  if (!Number.isInteger(target) || target < 0 || target >= q.size * q.size)
    return { path, message: "지도 안의 칸으로 이동해 주세요." };
  const previous = path.indexOf(target);
  if (previous >= 0)
    return {
      path: previous === path.length - 1 ? path : path.slice(0, previous + 1),
      message: "",
    };
  if (q.blocked.includes(target))
    return { path, message: "장애물 칸은 지나갈 수 없어요." };
  if (path.at(-1) === q.goal)
    return {
      path,
      message: "도착지에 닿았어요. 확정하거나 이전 칸으로 되돌려 보세요.",
    };
  if (!routeNeighbors(q, path.at(-1)!).includes(target))
    return { path, message: "현재 끝 칸과 상하좌우로 붙은 칸을 골라 주세요." };
  return { path: [...path, target], message: "" };
}
const solutions = new Map<string, number[] | null>();
/** Exact simple-path search: visited cells remain in the state, unlike a waypoint-only BFS. */
export function shortestRoute(
  q: RouteQuestion,
  prefix: readonly number[] = [q.start],
): number[] | null {
  if (
    !routeStructure(q, prefix) ||
    !evaluateRoute(q, prefix).order ||
    !evaluateRoute(q, prefix).limit
  )
    return null;
  const cacheKey = `${routeQuestionId(q)}|${prefix.join(".")}`;
  if (solutions.has(cacheKey)) {
    const known = solutions.get(cacheKey);
    return known ? [...known] : null;
  }
  const blocked = new Set(q.blocked),
    seen = new Set(prefix),
    path = [...prefix];
  let best: number[] | null = null;
  const distance = (a: number, b: number) =>
    Math.abs(Math.floor(a / q.size) - Math.floor(b / q.size)) +
    Math.abs((a % q.size) - (b % q.size));
  const lower = (at: number, left: readonly number[]): number =>
    left.length
      ? Math.min(
          ...(q.ordered ? [0] : left.map((_, i) => i)).map(
            (i) =>
              distance(at, left[i]) +
              lower(
                left[i],
                left.filter((_, j) => i !== j),
              ),
          ),
        )
      : distance(at, q.goal);
  const search = () => {
    const at = path.at(-1)!,
      visited = path.filter((c) => q.required.includes(c)),
      left = q.required.filter((c) => !seen.has(c));
    if (at === q.goal) {
      if (!left.length && (!best || path.length < best.length))
        best = [...path];
      return;
    }
    const bound = path.length - 1 + lower(at, left);
    if (
      (best && bound >= best.length - 1) ||
      (q.limit !== null && bound > q.limit)
    )
      return;
    const next = routeNeighbors(q, at)
      .filter(
        (c) =>
          !blocked.has(c) &&
          !seen.has(c) &&
          (!q.ordered ||
            !q.required.includes(c) ||
            c === q.required[visited.length]),
      )
      .sort(
        (a, b) =>
          lower(
            a,
            left.filter((c) => c !== a),
          ) -
          lower(
            b,
            left.filter((c) => c !== b),
          ),
      );
    for (const cell of next) {
      seen.add(cell);
      path.push(cell);
      search();
      path.pop();
      seen.delete(cell);
    }
  };
  search();
  const found = best as number[] | null;
  // Bound the optional hint-prefix cache; validated public maps are immutable.
  if (solutions.size >= 1000) solutions.clear();
  solutions.set(cacheKey, found ? [...found] : null);
  return found ? [...found] : null;
}
