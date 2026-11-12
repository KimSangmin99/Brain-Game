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
import { searchEngine } from "@/lib/memory-engines";
import { useMemorySession } from "./use-memory-session";
import { searchOutcome, type SearchAttempt } from "@/lib/search";
import {
  SEARCH_SHAPES,
  SEARCH_MARKS,
  gradeSearch,
  matchesSearch,
  newSearchQuestion,
  searchCellReason,
  searchConfig,
  searchExample,
  searchTargetLabel,
  searchTargets,
  type SearchQuestion,
} from "@/lib/search-content";
import { SearchGlyph } from "./search-glyph";
export function SearchBoard({
  question: q,
  selected,
  disabled = false,
  feedback = false,
  hintRow,
  onToggle,
}: {
  question: SearchQuestion;
  selected: readonly number[];
  disabled?: boolean;
  feedback?: boolean;
  hintRow?: number;
  onToggle?: (cell: number) => void;
}) {
  const [cursor, setCursor] = useState(0),
    grid = useRef<HTMLDivElement>(null);
  useEffect(() => setCursor(0), [q.id]);
  return (
    <div
      className={`search-board ${feedback ? "reviewing" : ""}`}
      ref={grid}
      role="group"
      aria-label="신호 탐색판"
      data-size={q.size}
      style={{ gridTemplateColumns: `repeat(${q.size},minmax(44px,1fr))` }}
      onKeyDown={(e) => {
        if (disabled || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        const delta =
          e.key === "ArrowRight"
            ? 1
            : e.key === "ArrowLeft"
              ? -1
              : e.key === "ArrowDown"
                ? q.size
                : e.key === "ArrowUp"
                  ? -q.size
                  : 0;
        if (delta) {
          e.preventDefault();
          const next = (cursor + delta + q.cells.length) % q.cells.length;
          setCursor(next);
          grid.current
            ?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)
            ?.focus();
        }
      }}
    >
      {q.cells.map((signal, i) => {
        const chosen = selected.includes(i),
          target = feedback && matchesSearch(signal, q.target),
          status = feedback
            ? target
              ? chosen
                ? "맞게 선택"
                : "놓친 대상"
              : chosen
                ? "오선택"
                : "제외 대상"
            : chosen
              ? "선택됨"
              : "선택 안 됨";
        return (
          <button
            type="button"
            key={i}
            className={`search-cell ${chosen ? "selected" : ""} ${feedback ? (target ? (chosen ? "correct-selected" : "missed") : chosen ? "false-positive" : "") : ""} ${hintRow === Math.floor(i / q.size) ? "hint-region" : ""}`}
            data-cell={i}
            data-shape={signal.shape}
            data-mark={signal.mark}
            aria-label={`${Math.floor(i / q.size) + 1}행 ${(i % q.size) + 1}열 · ${SEARCH_SHAPES[signal.shape]} · ${SEARCH_MARKS[signal.mark]} · ${status}`}
            aria-pressed={chosen}
            disabled={disabled}
            tabIndex={!disabled && cursor === i ? 0 : -1}
            onFocus={() => setCursor(i)}
            onClick={() => onToggle?.(i)}
          >
            <SearchGlyph {...signal} />
            {feedback ? (
              target ? (
                <span
                  className={`search-cell-result ${chosen ? "hit" : "miss"}`}
                  aria-hidden="true"
                >
                  {chosen ? "정답" : "놓침"}
                </span>
              ) : chosen ? (
                <span className="search-cell-result wrong" aria-hidden="true">
                  오선택
                </span>
              ) : null
            ) : chosen ? (
              <span className="search-selected-indicator" aria-hidden="true">
                <Check size={14} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
function Goal({ question: q }: { question: SearchQuestion }) {
  return (
    <div
      className="search-goal"
      data-target-shape={q.target.shape ?? ""}
      data-target-mark={q.target.mark ?? ""}
    >
      <SearchGlyph {...q.target} />
      <div>
        <span className="eyebrow">이번 보드의 목표</span>
        <strong>{searchTargetLabel(q.target)}</strong>
        <span>
          {q.target.shape === null
            ? "모양은 관계없어요."
            : q.target.mark === null
              ? "표식은 관계없어요."
              : "두 조건이 모두 맞아야 해요."}{" "}
          맞는 대상을 모두 고르세요.
        </span>
      </div>
    </div>
  );
}
function BoardFeedback({
  question: q,
  selected,
  zero = false,
}: {
  question: SearchQuestion;
  selected: readonly number[];
  zero?: boolean;
}) {
  const grade = gradeSearch(q, selected),
    missed = searchTargets(q).filter((i) => !selected.includes(i)),
    wrong = selected.filter((i) => !matchesSearch(q.cells[i], q.target));
  return (
    <div className="search-feedback">
      <div className="search-feedback-counts">
        <span>
          <strong>{grade.tp}</strong>맞게 선택
        </span>
        <span>
          <strong>{grade.fn}</strong>놓침
        </span>
        <span>
          <strong>{grade.fp}</strong>오선택
        </span>
      </div>
      <p className="search-board-score">
        이번 보드 <strong>{(zero ? 0 : grade.score).toLocaleString()}점</strong>
      </p>
      <p className="small muted">
        {zero
          ? "건너뛰기·풀이 열람은 0점이며 모든 목표를 미응답으로 기록해요."
          : `목표 ${grade.total}개 중 맞게 선택 ${grade.tp}개에서 오선택 ${grade.fp}개를 뺀 값을 점수에 반영했어요.`}
      </p>
      {missed.length || wrong.length ? (
        <details className="search-cell-explanations">
          <summary>
            놓친 칸·오선택 설명 ({missed.length + wrong.length}개)
          </summary>
          <ul>
            {[...missed, ...wrong]
              .sort((a, b) => a - b)
              .map((i) => (
                <li key={i}>
                  <strong>
                    {Math.floor(i / q.size) + 1}행 {(i % q.size) + 1}열 ·{" "}
                    {missed.includes(i) ? "놓침" : "오선택"}
                  </strong>
                  <p>{searchCellReason(q.cells[i], q.target)}</p>
                </li>
              ))}
          </ul>
        </details>
      ) : (
        <p className="notice">목표를 빠뜨리거나 다른 대상을 고르지 않았어요.</p>
      )}
    </div>
  );
}
export function SearchPlayer({
  stage,
  mode,
}: {
  stage: number;
  mode: SearchAttempt["mode"];
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
  } = useMemorySession(searchEngine, stage, mode);
  const [leaving, setLeaving] = useState(false),
    [reviewRound, setReviewRound] = useState(0),
    heading = useRef<HTMLHeadingElement>(null);
  const config = searchConfig(stage);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (attempt?.phase === "result") setReviewRound(0);
  }, [attempt?.phase, attempt?.round]);
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
        <Link className="button secondary" href="/games/search">
          스테이지 목록으로
        </Link>
      </div>
    );
  if (!attempt)
    return (
      <p className="loading" role="status">
        탐색판을 준비하고 있어요…
      </p>
    );
  const a = attempt,
    isExample = a.phase === "tutorial",
    isResult = a.phase === "result",
    q = isExample
      ? searchExample(stage)
      : a.questions[isResult ? reviewRound : a.round],
    selected = isExample
      ? a.exampleSelected
      : isResult
        ? a.answers[reviewRound].selected
        : a.selected,
    answer = a.answers[isResult ? reviewRound : a.round],
    feedback =
      isResult || a.phase === "feedback" || (isExample && a.exampleChecked),
    editing = isExample || a.phase === "question",
    result = searchOutcome(a),
    hintRow =
      a.phase === "question" && a.hintLevel === 2
        ? Math.floor(searchTargets(q)[0] / q.size)
        : undefined;
  const title =
    a.phase === "intro"
      ? "목표 신호를 차근차근 찾아볼까요?"
      : isExample
        ? "예제에서 목표 조건을 익혀요."
        : a.phase === "paused"
          ? "잠시 멈췄어요."
          : isResult
            ? result.passed
              ? "목표에 맞춰 탐색을 완료했어요!"
              : "조건을 돌아보고 다시 도전해요."
            : a.phase === "feedback"
              ? "선택한 대상과 놓친 칸을 비교해요."
              : "조건에 맞는 신호를 모두 골라주세요.";
  const resume = () =>
    dispatch({
      type: "resume",
      question: newSearchQuestion(stage, [
        searchExample(stage).id,
        ...a.questions.map((q) => q.id),
      ]),
    });
  return (
    <div className="player-wrap search-player">
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
          신호 탐색 / {mode === "practice" ? "자유 연습" : `스테이지 ${stage}`}
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
            <p>
              확정한 보드는 보존해요. 탐색 중인 보드는 이어갈 때 다른 탐색판으로
              바뀝니다.
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => setLeaving(false)}
          >
            계속하기
          </button>
          <Link className="button primary" href="/games/search">
            나가기
          </Link>
        </div>
      )}
      <section className="experiment search-experiment">
        <div className="experiment-header">
          <span className="badge amber">신호 탐색</span>
          <span className="muted">
            {config.size}×{config.size} ·{" "}
            {isExample
              ? "조작 예제"
              : isResult
                ? "3보드 완료"
                : `${a.round + 1} / 3보드`}
          </span>
        </div>
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        <p className="experiment-subtitle">
          {config.goal} · 일반 모드는 시간 제한이 없어요.
        </p>
        {a.phase === "intro" ? (
          <div className="search-intro">
            <div className="search-preview" aria-hidden="true">
              {[0, 1, 2].map((shape) => (
                <SearchGlyph key={shape} shape={shape} mark={shape % 2} />
              ))}
            </div>
            <p>
              보드마다 안내하는 조건에 맞는 대상을 모두 선택한 뒤 확정하세요.
              확정 전에는 선택을 취소하거나 바꿀 수 있어요.
            </p>
            <p>
              3개 보드의 평균이 <strong>8,000점 이상</strong>이면 통과해요.
              오선택은 맞게 선택한 수에서 차감하며, 모든 칸을 고르면 유리하지
              않아요.
            </p>
            <p className="small muted">
              한 보드를 확정하면 점수와 놓친 칸·오선택을 확인하고 다음
              탐색판으로 넘어갑니다. 다음 보드의 목표 조건도 새로 확인하세요.
            </p>
            <div className="play-controls">
              <button
                className="button primary"
                onClick={() => dispatch({ type: "tutorial" })}
              >
                탐색 예제로 익히기 <ArrowRight size={18} />
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
              확정한 보드·점수·도움 이력은 남아 있어요. 탐색 중인 보드는 선택을
              지우고 다른 탐색판으로 이어갑니다. 중단 이력이 표시돼요.
            </p>
            <button className="button primary" onClick={resume}>
              새 탐색판으로 이어가기 <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          <>
            {isResult && (
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
                    <strong>{result.correct} / 3보드</strong>빠짐·오선택 없이
                    선택
                  </span>
                  <span>
                    <strong>
                      놓침 {a.answers.reduce((n, b) => n + b.fn, 0)} · 오선택{" "}
                      {a.answers.reduce((n, b) => n + b.fp, 0)}
                    </strong>
                    세 보드 합계
                  </span>
                  <span>
                    <strong>
                      {result.passed
                        ? "스테이지 기준 통과"
                        : "다시 연습해 봐요"}
                    </strong>
                    {result.independent
                      ? "도움 없이 통과"
                      : a.assisted
                        ? "도움과 함께"
                        : a.interrupted
                          ? "중단 후 이어 함"
                          : "평균 8,000점부터 통과"}
                  </span>
                </div>
                <div className="result-actions">
                  {result.passed && mode === "stage" && stage < 30 ? (
                    <Link
                      className="button primary"
                      aria-disabled={saved !== a.revision}
                      href={
                        saved === a.revision
                          ? `/games/search/play?stage=${stage + 1}`
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
                      새 탐색판으로 재도전 <RotateCcw size={18} />
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
                      ? "3보드 평균 8,000점 이상으로 통과했어요."
                      : "3보드 평균 8,000점 이상이면 다음 단계가 열려요."}
                </p>
              </div>
            )}
            {isResult && (
              <div
                className="filters search-review-tabs"
                role="group"
                aria-label="결과 보드 선택"
              >
                {a.answers.map((board, i) => (
                  <button
                    className={reviewRound === i ? "filter active" : "filter"}
                    aria-pressed={reviewRound === i}
                    key={i}
                    onClick={() => setReviewRound(i)}
                  >
                    보드 {i + 1} · {board.score.toLocaleString()}점
                  </button>
                ))}
              </div>
            )}
            <div className="search-workspace">
              <div className="search-map-panel">
                <Goal question={q} />
                <SearchBoard
                  question={q}
                  selected={selected}
                  disabled={leaving || !editing}
                  feedback={feedback}
                  hintRow={hintRow}
                  onToggle={(cell) => dispatch({ type: "toggle", cell })}
                />
                {editing && (
                  <>
                    <p className="search-selection-status" role="status">
                      선택 {selected.length}개 · 테두리와 체크는 선택 표시이며
                      정답 표시가 아니에요.
                    </p>
                    <p className="small muted">
                      방향키로 칸 이동 · Enter/Space로 선택 · 다시 누르면 선택
                      해제
                    </p>
                    <div className="play-controls">
                      <button
                        className="button primary"
                        disabled={leaving}
                        onClick={() => dispatch({ type: "confirm" })}
                      >
                        {isExample
                          ? "예제 조건 확인"
                          : `선택 확정 (${selected.length}개)`}{" "}
                        <Check size={18} />
                      </button>
                      <button
                        className="button secondary"
                        disabled={leaving || selected.length === 0}
                        onClick={() => dispatch({ type: "clear" })}
                      >
                        선택 모두 해제
                      </button>
                    </div>
                  </>
                )}
                {isExample && (
                  <>
                    <p role="status">
                      {a.tutorialPassed
                        ? "예제의 목표를 모두 찾았어요. 실제 도전은 다른 탐색판이에요."
                        : a.exampleChecked
                          ? "놓친 칸과 오선택을 살펴보고 예제를 고쳐 보세요."
                          : "예제의 확인은 실제 도전의 도움 사용으로 기록되지 않아요."}
                    </p>
                    <button
                      className="button primary"
                      disabled={!a.tutorialPassed || leaving}
                      onClick={() => dispatch({ type: "start" })}
                    >
                      예제 완료 · 탐색 시작 <ArrowRight size={18} />
                    </button>
                  </>
                )}
                {a.phase === "feedback" && (
                  <div className="play-controls">
                    <button
                      className="button primary"
                      disabled={leaving}
                      onClick={() => dispatch({ type: "next" })}
                    >
                      {a.round === 2 ? "결과 확인" : "다음 보드"}{" "}
                      <ArrowRight size={18} />
                    </button>
                  </div>
                )}
                <p className="sidebar-foot">
                  <ShieldCheck size={16} />
                  색에 더해 모양과 점·줄의 개수로 구분해요.
                </p>
              </div>
              <aside className="search-learning-panel">
                {feedback && (
                  <BoardFeedback
                    question={q}
                    selected={selected}
                    zero={!isExample && (answer?.skipped || answer?.revealed)}
                  />
                )}
                <div className="search-strategy">
                  <span className="eyebrow">탐색하는 방법</span>
                  <h2>한 칸씩, 같은 순서로</h2>
                  <p>
                    목표 조건을 먼저 확인하고 왼쪽에서 오른쪽으로, 한 줄씩
                    살펴보세요. 두 조건이면 하나씩 따로 대조해 보세요.
                  </p>
                  <p>
                    선택한 칸과 아직 고르지 않은 칸을 다시 보면 놓침과 오선택을
                    줄이는 데 도움이 돼요.
                  </p>
                </div>
                {!isExample && !isResult && (
                  <div className="hint-box">
                    <Lightbulb size={20} />
                    <h3>살펴볼 구간을 나눠볼까요?</h3>
                    <p>
                      {a.hintLevel === 0
                        ? "전략과 탐색 구간 힌트를 선택할 수 있어요."
                        : a.hintLevel === 1
                          ? "위에서 아래로 한 줄씩 살펴보세요. 두 조건을 한 번에 넘기지 말고 모양과 표식을 따로 확인하세요."
                          : hintRow !== undefined
                            ? `${hintRow + 1}행에 목표가 있어요. 강조한 줄 전체가 정답이라는 뜻은 아니에요. 각 칸을 목표 조건과 대조하세요.`
                            : "구간 힌트를 사용했어요."}
                    </p>
                    <button
                      className="text-link"
                      disabled={
                        a.phase !== "question" || a.hintLevel === 2 || leaving
                      }
                      onClick={() => dispatch({ type: "hint" })}
                    >
                      {a.hintLevel === 0
                        ? "전략 힌트 보기"
                        : a.hintLevel === 1
                          ? "탐색 구간 힌트 보기"
                          : "탐색 구간을 확인했어요"}
                    </button>
                    {a.assisted && (
                      <small>이 도전에 도움 사용이 기록됩니다.</small>
                    )}
                  </div>
                )}
              </aside>
            </div>
            {a.phase === "question" && (
              <div className="search-end-options">
                <details>
                  <summary>풀이 열람 안내</summary>
                  <p>
                    이번 보드의 정답을 확인하고 0점으로 확정합니다. 이후 다음
                    보드를 계속할 수 있어요.
                  </p>
                  <button
                    className="button secondary"
                    disabled={leaving}
                    onClick={() => dispatch({ type: "reveal" })}
                  >
                    이번 보드 풀이 확인
                  </button>
                </details>
                <button
                  className="text-link"
                  disabled={leaving}
                  onClick={() => dispatch({ type: "skip" })}
                >
                  이번 보드 건너뛰기
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
