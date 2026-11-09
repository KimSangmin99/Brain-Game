"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  Check,
  X,
  Eye,
  Undo2,
  Lightbulb,
  Pause,
  Trophy,
  ShieldCheck,
} from "lucide-react";
import { useMemorySession } from "./use-memory-session";
import { sequenceEngine } from "@/lib/memory-engines";
import {
  sequenceConfig,
  SYMBOLS,
  sameSequence,
  newSequence,
  visibleSymbol,
} from "@/lib/sequence";
import { outcome } from "@/lib/memory-common";

export function SequencePlayer({
  stage,
  mode,
}: {
  stage: number;
  mode: "stage" | "practice";
}) {
  const {
    attempt: a,
    error,
    locked,
    busyTab,
    saved,
    saveError,
    dispatch,
    retrySave,
    restart,
  } = useMemorySession(sequenceEngine, stage, mode);
  const [now, setNow] = useState(0);
  const [hint, setHint] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const c = sequenceConfig(stage);
  useEffect(() => {
    if (a?.phase !== "show" || a.revealEndsAt === null) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 30);
    const end = setTimeout(
      () => dispatch({ type: "hide" }),
      Math.max(0, a.revealEndsAt - Date.now()),
    );
    return () => {
      clearInterval(tick);
      clearTimeout(end);
    };
  }, [a?.phase, a?.revealEndsAt]);
  useEffect(() => {
    setHint(false);
    title.current?.focus({ preventScroll: true });
  }, [a?.phase]);
  useEffect(() => {
    if (!a || !["recall", "tutorial"].includes(a.phase)) return;
    const input = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target instanceof HTMLElement &&
          (event.target.matches("input,textarea,select") ||
            event.target.isContentEditable))
      )
        return;
      if (/^[1-6]$/.test(event.key) && Number(event.key) <= c.choices) {
        event.preventDefault();
        dispatch({ type: "append", symbol: Number(event.key) - 1 });
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        dispatch({ type: "undo" });
      }
    };
    window.addEventListener("keydown", input);
    return () => window.removeEventListener("keydown", input);
  }, [a?.phase, c.choices]);
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
              ? "진행 중인 탭을 닫은 뒤 새로고침해 주세요."
              : "이 게임의 이전 스테이지를 먼저 완료해 주세요.")}
        </p>
        <Link className="button secondary" href="/games/sequence">
          스테이지 목록으로
        </Link>
      </div>
    );
  if (!a)
    return (
      <p role="status" className="loading">
        순서 실험실을 준비하고 있습니다…
      </p>
    );
  const r = outcome(a);
  const target =
    a.phase === "tutorial"
      ? Array.from({ length: c.length }, (_, i) => i % c.choices)
      : a.targets[a.round];
  const visible = visibleSymbol(a, now);
  const canInput = a.phase === "recall" || a.phase === "tutorial";
  const headings = {
    intro: "순서 속 연결을 발견해 볼까요?",
    tutorial: "예시 순서대로 도형을 입력해 보세요.",
    ready: "준비되면, 도형을 만나보세요.",
    show: "나타나는 순서대로 기억해 주세요.",
    recall: "어떤 순서로 나타났나요?",
    feedback: a.answers[a.round]?.correct
      ? "순서까지 정확히 기억했어요!"
      : "항목과 순서를 함께 확인해 보세요.",
    paused: "잠시 멈췄어요.",
    result: r.passed
      ? "기억의 연결이 완성됐어요."
      : "차근차근, 다시 이어 볼까요?",
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
          SEQUENCE LAB /{" "}
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
        <p role="alert" className="notice error">
          기록을 저장하지 못했습니다. 화면을 유지한 채 다시 시도해 주세요.
          <button onClick={retrySave}>저장 재시도</button>
        </p>
      )}
      {leaving && (
        <div className="exit-panel" role="alert">
          <div>
            <strong>여기서 잠시 쉬어 갈까요?</strong>
            <p>완료한 문항은 보존되고 중단한 순서는 새 문제로 교체합니다.</p>
          </div>
          <button
            className="button secondary"
            onClick={() => setLeaving(false)}
          >
            계속하기
          </button>
          <Link className="button primary" href="/games/sequence">
            나가기
          </Link>
        </div>
      )}
      <div className="player-layout">
        <section className="experiment sequence-experiment">
          <div className="experiment-header">
            <span className="badge mint">시퀀스 기억</span>
            <span className="muted">
              도형 {c.choices}종 · 순서 {c.length}개
            </span>
          </div>
          <h1 ref={title} tabIndex={-1}>
            {headings[a.phase]}
          </h1>
          <p className="experiment-subtitle">
            {a.phase === "show"
              ? "도형을 짧은 묶음으로 나누어 기억해 보세요."
              : canInput
                ? "도형을 선택하거나 숫자 키를 누르세요. 마지막 입력은 지울 수 있어요."
                : a.phase === "paused"
                  ? "새 순서로 이어갑니다. 이 도전에는 중단 이력이 표시돼요."
                  : a.phase === "result"
                    ? `${r.correct} / 5 문항 정답 · 도움과 중단 여부를 함께 기록했어요.`
                    : "도형이 하나씩 나타나요. 사라진 뒤 같은 순서로 입력해 주세요."}
          </p>
          {a.phase === "result" ? (
            <div className="result-panel">
              <span className="result-medal">
                <Trophy size={44} />
              </span>
              <div className="result-score">
                {r.score.toLocaleString()}
                <small>점</small>
              </div>
              <div className="result-facts">
                <span>
                  <strong>{r.correct} / 5</strong>정확히 재현한 순서
                </span>
                <span>
                  <strong>
                    {r.independent
                      ? "독립 해결"
                      : r.passed
                        ? "목표 통과"
                        : "연습 중"}
                  </strong>
                  {a.assisted
                    ? "힌트 사용"
                    : a.interrupted
                      ? "중단 후 이어 함"
                      : "도움 없이 도전"}
                </span>
              </div>
              <div className="result-actions">
                {r.passed && mode === "stage" && stage < 30 ? (
                  <Link
                    className="button primary"
                    aria-disabled={saved !== a.revision}
                    href={
                      saved === a.revision
                        ? `/games/sequence/play?stage=${stage + 1}`
                        : "#"
                    }
                  >
                    다음 스테이지
                    <ArrowRight size={17} />
                  </Link>
                ) : (
                  <button
                    className="button primary"
                    disabled={saved !== a.revision}
                    onClick={restart}
                  >
                    새 순서로 재도전
                  </button>
                )}
                <Link className="button secondary" href="/records">
                  내 기록 보기
                </Link>
              </div>
              <p className="muted small">
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
                    target: newSequence(stage, a.targets),
                  })
                }
              >
                새 순서로 이어가기
                <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <>
              {["intro", "ready", "show"].includes(a.phase) && (
                <div
                  className={`sequence-display ${visible ? "illuminated" : ""}`}
                  role="img"
                  aria-label={
                    visible
                      ? `${SYMBOLS[visible.symbol].name}, ${visible.index + 1}번째 도형`
                      : "도형 표시 영역"
                  }
                  data-sequence-symbol={visible?.symbol}
                  data-sequence-index={visible?.index}
                >
                  <span aria-hidden="true">
                    {visible
                      ? SYMBOLS[visible.symbol].glyph
                      : a.phase === "show"
                        ? "·"
                        : "◇"}
                  </span>
                  <small>
                    {a.phase === "show"
                      ? visible
                        ? `${visible.index + 1} / ${c.length}`
                        : "다음 도형을 기다려 주세요"
                      : "관찰 → 기억 → 순서 재현"}
                  </small>
                </div>
              )}
              {a.phase === "tutorial" && (
                <div className="sequence-feedback">
                  <p>연습 순서</p>
                  <ol className="sequence-answer">
                    {target.map((n, i) => (
                      <li key={i}>
                        <span aria-hidden="true">{SYMBOLS[n].glyph}</span>
                        <small>
                          {i + 1}. {SYMBOLS[n].name}
                        </small>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {canInput && (
                <>
                  <ol className="sequence-answer" aria-label="입력한 순서">
                    {Array.from({ length: c.length }, (_, i) => {
                      const n = a.selected[i];
                      return (
                        <li key={i} className={n !== undefined ? "filled" : ""}>
                          <span aria-hidden="true">
                            {n !== undefined ? SYMBOLS[n].glyph : "·"}
                          </span>
                          <small>
                            {i + 1}.{" "}
                            {n !== undefined ? SYMBOLS[n].name : "빈칸"}
                          </small>
                        </li>
                      );
                    })}
                  </ol>
                  <div
                    className={`sequence-options choices-${c.choices}`}
                    role="group"
                    aria-label="도형 입력"
                  >
                    {SYMBOLS.slice(0, c.choices).map((symbol, i) => (
                      <button
                        key={symbol.name}
                        aria-label={`${symbol.name} 입력 (${i + 1})`}
                        disabled={a.selected.length === c.length}
                        onClick={() => dispatch({ type: "append", symbol: i })}
                      >
                        <span aria-hidden="true">{symbol.glyph}</span>
                        <small>
                          {symbol.name} <kbd>{i + 1}</kbd>
                        </small>
                      </button>
                    ))}
                  </div>
                  <button
                    className="button quiet"
                    disabled={!a.selected.length}
                    onClick={() => dispatch({ type: "undo" })}
                  >
                    <Undo2 size={17} />
                    마지막 입력 지우기
                  </button>
                </>
              )}
              {a.phase === "feedback" && (
                <div className="sequence-feedback">
                  <p>제시된 순서</p>
                  <ol className="sequence-answer">
                    {target.map((n, i) => (
                      <li key={i} className="filled">
                        <span aria-hidden="true">{SYMBOLS[n].glyph}</span>
                        <small>
                          {i + 1}. {SYMBOLS[n].name}
                        </small>
                      </li>
                    ))}
                  </ol>
                  <p>내가 입력한 순서</p>
                  <ol className="sequence-answer">
                    {target.map((n, i) => {
                      const chosen = a.answers[a.round].selected[i];
                      return (
                        <li
                          key={i}
                          className={chosen === n ? "matched" : "mismatched"}
                        >
                          <span aria-hidden="true">
                            {chosen !== undefined ? SYMBOLS[chosen].glyph : "—"}
                          </span>
                          <small>
                            {chosen === n ? (
                              <Check size={13} />
                            ) : (
                              <X size={13} />
                            )}{" "}
                            {chosen !== undefined
                              ? SYMBOLS[chosen].name
                              : "미입력"}
                          </small>
                        </li>
                      );
                    })}
                  </ol>
                  <p className="feedback-note">
                    도형이 같아도 순서가 다르면 다른 답이에요. 앞의 두 도형을 한
                    묶음으로 떠올려 보세요.
                  </p>
                </div>
              )}
              <div className="play-controls">
                {a.phase === "intro" && (
                  <>
                    <button
                      className="button primary"
                      onClick={() => dispatch({ type: "tutorial" })}
                    >
                      조작 연습하기
                      <ArrowRight size={17} />
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
                    disabled={!sameSequence(a.selected, target)}
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
                    순서 보기
                  </button>
                )}
                {a.phase === "recall" && (
                  <>
                    <button
                      className="button primary"
                      disabled={a.selected.length !== c.length}
                      onClick={() => dispatch({ type: "confirm" })}
                    >
                      순서 확정 ({a.selected.length}/{c.length})
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
                  <button
                    className="button primary"
                    onClick={() => dispatch({ type: "next" })}
                  >
                    {a.round === 4 ? "결과 확인" : "다음 문항"}
                    <ArrowRight size={17} />
                  </button>
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
                      : a.round === i
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
          <span className="eyebrow">CONNECT THE MOMENTS</span>
          <h2>{c.goal}</h2>
          <p>각 도형의 이름과 나타난 순서를 함께 기억해 보세요.</p>
          <div className="learning-step">
            <span>01</span>
            <div>
              <strong>짧게 묶기</strong>
              <p>앞의 두 도형과 나머지 도형을 나누어 보세요.</p>
            </div>
          </div>
          <div className="learning-step">
            <span>02</span>
            <div>
              <strong>순서대로 되짚기</strong>
              <p>머릿속에서 처음부터 끝까지 한 번 다시 이어 보세요.</p>
            </div>
          </div>
          <div className="hint-box">
            <Lightbulb size={20} />
            <h3>순서가 헷갈린다면</h3>
            <p>
              {hint
                ? "첫 번째와 마지막 도형을 떠올린 다음, 그 사이에 있던 도형을 연결해 보세요."
                : "전략 힌트로 기억의 기준점을 찾아보세요."}
            </p>
            <button
              className="text-link"
              disabled={a.phase !== "recall"}
              onClick={() => {
                dispatch({ type: "hint" });
                setHint(true);
              }}
            >
              전략 힌트 보기
            </button>
            {hint && <small>이 도전에 힌트 사용이 기록됩니다.</small>}
          </div>
          <p className="sidebar-foot">
            <ShieldCheck size={15} />
            시퀀스의 진행도는
            <br />
            다른 게임과 독립적이에요.
          </p>
        </aside>
      </div>
    </div>
  );
}
