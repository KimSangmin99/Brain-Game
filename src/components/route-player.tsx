"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Lightbulb,
  Pause,
  RotateCcw,
  ShieldCheck,
  Trophy,
  X,
} from "lucide-react";
import { routeEngine } from "@/lib/memory-engines";
import { useMemorySession } from "./use-memory-session";
import { routeOutcome, type RouteAttempt } from "@/lib/route";
import {
  cellName,
  editRoute,
  evaluateRoute,
  routeConfig,
  routeExample,
  routeFeedback,
  shortestRoute,
  type RouteQuestion,
} from "@/lib/route-content";
const directions = [
  { label: "위로 이동", key: "ArrowUp", dr: -1, dc: 0, glyph: "↑" },
  { label: "아래로 이동", key: "ArrowDown", dr: 1, dc: 0, glyph: "↓" },
  { label: "왼쪽으로 이동", key: "ArrowLeft", dr: 0, dc: -1, glyph: "←" },
  { label: "오른쪽으로 이동", key: "ArrowRight", dr: 0, dc: 1, glyph: "→" },
];
export function RouteBoard({
  question: q,
  path,
  disabled = false,
  hintCell,
  onCell,
  onUndo,
}: {
  question: RouteQuestion;
  path: readonly number[];
  disabled?: boolean;
  hintCell?: number;
  onCell?: (cell: number) => void;
  onUndo?: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null),
    end = path.at(-1)!;
  const move = (dr: number, dc: number) => {
    const r = Math.floor(end / q.size) + dr,
      c = (end % q.size) + dc;
    onCell?.(
      r < 0 || c < 0 || r >= q.size || c >= q.size ? -1 : r * q.size + c,
    );
  };
  const focusEnd = () =>
    requestAnimationFrame(() =>
      frame.current
        ?.querySelector<HTMLButtonElement>("[data-current=true]")
        ?.focus({ preventScroll: true }),
    );
  return (
    <div
      className="route-board-frame"
      ref={frame}
      onKeyDown={(e) => {
        if (disabled || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        const direction = directions.find((d) => d.key === e.key);
        if (direction) {
          e.preventDefault();
          move(direction.dr, direction.dc);
          focusEnd();
        } else if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          onUndo?.();
          focusEnd();
        }
      }}
    >
      <div
        className="route-board"
        role="group"
        aria-label="경로 지도"
        data-size={q.size}
        data-ordered={String(q.ordered)}
        data-limit={q.limit ?? ""}
        style={{ gridTemplateColumns: `repeat(${q.size},minmax(44px,1fr))` }}
      >
        {Array.from({ length: q.size * q.size }, (_, cell) => {
          const wall = q.blocked.includes(cell),
            point = q.required.indexOf(cell),
            step = path.indexOf(cell),
            next = path[step + 1],
            arrow =
              step >= 0 && next !== undefined
                ? next === cell + 1
                  ? "→"
                  : next === cell - 1
                    ? "←"
                    : next > cell
                      ? "↓"
                      : "↑"
                : "";
          const label = [
            cellName(cell, q.size),
            wall
              ? "장애물"
              : cell === q.start
                ? "출발"
                : cell === q.goal
                  ? "도착"
                  : point >= 0
                    ? `필수 지점 ${String.fromCharCode(65 + point)}`
                    : "빈칸",
            step >= 0 ? `경로 ${step + 1}번째` : "",
            hintCell === cell ? "힌트 다음 칸" : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <button
              type="button"
              key={cell}
              className={`route-cell ${wall ? "wall" : ""} ${step >= 0 ? "selected" : ""} ${cell === end ? "current" : ""} ${point >= 0 ? "waypoint" : ""} ${cell === hintCell ? "hinted" : ""}`}
              aria-label={label}
              aria-pressed={step >= 0}
              disabled={disabled || wall}
              tabIndex={!disabled && cell === end ? 0 : -1}
              data-cell={cell}
              data-wall={String(wall)}
              data-start={cell === q.start ? "true" : undefined}
              data-goal={cell === q.goal ? "true" : undefined}
              data-point={point >= 0 ? point : undefined}
              data-step={step >= 0 ? step + 1 : undefined}
              data-current={String(cell === end)}
              onClick={() => {
                onCell?.(cell);
                focusEnd();
              }}
            >
              <span className="route-marker" aria-hidden="true">
                {wall
                  ? "×"
                  : cell === q.start
                    ? "출"
                    : cell === q.goal
                      ? "도"
                      : point >= 0
                        ? String.fromCharCode(65 + point)
                        : ""}
              </span>
              {step >= 0 && (
                <span className="route-step" aria-hidden="true">
                  {step + 1}
                </span>
              )}
              {arrow && (
                <span className="route-arrow" aria-hidden="true">
                  {arrow}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="route-legend">
        <span>
          <b>출</b> 출발
        </span>
        <span>
          <b>도</b> 도착
        </span>
        <span>
          <b>×</b> 장애물
        </span>
        <span>숫자: 경로 순서</span>
      </div>
      {!disabled && (
        <>
          <div
            className="route-direction-pad"
            role="group"
            aria-label="한 칸 이동"
          >
            {directions.map((d) => (
              <button
                type="button"
                aria-label={d.label}
                key={d.key}
                onClick={() => move(d.dr, d.dc)}
              >
                {d.glyph}
              </button>
            ))}
          </div>
          <p className="small muted">
            현재 끝 칸과 붙은 칸을 누르세요. 방문한 칸을 누르면 그곳까지
            되돌립니다. 지도에서 방향키로 이동하고 Backspace로 되돌릴 수 있어요.
          </p>
        </>
      )}
    </div>
  );
}
function Feedback({
  question,
  path,
}: {
  question: RouteQuestion;
  path: readonly number[];
}) {
  return (
    <ul className="route-feedback-list">
      {routeFeedback(question, path).map((item, i) => (
        <li key={i} className={item.ok ? "satisfied" : "violated"}>
          {item.ok ? <Check size={20} /> : <X size={20} />}
          <span>
            <strong>{item.ok ? "조건 만족" : "다시 확인"}</strong>
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
function Conditions({ question: q }: { question: RouteQuestion }) {
  return (
    <div className="route-conditions">
      <h2>이번 지도의 조건</h2>
      <ul>
        <li>
          출발 {cellName(q.start, q.size)} → 도착 {cellName(q.goal, q.size)}
        </li>
        <li>상하좌우 한 칸씩 이동 · 같은 칸 재방문 금지</li>
        <li>
          {q.required.length ? (
            <>
              <strong>
                {q.ordered ? "방문 순서: " : "필수 지점: "}
                {q.required
                  .map((_, i) => String.fromCharCode(65 + i))
                  .join(q.ordered ? " → " : " · ")}
              </strong>
              <ul>
                {q.required.map((cell, i) => (
                  <li key={cell}>
                    {String.fromCharCode(65 + i)} · {cellName(cell, q.size)}
                  </li>
                ))}
              </ul>
              {!q.ordered && "지점 방문 순서는 자유예요."}
            </>
          ) : (
            "필수 지점이 없는 지도예요."
          )}
        </li>
        <li>
          <strong>
            {q.limit === null ? "이동 상한 없음" : `이동 상한 ${q.limit}회`}
          </strong>
        </li>
      </ul>
    </div>
  );
}
export function RoutePlayer({
  stage,
  mode,
}: {
  stage: number;
  mode: RouteAttempt["mode"];
}) {
  const {
    attempt,
    error,
    locked,
    busyTab,
    saved,
    saveError,
    dispatch,
    retrySave,
    restart,
  } = useMemorySession(routeEngine, stage, mode);
  const [leaving, setLeaving] = useState(false),
    [inputError, setInputError] = useState(""),
    [showExample, setShowExample] = useState(false),
    [showSolution, setShowSolution] = useState(false),
    heading = useRef<HTMLHeadingElement>(null);
  const config = routeConfig(stage);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    setInputError("");
    if (attempt?.phase === "intro") {
      setShowExample(false);
      setShowSolution(false);
    }
  }, [attempt?.phase]);
  if (error || locked || busyTab)
    return (
      <div className="empty-state">
        <Pause size={36} />
        <h1>
          {locked
            ? "아직 열리지 않은 단계예요."
            : busyTab
              ? "다른 탭에서 플레이 중이에요."
              : "잠시 연결을 확인해 주세요."}
        </h1>
        <p>
          {error ||
            (busyTab
              ? "진행 중인 탭을 닫은 뒤 다시 시도해 주세요."
              : "이전 스테이지를 먼저 완료해 주세요.")}
        </p>
        <Link className="button secondary" href="/games/route">
          스테이지 목록으로
        </Link>
      </div>
    );
  if (!attempt)
    return (
      <p className="loading" role="status">
        경로 지도를 준비하고 있어요…
      </p>
    );
  const a = attempt,
    isExample = a.phase === "tutorial",
    q = isExample ? routeExample(stage) : a.question,
    path = isExample ? a.exampleDraft : a.draft,
    result = routeOutcome(a),
    feedback = a.phase === "feedback",
    disabled = leaving || feedback,
    solution =
      a.phase === "result" || (isExample && showExample)
        ? shortestRoute(q)
        : null,
    hintPath =
      a.hintLevel === 2 && a.phase === "playing"
        ? shortestRoute(q, path)
        : null,
    hintCell = hintPath?.[path.length];
  const input = (cell: number) => {
    if (disabled) return;
    const edit = editRoute(q, path, cell);
    setInputError(edit.message);
    dispatch({ type: "cell", cell });
  };
  const title =
    a.phase === "intro"
      ? "조건을 살피고 길을 설계해 볼까요?"
      : isExample
        ? "예제 지도에서 길을 이어 보세요."
        : a.phase === "paused"
          ? "잠시 멈췄어요."
          : a.phase === "result"
            ? result.passed
              ? "조건을 만족하는 길을 완성했어요!"
              : a.revealed
                ? "예시 경로로 조건을 연결해 봐요."
                : "새 지도로 다시 도전해 봐요."
            : feedback
              ? "경로의 조건을 다시 살펴봐요."
              : "지점을 연결해 도착지로 가세요.";
  return (
    <div className="player-wrap route-player">
      <div className="player-top">
        <button
          className="back-link"
          onClick={() => {
            dispatch({ type: "pause" });
            setLeaving(true);
          }}
        >
          <ChevronLeft size={18} />
          실험실 나가기
        </button>
        <span className="eyebrow">
          경로 설계 / {mode === "practice" ? "자유 연습" : `스테이지 ${stage}`}
        </span>
        <span className="save-status" aria-live="polite">
          {saveError
            ? "저장되지 않음"
            : saved === a.revision
              ? "기기에 저장됨"
              : "저장 중…"}
        </span>
      </div>
      {saveError && (
        <p className="notice error" role="alert">
          기록을 저장하지 못했어요. 화면을 유지한 채 다시 시도해 주세요.
          <button onClick={retrySave}>저장 재시도</button>
        </p>
      )}
      {leaving && (
        <div className="exit-panel" role="alert">
          <div>
            <strong>여기서 잠시 쉬어 갈까요?</strong>
            <p>같은 지도와 작성 중 경로를 그대로 이어갈 수 있어요.</p>
          </div>
          <button
            className="button secondary"
            onClick={() => setLeaving(false)}
          >
            계속하기
          </button>
          <Link className="button primary" href="/games/route">
            나가기
          </Link>
        </div>
      )}
      <section className="experiment route-experiment">
        <div className="experiment-header">
          <span className="badge blue">경로 설계</span>
          <span className="muted">
            {config.size}×{config.size} · 필수 {config.points}곳
          </span>
        </div>
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        <p className="experiment-subtitle">
          {config.goal} · 응답 시간 제한은 없어요.
        </p>
        {a.phase === "intro" ? (
          <div className="route-intro">
            <div className="route-preview" aria-hidden="true">
              <span>출</span>
              <ArrowRight />
              <span>A</span>
              <ArrowRight />
              <span>도</span>
            </div>
            <p>
              출발에서 도착까지 상하좌우로 길을 이으세요. 장애물을 피하고 같은
              칸을 두 번 지나지 않아요.
            </p>
            <Conditions question={q} />
            <p className="small muted">
              조건을 만족하는 모든 경로가 정답이에요. 성공 점수는
              8,000~10,000점이며, 같은 지도에서 짧은 경로일수록 높아요.
              되돌리기는 점수에 영향을 주지 않아요.
            </p>
            <div className="play-controls">
              <button
                className="button primary"
                onClick={() => dispatch({ type: "tutorial" })}
              >
                지도 예제로 익히기 <ArrowRight size={18} />
              </button>
              {!config.requiresTutorial && (
                <button
                  className="button quiet"
                  onClick={() => dispatch({ type: "start" })}
                >
                  바로 도전하기
                </button>
              )}
            </div>
          </div>
        ) : a.phase === "paused" ? (
          <div className="paused-panel">
            <Pause size={44} />
            <p>
              같은 지도·작성 중 경로·조건 확인·도움 이력을 그대로 이어갑니다. 이
              도전에 중단 이력이 표시돼요.
            </p>
            <button
              className="button primary"
              onClick={() => dispatch({ type: "resume" })}
            >
              이 경로로 이어가기 <ArrowRight size={18} />
            </button>
          </div>
        ) : a.phase === "result" ? (
          <>
            <div className="result-panel">
              <span className="result-medal">
                <Trophy size={44} />
              </span>
              <div className="result-score">
                {result.score.toLocaleString()}
                <small>점</small>
              </div>
              <div className="result-facts">
                <span>
                  <strong>
                    {a.lastSubmission ? a.lastSubmission.length - 1 : 0}회
                  </strong>
                  제출 경로 이동 수
                </span>
                <span>
                  <strong>{q.shortest}회</strong>조건을 만족하는 최단 이동 수
                </span>
                <span>
                  <strong>
                    {result.passed
                      ? "경로 완성"
                      : a.revealed
                        ? "풀이 열람"
                        : "건너뜀"}
                  </strong>
                  {result.independent
                    ? "도움 없이 해결"
                    : a.assisted
                      ? "도움과 함께"
                      : a.interrupted
                        ? "중단 후 이어 함"
                        : "새 도전을 준비해요"}
                </span>
              </div>
              <div className="result-actions">
                {result.passed && mode === "stage" && stage < 30 ? (
                  <Link
                    className="button primary"
                    aria-disabled={saved !== a.revision}
                    href={
                      saved === a.revision
                        ? `/games/route/play?stage=${stage + 1}`
                        : "#"
                    }
                  >
                    다음 스테이지 <ArrowRight size={18} />
                  </Link>
                ) : (
                  <button
                    className="button primary"
                    disabled={saved !== a.revision}
                    onClick={restart}
                  >
                    새 지도로 재도전 <RotateCcw size={18} />
                  </button>
                )}
                <Link className="button secondary" href="/records">
                  내 기록 보기
                </Link>
              </div>
              <p className="small muted">
                {mode === "practice"
                  ? "자유 연습은 단계 개방에 반영되지 않아요."
                  : result.passed
                    ? "조건을 만족하면 통과해요. 최단 경로로 풀면 10,000점이에요."
                    : "풀이 열람과 건너뛰기는 0점이며 다음 단계를 열지 않아요."}
              </p>
            </div>
            <div className="route-workspace route-review">
              <div>
                <div
                  className="filters"
                  role="group"
                  aria-label="결과 경로 선택"
                >
                  {a.lastSubmission && (
                    <button
                      className={!showSolution ? "filter active" : "filter"}
                      aria-pressed={!showSolution}
                      onClick={() => setShowSolution(false)}
                    >
                      내 제출 경로
                    </button>
                  )}
                  <button
                    className={
                      showSolution || !a.lastSubmission
                        ? "filter active"
                        : "filter"
                    }
                    aria-pressed={showSolution || !a.lastSubmission}
                    onClick={() => setShowSolution(true)}
                  >
                    최단 예시 경로
                  </button>
                </div>
                <RouteBoard
                  question={q}
                  path={
                    showSolution || !a.lastSubmission
                      ? (solution ?? a.draft)
                      : a.lastSubmission
                  }
                  disabled
                />
                <p>
                  이 예시와 모양이 달라도 모든 조건을 만족하면 정답입니다. 이동
                  수는 경로 칸 수에서 출발 칸 하나를 뺀 값이에요.
                </p>
              </div>
              <aside>
                <Conditions question={q} />
                <h2>
                  {showSolution || !a.lastSubmission
                    ? "예시 경로의 조건 확인"
                    : "마지막 제출의 조건 확인"}
                </h2>
                <Feedback
                  question={q}
                  path={
                    showSolution || !a.lastSubmission
                      ? (solution ?? a.draft)
                      : a.lastSubmission
                  }
                />
              </aside>
            </div>
          </>
        ) : (
          <>
            <div className="route-task-summary">
              {q.required.length
                ? `${q.ordered ? "방문 순서" : "필수 지점"} ${q.required.map((_, i) => String.fromCharCode(65 + i)).join(q.ordered ? " → " : " · ")}`
                : "출발 → 도착"}{" "}
              · {q.limit === null ? "이동 상한 없음" : `최대 ${q.limit}회 이동`}
            </div>
            {feedback && (
              <p className="notice" role="status">
                조건별 설명을 살펴본 뒤 같은 경로를 수정할 수 있어요. 이 도전은
                도움 사용으로 기록됩니다.
              </p>
            )}
            <div className="route-workspace">
              <div className="route-map-panel">
                <div className="route-move-count" role="status">
                  현재 {path.length - 1}회 이동
                  {q.limit !== null && ` / 상한 ${q.limit}회`}
                </div>
                <RouteBoard
                  question={q}
                  path={path}
                  disabled={disabled}
                  hintCell={hintCell}
                  onCell={input}
                  onUndo={() => {
                    setInputError("");
                    dispatch({ type: "undo" });
                  }}
                />
                <p className="route-input-status" role="status">
                  {inputError ||
                    `현재 끝: ${cellName(path.at(-1)!, q.size)} · 출발 칸은 이동 수에 포함하지 않아요.`}
                </p>
                <div className="play-controls">
                  {feedback ? (
                    <button
                      className="button primary"
                      disabled={leaving}
                      onClick={() => dispatch({ type: "retry" })}
                    >
                      경로 수정하기 <RotateCcw size={18} />
                    </button>
                  ) : (
                    <>
                      <button
                        className="button primary"
                        disabled={leaving || path.length < 2}
                        onClick={() => dispatch({ type: "confirm" })}
                      >
                        {isExample ? "예제 조건 확인" : "경로 확정"}{" "}
                        <Check size={18} />
                      </button>
                      <button
                        className="button secondary"
                        disabled={leaving || path.length < 2}
                        onClick={() => {
                          setInputError("");
                          dispatch({ type: "undo" });
                        }}
                      >
                        한 칸 되돌리기
                      </button>
                      <button
                        className="button quiet"
                        disabled={leaving || path.length < 2}
                        onClick={() => {
                          setInputError("");
                          dispatch({ type: "clear" });
                        }}
                      >
                        처음부터 다시
                      </button>
                    </>
                  )}
                </div>
                {isExample && (
                  <>
                    <p role="status">
                      {a.tutorialPassed
                        ? "예제 조건을 모두 만족했어요. 실제 도전은 다른 지도예요."
                        : a.exampleChecked
                          ? "예제의 조건 설명을 보고 경로를 다시 이어 보세요."
                          : "예제의 확인과 길 안내는 실제 도전의 도움 사용에 포함되지 않아요."}
                    </p>
                    <button
                      className="button primary"
                      disabled={!a.tutorialPassed || leaving}
                      onClick={() => dispatch({ type: "start" })}
                    >
                      예제 완료 · 경로 시작 <ArrowRight size={18} />
                    </button>
                  </>
                )}
                <p className="sidebar-foot">
                  <ShieldCheck size={16} />
                  확정 전에는 자유롭게 되돌릴 수 있어요. 짧은 길이어도 필수
                  지점을 지나야 해요.
                </p>
              </div>
              <aside className="route-condition-panel">
                <Conditions question={q} />
                {(feedback || (isExample && a.exampleChecked)) && (
                  <Feedback
                    question={q}
                    path={feedback ? a.lastSubmission! : path}
                  />
                )}
                <div className="hint-box">
                  <Lightbulb size={20} />
                  <h3>
                    {isExample
                      ? "예제 길을 함께 볼까요?"
                      : "길을 나누어 생각해 볼까요?"}
                  </h3>
                  {isExample ? (
                    <>
                      <p>예제의 한 가지 최단 경로를 좌표로 확인할 수 있어요.</p>
                      <button
                        className="text-link"
                        disabled={leaving}
                        onClick={() => setShowExample((v) => !v)}
                      >
                        {showExample
                          ? "예제 길 안내 닫기"
                          : "예제 길 안내 보기"}
                      </button>
                      {showExample && solution && (
                        <ol className="route-coordinate-list">
                          {solution.map((cell, i) => (
                            <li key={cell}>
                              {i + 1}. {cellName(cell, q.size)}
                            </li>
                          ))}
                        </ol>
                      )}
                    </>
                  ) : (
                    <>
                      <p>
                        {a.hintLevel === 0
                          ? "필수 지점과 도착지를 먼저 살펴보세요."
                          : a.hintLevel === 1
                            ? "출발 → 필수 지점 → 도착을 구간으로 나누세요. 같은 칸을 다시 지나지 않도록 갈림길과 이동 상한을 함께 생각해 보세요."
                            : hintCell !== undefined
                              ? `힌트 다음 칸: ${cellName(hintCell, q.size)}. 현재 경로에서 조건을 만족하며 이어갈 수 있는 한 가지 선택이에요.`
                              : hintPath
                                ? "현재 경로가 조건을 만족해요. 경로를 확정해 보세요."
                                : "현재 경로에서는 조건을 모두 만족하며 이어갈 수 없어요. 이전 칸으로 되돌려 다른 길을 살펴보세요."}
                      </p>
                      <button
                        className="text-link"
                        disabled={
                          a.phase !== "playing" || a.hintLevel === 2 || leaving
                        }
                        onClick={() => dispatch({ type: "hint" })}
                      >
                        {a.hintLevel === 0
                          ? "전략 힌트 보기"
                          : a.hintLevel === 1
                            ? "다음 구간 힌트 보기"
                            : "구간 힌트를 확인했어요"}
                      </button>
                      {a.assisted && (
                        <small>이 도전에 도움 사용이 기록됩니다.</small>
                      )}
                    </>
                  )}
                </div>
              </aside>
            </div>
            {!isExample && (
              <div className="route-end-options">
                <details>
                  <summary>풀이 열람 안내</summary>
                  <p>
                    예시 경로를 확인하고 이번 도전을 0점으로 끝냅니다. 다음
                    단계는 열리지 않아요.
                  </p>
                  <button
                    className="button secondary"
                    disabled={leaving}
                    onClick={() => dispatch({ type: "reveal" })}
                  >
                    풀이 확인하고 종료
                  </button>
                </details>
                <button
                  className="text-link"
                  disabled={leaving}
                  onClick={() => dispatch({ type: "skip" })}
                >
                  이번 경로 건너뛰기
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
