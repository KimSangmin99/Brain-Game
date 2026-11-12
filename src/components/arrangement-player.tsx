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
import { arrangementEngine } from "@/lib/memory-engines";
import { useMemorySession } from "./use-memory-session";
import {
  arrangementOutcome,
  type ArrangementAttempt,
  type ArrangementAction,
} from "@/lib/arrangement";
import {
  ARRANGEMENT_ITEMS,
  arrangementConfig,
  arrangementExample,
  arrangementExplanation,
  arrangementSolutions,
  clueReason,
  clueText,
  evaluateArrangement,
  validArrangement,
  type ArrangementQuestion,
} from "@/lib/arrangement-content";
const dragType = "application/x-brain-arrangement";
function Item({ item }: { item: number }) {
  const data = ARRANGEMENT_ITEMS[item];
  return (
    <>
      <span className={`arrangement-avatar avatar-${item}`} aria-hidden="true">
        {data.glyph}
      </span>
      <span>{data.name}</span>
    </>
  );
}
function ArrangementBoard({
  draft,
  selected,
  disabled,
  dispatch,
}: {
  draft: (number | null)[];
  selected: number | null;
  disabled: boolean;
  dispatch: (a: ArrangementAction) => void;
}) {
  const board = useRef<HTMLDivElement>(null),
    items = ARRANGEMENT_ITEMS.slice(0, draft.length);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (disabled || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "input,textarea,select,[contenteditable=true],dialog,[role=dialog]",
        )
      )
        return;
      if (/^[1-6]$/.test(e.key) && Number(e.key) <= draft.length) {
        e.preventDefault();
        dispatch({ type: "select", item: Number(e.key) - 1 });
      } else if (
        board.current?.contains(target) &&
        target?.closest(".arrangement-slot")
      ) {
        const slots = [
            ...board.current.querySelectorAll<HTMLButtonElement>(
              ".arrangement-slot",
            ),
          ],
          index = slots.indexOf(
            target.closest(".arrangement-slot") as HTMLButtonElement,
          );
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          slots[
            (index + (e.key === "ArrowRight" ? 1 : slots.length - 1)) %
              slots.length
          ].focus();
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          dispatch({ type: "remove", slot: index });
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [disabled, draft.length, dispatch]);
  const drag = (e: React.DragEvent, item: number) => {
    e.dataTransfer.setData(dragType, String(item));
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <div className="arrangement-board" ref={board}>
      <h2>대상을 골라 자리에 놓아요</h2>
      <p id="arrangement-controls-help" className="small muted">
        대상 → 자리 순서로 누르세요. 놓인 대상을 빈 자리로 옮기거나 두 대상을
        교환할 수 있어요. 마우스 드래그도 가능해요.
      </p>
      <div
        className="arrangement-palette"
        role="group"
        aria-label="배치할 대상"
      >
        {items.map((item, i) => (
          <button
            type="button"
            key={i}
            aria-label={`${item.name} 선택 (${i + 1})`}
            aria-pressed={selected === i}
            className={selected === i ? "selected" : ""}
            disabled={disabled}
            draggable={!disabled}
            onDragStart={(e) => drag(e, i)}
            onClick={() => dispatch({ type: "select", item: i })}
            data-item={i}
          >
            <Item item={i} />
            <small>
              {draft.includes(i) ? "배치됨" : "대기 중"} · {i + 1}
            </small>
          </button>
        ))}
      </div>
      <p className="arrangement-selection" role="status">
        {selected === null
          ? "대상을 고른 뒤 원하는 자리를 눌러 주세요."
          : `${ARRANGEMENT_ITEMS[selected].name} 선택됨 · 옮길 자리를 눌러 주세요.`}
      </p>
      <div className="arrangement-slot-heading">
        <strong>왼쪽</strong>
        <ArrowRight size={20} />
        <strong>오른쪽</strong>
      </div>
      <div
        className="arrangement-slots"
        role="group"
        aria-label="왼쪽에서 오른쪽 순서의 자리"
        style={{
          gridTemplateColumns: `repeat(${draft.length},minmax(44px,1fr))`,
        }}
      >
        {draft.map((item, slot) => (
          <button
            type="button"
            key={slot}
            className={`arrangement-slot ${item === null ? "empty" : ""}`}
            data-slot={slot}
            data-item={item ?? ""}
            aria-label={`${slot + 1}번 자리, ${item === null ? "빈자리" : ARRANGEMENT_ITEMS[item].name}`}
            aria-describedby="arrangement-controls-help"
            disabled={disabled}
            draggable={!disabled && item !== null}
            onDragStart={(e) => {
              if (item !== null) drag(e, item);
            }}
            onDragOver={(e) => {
              if (!disabled && e.dataTransfer.types.includes(dragType)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (disabled) return;
              const raw = e.dataTransfer.getData(dragType);
              if (/^[0-5]$/.test(raw))
                dispatch({ type: "move", item: Number(raw), slot });
            }}
            onClick={() => {
              if (selected !== null) dispatch({ type: "place", slot });
              else if (item !== null) dispatch({ type: "select", item });
            }}
          >
            <small>{slot + 1}번</small>
            {item === null ? (
              <span className="arrangement-empty-mark" aria-hidden="true">
                ＋
              </span>
            ) : (
              <Item item={item} />
            )}
          </button>
        ))}
      </div>
      <p className="small muted">
        숫자 1~{draft.length}로 대상 선택 · 자리에서 Enter로 배치 · ← →로 자리
        이동 · Delete로 비우기
      </p>
    </div>
  );
}
function Clues({
  question,
  layout,
  highlight = false,
}: {
  question: ArrangementQuestion;
  layout?: number[];
  highlight?: boolean;
}) {
  const grade = layout ? evaluateArrangement(question, layout) : null;
  return (
    <div className="arrangement-clues">
      <h2>
        함께 만족할 조건 <span>{question.clues.length}개</span>
      </h2>
      <p className="small muted">
        ‘왼쪽’은 번호가 더 작은 자리, ‘바로 왼쪽’은 붙어 있는 한 자리 차이예요.
      </p>
      <ol>
        {question.clues.map((clue, i) => (
          <li
            className={`${grade ? (grade.satisfied[i] ? "satisfied" : "violated") : ""} ${highlight && i === 0 ? "highlighted" : ""}`}
            key={i}
            data-kind={clue.kind}
            data-a={clue.a}
            data-b={"b" in clue ? clue.b : undefined}
            data-slot={"slot" in clue ? clue.slot : undefined}
          >
            <span className="arrangement-clue-number">{i + 1}</span>
            <div>
              <strong>{clueText(clue)}</strong>
              {highlight && i === 0 && (
                <span className="badge blue">힌트 조건</span>
              )}
              {grade && (
                <>
                  <span className="arrangement-condition-status">
                    {grade.satisfied[i] ? <Check size={16} /> : <X size={16} />}{" "}
                    {grade.satisfied[i] ? "조건 만족" : "다시 확인"}
                  </span>
                  <p>{clueReason(clue, layout!)}</p>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
export function ArrangementPlayer({
  stage,
  mode,
}: {
  stage: number;
  mode: ArrangementAttempt["mode"];
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
  } = useMemorySession(arrangementEngine, stage, mode);
  const [leaving, setLeaving] = useState(false),
    heading = useRef<HTMLHeadingElement>(null);
  const config = arrangementConfig(stage);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
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
        <Link className="button secondary" href="/games/arrangement">
          스테이지 목록으로
        </Link>
      </div>
    );
  if (!attempt)
    return (
      <p className="loading" role="status">
        배열 문제를 준비하고 있어요…
      </p>
    );
  const a = attempt,
    isExample = a.phase === "tutorial",
    q = isExample ? arrangementExample(stage) : a.question,
    draft = isExample ? a.exampleDraft : a.draft,
    result = arrangementOutcome(a),
    complete = validArrangement(draft, config.size),
    solution = a.phase === "result" ? arrangementSolutions(q)[0] : null;
  const feedback = a.phase === "feedback",
    showGrade = feedback || (a.phase === "result" && a.lastSubmission !== null);
  const title =
    a.phase === "intro"
      ? "조건을 연결해 자리를 찾아볼까요?"
      : isExample
        ? "배치하고, 조건을 확인해 봐요."
        : a.phase === "paused"
          ? "잠시 멈췄어요."
          : a.phase === "result"
            ? result.passed
              ? "모든 조건을 만족했어요!"
              : a.revealed
                ? "풀이로 조건을 연결해 봐요."
                : "새 문제로 다시 도전해 봐요."
            : feedback
              ? "다시 확인할 조건이 있어요."
              : "모두에게 맞는 자리를 찾아주세요.";
  return (
    <div className="player-wrap arrangement-player">
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
          조건 배열 / {mode === "practice" ? "자유 연습" : `스테이지 ${stage}`}
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
            <p>같은 조건과 작성 중 배치를 이어갈 수 있어요.</p>
          </div>
          <button
            className="button secondary"
            onClick={() => setLeaving(false)}
          >
            계속하기
          </button>
          <Link className="button primary" href="/games/arrangement">
            나가기
          </Link>
        </div>
      )}
      <section className="experiment arrangement-experiment">
        <div className="experiment-header">
          <span className="badge blue">조건 배열</span>
          <span className="muted">
            {config.size}명 · {config.label}
          </span>
        </div>
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        <p className="experiment-subtitle">
          {config.goal} · 응답 시간 제한은 없어요.
        </p>
        {a.phase === "intro" ? (
          <div className="arrangement-intro">
            <div className="arrangement-preview" aria-hidden="true">
              {ARRANGEMENT_ITEMS.slice(0, config.size).map((item, i) => (
                <span key={i}>
                  {item.glyph}
                  <small>{i + 1}번</small>
                </span>
              ))}
            </div>
            <p>
              모든 대상을 한 번씩 배치하고, 모든 조건을 만족하면 통과해요. 확정
              전에는 자유롭게 옮길 수 있어요.
            </p>
            <p className="small muted">
              틀린 제출은 어떤 조건을 다시 볼지 알려드려요. 수정 후 해결해도
              10,000점이며 도움 사용이 기록됩니다.
            </p>
            <div className="play-controls">
              <button
                className="button primary"
                onClick={() => dispatch({ type: "tutorial" })}
              >
                배치 예제로 익히기 <ArrowRight size={18} />
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
              같은 문제·작성 중 배치·조건 확인·도움 이력을 그대로 이어갑니다. 이
              도전에 중단 이력이 표시돼요.
            </p>
            <button
              className="button primary"
              onClick={() => dispatch({ type: "resume" })}
            >
              이 배치로 이어가기 <ArrowRight size={18} />
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
                  <strong>{a.checks}회</strong>조건 확인
                </span>
                <span>
                  <strong>
                    {result.passed
                      ? "배열 성공"
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
                        ? `/games/arrangement/play?stage=${stage + 1}`
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
                    새 문제로 재도전 <RotateCcw size={18} />
                  </button>
                )}
                <Link href="/records" className="button secondary">
                  내 기록 보기
                </Link>
              </div>
              <p className="small muted">
                {mode === "practice"
                  ? "자유 연습은 단계 개방에 반영되지 않아요."
                  : result.passed
                    ? "완료한 단계는 그대로 남아요."
                    : "풀이 열람과 건너뛰기는 0점이며 다음 단계를 열지 않아요."}
              </p>
            </div>
            <div className="arrangement-review">
              <h2>조건을 연결하는 한 가지 방법</h2>
              {solution && (
                <>
                  <div
                    className="arrangement-solution"
                    role="img"
                    aria-label={`배열 정답: ${solution.map((n) => ARRANGEMENT_ITEMS[n].name).join("、")}`}
                  >
                    {solution.map((item, i) => (
                      <span key={i}>
                        <small>{i + 1}번</small>
                        <Item item={item} />
                      </span>
                    ))}
                  </div>
                  <p>
                    아래는 조건을 하나씩 합쳐 가능한 배치를 제외하는 풀이예요.
                    다른 순서로 생각해도 모든 조건을 만족하면 정답입니다.
                  </p>
                  <ol>
                    {arrangementExplanation(q).steps.map((s) => (
                      <li key={s.index}>{s.text}</li>
                    ))}
                  </ol>
                </>
              )}
              {solution && (
                <>
                  <h3>
                    {a.lastSubmission
                      ? "마지막 제출의 조건 확인"
                      : "풀이 배치의 조건 확인"}
                  </h3>
                  <Clues question={q} layout={a.lastSubmission ?? solution} />
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {feedback && (
              <p className="notice" role="status">
                {
                  evaluateArrangement(q, a.lastSubmission!).satisfied.filter(
                    (v) => !v,
                  ).length
                }
                개 조건을 다시 확인해 주세요. 아래 설명을 보고 배치를 수정할 수
                있어요. 이 도전은 도움 사용으로 기록됩니다.
              </p>
            )}
            <div className="arrangement-workspace">
              <div>
                <Clues
                  question={q}
                  layout={
                    showGrade
                      ? (a.lastSubmission ?? undefined)
                      : isExample && a.exampleChecked && complete
                        ? (draft as number[])
                        : undefined
                  }
                  highlight={!isExample && a.hintLevel === 2}
                />
                {!isExample && (
                  <div className="hint-box">
                    <Lightbulb size={20} />
                    <h3>조건을 함께 살펴볼까요?</h3>
                    <p>
                      {a.hintLevel === 0
                        ? "전략부터 확인하고 필요하면 첫 조건을 자세히 살펴보세요."
                        : a.hintLevel === 1
                          ? "위치가 정해진 대상부터 놓거나, 앞뒤 순서를 이어 보세요. 바로 이웃은 번호 차이가 1인지 확인해요."
                          : `강조한 조건: ${clueText(q.clues[0])} ${"slot" in q.clues[0] ? (q.clues[0].kind === "at" ? "그 번호의 자리부터 채워 보세요." : "그 번호를 제외한 자리에서 다른 조건을 이어 보세요.") : q.clues[0].kind === "before" ? "중간에 다른 대상이 있어도 괜찮아요." : "두 대상을 한 묶음으로 보고 위치를 생각해 보세요."}`}
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
                          ? "조건 힌트 더 보기"
                          : "조건 힌트를 확인했어요"}
                    </button>
                    {a.assisted && (
                      <small>이 도전에 도움 사용이 기록됩니다.</small>
                    )}
                  </div>
                )}
              </div>
              <div className="arrangement-board-panel">
                <ArrangementBoard
                  draft={draft}
                  selected={a.selected}
                  disabled={leaving || feedback}
                  dispatch={dispatch}
                />
                <div className="play-controls">
                  {feedback ? (
                    <button
                      className="button primary"
                      disabled={leaving}
                      onClick={() => dispatch({ type: "retry" })}
                    >
                      배치 수정하기 <RotateCcw size={18} />
                    </button>
                  ) : (
                    <>
                      <button
                        className="button primary"
                        disabled={!complete || leaving}
                        onClick={() => dispatch({ type: "confirm" })}
                      >
                        {isExample ? "예제 조건 확인" : "배치 확정"}{" "}
                        <Check size={18} />
                      </button>
                      <button
                        className="button secondary"
                        disabled={leaving}
                        onClick={() => dispatch({ type: "clear" })}
                      >
                        모두 비우기
                      </button>
                    </>
                  )}
                </div>
                {isExample && (
                  <>
                    <p role="status">
                      {a.tutorialPassed
                        ? "모든 예제 조건을 만족했어요. 실제 도전은 다른 문제예요."
                        : a.exampleChecked
                          ? "다시 확인할 예제 조건을 살펴보고 옮겨 보세요."
                          : "예제를 풀어도 실제 도전의 도움 사용으로 기록되지 않아요."}
                    </p>
                    <button
                      className="button primary"
                      disabled={!a.tutorialPassed || leaving}
                      onClick={() => dispatch({ type: "start" })}
                    >
                      예제 완료 · 배열 시작 <ArrowRight size={18} />
                    </button>
                  </>
                )}
                <p className="sidebar-foot">
                  <ShieldCheck size={16} />
                  확정하기 전에는 정오를 표시하지 않아요. 옮기거나 비우는 횟수는
                  점수에 영향을 주지 않아요.
                </p>
              </div>
            </div>
            {!isExample && (
              <div className="arrangement-end-options">
                <details>
                  <summary>풀이 열람 안내</summary>
                  <p>
                    정답 배치를 확인하고 이번 도전을 0점으로 끝냅니다. 다음
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
                  이번 배열 건너뛰기
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
