export const CODE_SYMBOLS = [
  { name: "원", glyph: "●" },
  { name: "삼각형", glyph: "▲" },
  { name: "사각형", glyph: "■" },
  { name: "마름모", glyph: "◆" },
  { name: "별", glyph: "★" },
  { name: "십자", glyph: "✚" },
] as const;
export function codeConfig(stage: number) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 30)
    throw new Error("유효하지 않은 단계입니다.");
  const band = Math.floor((stage - 1) / 5),
    role = (stage - 1) % 5;
  const goals = [
    [
      "두 단서의 뜻을 익혀요",
      "위치와 포함을 나눠 봐요",
      "없는 기호를 제외해요",
      "이전 단서로 확인해요",
      "짧은 코드를 해독해요",
    ],
    [
      "기호가 늘어난 코드를 만나요",
      "포함된 기호를 좁혀요",
      "자리를 바꿔 비교해요",
      "모순되는 추측을 걸러요",
      "기호와 위치를 함께 봐요",
    ],
    [
      "네 자리 코드를 만나요",
      "확실한 위치를 찾아요",
      "바뀐 위치의 단서를 봐요",
      "조건을 하나씩 합쳐요",
      "네 자리 조건을 정리해요",
    ],
    [
      "여섯 기호에서 골라요",
      "필요 없는 후보를 제외해요",
      "위치 후보를 좁혀요",
      "앞선 단서를 모두 확인해요",
      "여러 단서를 결합해요",
    ],
    [
      "중복 기호를 만나요",
      "같은 기호의 수를 확인해요",
      "겹치는 단서를 구분해요",
      "중복을 과대 계산하지 않아요",
      "중복 코드를 해독해요",
    ],
    [
      "다섯 자리 코드를 만나요",
      "포함 조건을 정리해요",
      "위치 조건을 정리해요",
      "모든 추측과 맞춰 봐요",
      "복합 코드를 해독해요",
    ],
  ];
  return {
    length: [3, 3, 4, 4, 4, 5][band],
    choices: [4, 5, 5, 6, 6, 6][band],
    repeats: band >= 4,
    maxGuesses: [6, 6, 7, 8, 9, 10][band],
    goal: goals[band][role],
    requiresTutorial: role === 0,
  };
}
export const sameCode = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((n, i) => n === b[i]);
export function gradeCode(target: readonly number[], guess: readonly number[]) {
  if (target.length !== guess.length || !target.length)
    throw new Error("조합 길이가 맞지 않습니다.");
  let exact = 0;
  const remaining = new Map<number, number>();
  const unmatched: number[] = [];
  for (let i = 0; i < target.length; i++) {
    if (target[i] === guess[i]) exact++;
    else {
      remaining.set(target[i], (remaining.get(target[i]) ?? 0) + 1);
      unmatched.push(guess[i]);
    }
  }
  let misplaced = 0;
  for (const symbol of unmatched) {
    const count = remaining.get(symbol) ?? 0;
    if (count > 0) {
      misplaced++;
      remaining.set(symbol, count - 1);
    }
  }
  return { exact, misplaced };
}
export function validCode(values: readonly number[], stage: number) {
  const c = codeConfig(stage);
  return (
    values.length === c.length &&
    values.every((n) => Number.isInteger(n) && n >= 0 && n < c.choices) &&
    (c.repeats || new Set(values).size === values.length)
  );
}
export function newCode(
  stage: number,
  excluded: readonly number[][] = [],
  random = Math.random,
) {
  const c = codeConfig(stage);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const pool = Array.from({ length: c.choices }, (_, i) => i),
      code: number[] = [];
    while (code.length < c.length) {
      const index = Math.floor(random() * pool.length);
      code.push(pool[index]);
      if (!c.repeats) pool.splice(index, 1);
    }
    if (!excluded.some((old) => sameCode(old, code))) return code;
  }
  throw new Error("새 코드를 준비하지 못했습니다.");
}
export interface CodeGuess {
  symbols: number[];
  exact: number;
  misplaced: number;
}
export function matchesClues(
  candidate: readonly number[],
  history: readonly CodeGuess[],
) {
  return history.every((g) => {
    const result = gradeCode(candidate, g.symbols);
    return result.exact === g.exact && result.misplaced === g.misplaced;
  });
}
const pools = new Map<string, number[][]>();
export function candidateCodes(stage: number, history: readonly CodeGuess[]) {
  const c = codeConfig(stage),
    key = `${c.length}-${c.choices}-${c.repeats}`;
  let pool = pools.get(key);
  if (!pool) {
    pool = [];
    const build = (prefix: number[]) => {
      if (prefix.length === c.length) {
        pool!.push(prefix);
        return;
      }
      for (let n = 0; n < c.choices; n++)
        if (c.repeats || !prefix.includes(n)) build([...prefix, n]);
    };
    build([]);
    pools.set(key, pool);
  }
  return pool.filter((p) => matchesClues(p, history)).map((p) => [...p]);
}
export function codeExample(stage: number) {
  const c = codeConfig(stage);
  const target = c.repeats
    ? [0, 1, 0, 2, ...(c.length === 5 ? [3] : [])]
    : Array.from({ length: c.length }, (_, i) => i);
  const guess = c.repeats
    ? [0, 0, 1, 4, ...(c.length === 5 ? [5] : [])]
    : [0, 2, c.length === 3 ? 3 : 1, ...(c.length === 4 ? [4] : [])];
  return { target, guess, ...gradeCode(target, guess) };
}
