"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Eye,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Trophy,
  X,
  Pause,
  ShieldCheck,
} from "lucide-react";
import {
  configFor,
  newPattern,
  outcome,
  sameCells,
  type Attempt,
} from "@/lib/pattern";
import { useMemorySession } from "./use-memory-session";
import { patternEngine } from "@/lib/memory-engines";

export function PatternPlayer({
  stage,
  mode,
}: {
  stage: number;
  mode: Attempt["mode"];
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
  } = useMemorySession(patternEngine, stage, mode);
  const [hint, setHint] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const config = configFor(stage);
  useEffect(() => {
    if (attempt?.phase !== "show" || attempt.revealEndsAt === null) return;
    const timer = setTimeout(
      () => dispatch({ type: "hide" }),
      Math.max(0, attempt.revealEndsAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [attempt?.phase, attempt?.revealEndsAt]);
  useEffect(() => {
    setHint(false);
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
              ? "진행 중인 게임을 마치거나 탭을 닫은 뒤 새로고침해 주세요."
              : "이전 스테이지를 먼저 완료해 주세요.")}
        </p>
        <Link className="button secondary" href="/games/pattern">
          스테이지 목록으로
        </Link>
      </div>
    );
  if (!attempt)
    return (
      <p className="loading" role="status">
        실험실을 준비하고 있습니다…
      </p>
    );
  const a = attempt;
  const result = outcome(a);
  const target =
    a.phase === "tutorial"
      ? Array.from({ length: config.count }, (_, i) => i)
      : a.targets[a.round];
  const showTarget = ["show", "feedback", "tutorial"].includes(a.phase);
  const canSelect = ["recall", "tutorial"].includes(a.phase);
  const lastAnswer = a.answers[a.round];
  const newSession = () => {
    restart();
  };
  const titles: Record<Attempt["phase"], string> = {
    intro: "작은 빛들을 기억해 볼까요?",
    tutorial: "빛나는 칸을 직접 선택해 보세요.",
    ready: "준비되면, 빛을 켜 주세요.",
    show: `빛나는 ${config.count}개의 위치를 기억하세요.`,
    recall: "어디에 빛이 있었나요?",
    feedback: lastAnswer?.correct
      ? "정확하게 기억했어요!"
      : "위치의 관계를 다시 살펴보세요.",
    paused: "잠시 멈췄어요.",
    result: result.passed ? "한 걸음 더 나아갔어요." : "한 번 더, 나의 속도로.",
  };
  return (
    <div className="player-wrap">
      <div className="player-top">
        <button
          className="back-link"
          onClick={() => {
            dispatch({ type: "pause" });
            setLeaving(true);
          }}
        >
          <ChevronLeft size={17} />
          실험실 나가기
        </button>
        <span className="eyebrow">
          MEMORY LAB /{" "}
          {mode === "practice"
            ? "자유 연습"
            : `STAGE ${String(stage).padStart(2, "0")}`}
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
          기록을 저장하지 못했습니다. 이 화면을 유지한 채 다시 시도해 주세요.
          <button onClick={retrySave}>저장 재시도</button>
        </p>
      )}
      {leaving && (
        <div className="exit-panel" role="alert">
          <div>
            <strong>여기서 잠시 쉬어 갈까요?</strong>
            <p>
              완료한 문항은 보존됩니다. 중단한 문항은 새 패턴으로 이어갑니다.
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => setLeaving(false)}
          >
            계속하기
          </button>
          <Link className="button primary" href="/games/pattern">
            나가기
          </Link>
        </div>
      )}
      <div className="player-layout">
        <section className="experiment">
          <div className="experiment-header">
            <span className="badge mint">패턴 복원</span>
            <span className="muted">
              {config.size} × {config.size} · {config.count}개 위치
            </span>
          </div>
          <h1 ref={heading} tabIndex={-1}>
            {titles[a.phase]}
          </h1>
          <p className="experiment-subtitle">
            {a.phase === "intro"
              ? `${config.seconds}초 동안 빛을 보고, 사라진 뒤 같은 칸을 선택해 주세요.`
              : a.phase === "show"
                ? "모양이나 가까운 칸끼리 묶어 보세요."
                : a.phase === "recall"
                  ? `시간 제한은 없어요. ${config.count}개를 선택한 뒤 확정해 주세요.`
                  : a.phase === "feedback"
                    ? "✓는 정답 위치, ×는 잘못 선택한 위치입니다."
                    : a.phase === "paused"
                      ? "새 패턴으로 이어갑니다. 이 도전에는 중단한 이력이 표시돼요."
                      : a.phase === "result"
                        ? `${result.correct}문항을 정확히 해결했어요. 결과에서 나만의 전략을 찾아보세요.`
                        : "정답보다 중요한 건, 나만의 해결 방법을 찾는 과정이에요."}
          </p>
          {a.phase === "result" ? (
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
                  <strong>{result.correct} / 5</strong>정확히 기억한 문항
                </span>
                <span>
                  <strong>
                    {result.independent
                      ? "독립 해결"
                      : result.passed
                        ? "스테이지 완료"
                        : "연습 중"}
                  </strong>
                  {a.assisted
                    ? "힌트와 함께"
                    : a.interrupted
                      ? "중단 후 이어 함"
                      : "도움 없이 도전"}
                </span>
              </div>
              <div className="result-actions">
                {result.passed && mode === "stage" && stage < 30 ? (
                  <Link
                    aria-disabled={saved !== a.revision}
                    className="button primary"
                    href={
                      saved === a.revision
                        ? `/games/pattern/play?stage=${stage + 1}`
                        : "#"
                    }
                  >
                    다음 스테이지 <ArrowRight size={17} />
                  </Link>
                ) : (
                  <button
                    className="button primary"
                    onClick={newSession}
                    disabled={saved !== a.revision}
                  >
                    새 문제로 재도전 <RotateCcw size={17} />
                  </button>
                )}
                <Link className="button secondary" href="/records">
                  내 기록 보기
                </Link>
              </div>
              <p className="muted small">
                {a.assisted ? "힌트 사용" : "힌트 없음"} ·{" "}
                {a.interrupted ? "중단 이력 있음" : "중단 없음"} ·{" "}
                {mode === "practice"
                  ? "자유 연습은 단계 개방에 반영되지 않아요."
                  : "5문항 중 4개를 맞히면 다음 단계가 열려요."}
              </p>
            </div>
          ) : a.phase === "paused" ? (
            <div className="paused-panel">
              <Pause size={44} />
              <button
                className="button primary"
                onClick={() =>
                  dispatch({
                    type: "resume",
                    target: newPattern(stage, a.targets),
                  })
                }
              >
                새 패턴으로 이어가기 <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <>
              <div
                className={`memory-grid size-${config.size} phase-${a.phase}`}
                ref={gridRef}
                style={{ gridTemplateColumns: `repeat(${config.size}, 1fr)` }}
                role="group"
                aria-label="기억 패턴 보드"
              >
                {Array.from(
                  { length: config.size * config.size },
                  (_, cell) => {
                    const lit = showTarget && target.includes(cell);
                    const selected = a.selected.includes(cell);
                    const wrong = a.phase === "feedback" && selected && !lit;
                    const label = `${Math.floor(cell / config.size) + 1}행 ${(cell % config.size) + 1}열${lit ? " · 정답 위치" : ""}${wrong ? " · 오선택" : ""}`;
                    return (
                      <button
                        key={cell}
                        className={`memory-cell ${lit ? "lit" : ""} ${selected ? "selected" : ""} ${wrong ? "wrong" : ""}`}
                        aria-label={label}
                        aria-pressed={selected}
                        disabled={!canSelect}
                        onClick={() => dispatch({ type: "toggle", cell })}
                        onKeyDown={(e) => {
                          const delta: Record<string, number> = {
                            ArrowRight: 1,
                            ArrowLeft: -1,
                            ArrowDown: config.size,
                            ArrowUp: -config.size,
                          };
                          if (e.key in delta) {
                            e.preventDefault();
                            const next = cell + delta[e.key];
                            if (next >= 0 && next < config.size * config.size)
                              (
                                gridRef.current?.children[
                                  next
                                ] as HTMLButtonElement
                              )?.focus();
                          }
                        }}
                      >
                        {a.phase === "feedback" ? (
                          wrong ? (
                            <X size={26} />
                          ) : lit ? (
                            <Check size={26} />
                          ) : null
                        ) : lit ? (
                          <span className="cell-light" />
                        ) : selected ? (
                          <Check size={26} />
                        ) : (
                          <span className="cell-dot" />
                        )}
                      </button>
                    );
                  },
                )}
              </div>
              {a.phase === "show" && (
                <div
                  className="countdown-track"
                  role="progressbar"
                  aria-label={`${config.seconds}초 동안 패턴 표시`}
                >
                  <span style={{ animationDuration: `${config.seconds}s` }} />
                </div>
              )}
              <div className="play-controls">
                {a.phase === "intro" && (
                  <>
                    <button
                      className="button primary"
                      onClick={() => dispatch({ type: "tutorial" })}
                    >
                      조작 연습하기 <ArrowRight size={17} />
                    </button>
                    <button
                      className="button quiet"
                      onClick={() => dispatch({ type: "start" })}
                    >
                      바로 도전하기
                    </button>
                  </>
                )}
                {a.phase === "tutorial" && (
                  <button
                    className="button primary"
                    disabled={!sameCells(a.selected, target)}
                    onClick={() => dispatch({ type: "start" })}
                  >
                    연습 완료 · 도전 시작
                    <ArrowRight size={17} />
                  </button>
                )}
                {a.phase === "ready" && (
                  <button
                    className="button primary"
                    onClick={() => dispatch({ type: "show", now: Date.now() })}
                  >
                    <Eye size={18} />
                    패턴 보기
                  </button>
                )}
                {a.phase === "show" && (
                  <span className="watching">
                    <span className="status-dot" />
                    패턴을 살펴보세요
                  </span>
                )}
                {a.phase === "recall" && (
                  <>
                    <button
                      className="button primary"
                      disabled={a.selected.length !== config.count}
                      onClick={() => dispatch({ type: "confirm" })}
                    >
                      선택 확정 ({a.selected.length}/{config.count})
                      <Check size={17} />
                    </button>
                    <button
                      className="button quiet"
                      onClick={() => dispatch({ type: "skip" })}
                    >
                      모르겠어요
                    </button>
                  </>
                )}
                {a.phase === "feedback" && (
                  <>
                    <p className="feedback-note">
                      {lastAnswer?.correct
                        ? "위치의 관계를 잘 기억했어요. 새로운 패턴에도 적용해 보세요."
                        : `${target.map((cell) => `${Math.floor(cell / config.size) + 1}행 ${(cell % config.size) + 1}열`).join(", ")}에 빛이 있었어요. 먼저 기준이 될 칸을 정해 보세요.`}
                    </p>
                    <button
                      className="button primary"
                      onClick={() => dispatch({ type: "next" })}
                    >
                      {a.round === 4 ? "결과 확인" : "다음 문항"}
                      <ArrowRight size={17} />
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          {a.phase !== "result" && (
            <div
              className="round-indicators"
              aria-label={`${a.round + 1}번째 문항, 총 5문항`}
            >
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  className={
                    a.answers[i]
                      ? a.answers[i].correct
                        ? "correct"
                        : "incorrect"
                      : i === a.round
                        ? "now"
                        : ""
                  }
                  key={i}
                >
                  {a.answers[i] ? (
                    a.answers[i].correct ? (
                      <Check size={13} />
                    ) : (
                      <X size={13} />
                    )
                  ) : (
                    i + 1
                  )}
                </span>
              ))}
            </div>
          )}
        </section>
        <aside className="learning-sidebar">
          <span className="eyebrow">TODAY’S DISCOVERY</span>
          <h2>{config.goal}</h2>
          <p>하나하나 외우기보다 위치 사이의 관계를 살펴보세요.</p>
          <div className="learning-step">
            <span>01</span>
            <div>
              <strong>관찰하기</strong>
              <p>빛나는 칸이 어디에 모여 있는지 살펴보세요.</p>
            </div>
          </div>
          <div className="learning-step">
            <span>02</span>
            <div>
              <strong>묶어 기억하기</strong>
              <p>가까운 칸이나 모양을 하나의 묶음으로 기억해 보세요.</p>
            </div>
          </div>
          <div className="learning-step">
            <span>03</span>
            <div>
              <strong>다시 확인하기</strong>
              <p>결과에서 놓친 위치를 살펴보고 새 문제에 적용하세요.</p>
            </div>
          </div>
          <div className="hint-box">
            <Lightbulb size={20} />
            <h3>조금 막막하다면</h3>
            <p>
              {hint
                ? "왼쪽 위 같은 기준점을 하나 정하고, 그 점에서 각 칸이 얼마나 떨어져 있는지 떠올려 보세요."
                : "정답을 바로 보지 않고, 떠올리는 방법부터 바꿔볼 수 있어요."}
            </p>
            <button
              className="text-link"
              disabled={a.phase !== "recall"}
              onClick={() => {
                dispatch({ type: "hint" });
                setHint(true);
              }}
            >
              전략 힌트 보기 <Sparkles size={15} />
            </button>
            {hint && <small>이 도전에 힌트 사용이 기록됩니다.</small>}
          </div>
          <p className="sidebar-foot">
            <ShieldCheck size={15} />
            틀려도 괜찮아요.
            <br />
            완료한 단계는 그대로 남아요.
          </p>
        </aside>
      </div>
    </div>
  );
}
