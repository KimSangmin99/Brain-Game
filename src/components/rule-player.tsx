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
import { useMemorySession } from "./use-memory-session";
import { ruleEngine } from "@/lib/memory-engines";
import { outcome, tutorialQuestion, type RuleAttempt } from "@/lib/rule";
import {
  answerIndex,
  explainRule,
  familyInfo,
  newRuleQuestion,
  optionReason,
  ruleConfig,
  termLabel,
  type RuleQuestion,
} from "@/lib/rule-content";
import { RuleTermView } from "./rule-term";
function Explanation({
  question,
  selected,
}: {
  question: RuleQuestion;
  selected: number | null;
}) {
  const explanation = explainRule(question);
  return (
    <div className="rule-explanation">
      <h2>이렇게 이어져요</h2>
      <p>{explanation.description}</p>
      <ol>
        {explanation.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p>
        <strong>{explanation.conclusion}</strong>
      </p>
      {selected !== null && (
        <p className="rule-choice-reason">{optionReason(question, selected)}</p>
      )}
    </div>
  );
}
export function RulePlayer({
  stage,
  mode,
}: {
  stage: number;
  mode: RuleAttempt["mode"];
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
  } = useMemorySession(ruleEngine, stage, mode);
  const [leaving, setLeaving] = useState(false);
  const title = useRef<HTMLHeadingElement>(null),
    options = useRef<HTMLDivElement>(null);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [attempt?.phase, attempt?.round]);
  useEffect(() => {
    const input = (event: KeyboardEvent) => {
      if (
        leaving ||
        !attempt ||
        !["question", "tutorial"].includes(attempt.phase) ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input,textarea,select,[contenteditable=true]"))
        return;
      if (/^[1-4]$/.test(event.key)) {
        event.preventDefault();
        dispatch({ type: "select", option: Number(event.key) - 1 });
      }
    };
    document.addEventListener("keydown", input);
    return () => document.removeEventListener("keydown", input);
  }, [attempt?.phase, leaving]);
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
              ? "진행 중인 게임을 마치거나 탭을 닫은 뒤 다시 시도해 주세요."
              : "이전 단계를 먼저 완료해 주세요.")}
        </p>
        <Link className="button secondary" href="/games/rule">
          스테이지 목록으로
        </Link>
      </div>
    );
  if (!attempt)
    return (
      <p className="loading" role="status">
        규칙 문제를 준비하고 있어요…
      </p>
    );
  const a = attempt,
    config = ruleConfig(stage),
    tutorial = a.phase === "tutorial",
    q = tutorial ? tutorialQuestion(stage) : a.questions[a.round],
    info = familyInfo(q.family),
    correct = answerIndex(q),
    result = outcome(a),
    last = a.answers[a.round],
    feedback = a.phase === "feedback";
  const selectable = (tutorial || a.phase === "question") && !leaving;
  const heading =
    a.phase === "intro"
      ? "변화 속 규칙을 찾아볼까요?"
      : tutorial
        ? "예제로 규칙을 익혀 보세요."
        : a.phase === "paused"
          ? "잠시 멈췄어요."
          : a.phase === "result"
            ? result.passed
              ? "규칙을 한 걸음 더 이해했어요."
              : "하나씩 살펴보며, 다시 도전해요."
            : feedback
              ? last.correct
                ? "규칙을 정확히 찾았어요!"
                : "놓친 조건을 함께 살펴봐요."
              : "다음에는 어떤 항목이 올까요?";
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
          규칙 분석 / {mode === "practice" ? "자유 연습" : `스테이지 ${stage}`}
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
            <p>완료한 문항은 보존됩니다. 중단한 문항은 새 문제로 이어갑니다.</p>
          </div>
          <button
            className="button secondary"
            onClick={() => setLeaving(false)}
          >
            계속하기
          </button>
          <Link className="button primary" href="/games/rule">
            나가기
          </Link>
        </div>
      )}
      <div className="player-layout rule-layout">
        <section className="experiment rule-experiment" data-phase={a.phase}>
          <div className="experiment-header">
            <span className="badge purple">규칙 분석</span>
            <span className="muted">4지선다 · 5문항</span>
          </div>
          <h1 ref={title} tabIndex={-1}>
            {heading}
          </h1>
          <p className="experiment-subtitle">
            {a.phase === "intro"
              ? "방향·개수·표식을 따로 살펴보고 다음 항목을 골라요. 생각할 시간은 충분해요."
              : a.phase === "paused"
                ? "새 문제로 이어갑니다. 완료한 답안과 도움·중단 이력은 그대로 남아요."
                : a.phase === "result"
                  ? `${result.correct} / 5 문항 정답 · 해설에서 나만의 확인 방법을 돌아보세요.`
                  : tutorial
                    ? "설명을 읽고 예제의 답을 선택해 보세요. 예제는 점수에 포함되지 않아요."
                    : "한 가지 규칙이 모든 항목에 맞는지 확인한 뒤 선택을 확정해 주세요."}
          </p>
          {a.phase === "intro" ? (
            <div className="rule-intro">
              <div className="rule-intro-symbols" aria-hidden="true">
                ↑ <span>→</span> ↓ <span>→</span> ←
              </div>
              <h2>{config.goal}</h2>
              <p>
                {config.label}를 연습합니다. 문제마다 허용되는 변화의 범위를
                알려드려요.
              </p>
              <ul>
                <li>선택은 확정 전까지 바꿀 수 있어요.</li>
                <li>5문항 중 4개를 맞히면 다음 단계가 열려요.</li>
                <li>힌트와 해설을 보며 차근차근 배워도 괜찮아요.</li>
              </ul>
              <div className="play-controls">
                <button
                  className="button primary"
                  onClick={() => dispatch({ type: "tutorial" })}
                >
                  예제로 규칙 익히기 <ArrowRight size={18} />
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
              {config.requiresTutorial && (
                <p className="small muted">
                  새 규칙을 만나는 단계예요. 예제 한 문항을 먼저 풀어봐요.
                </p>
              )}
            </div>
          ) : a.phase === "paused" ? (
            <div className="paused-panel">
              <Pause size={44} />
              <button
                className="button primary"
                onClick={() =>
                  dispatch({
                    type: "resume",
                    question: newRuleQuestion(stage, [
                      tutorialQuestion(stage).id,
                      ...a.questions.map((q) => q.id),
                    ]),
                  })
                }
              >
                새 문제로 이어가기 <ArrowRight size={18} />
              </button>
            </div>
          ) : a.phase === "result" ? (
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
                  <strong>{result.correct} / 5</strong>정확히 찾은 규칙
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
                    className="button primary"
                    aria-disabled={saved !== a.revision}
                    href={
                      saved === a.revision
                        ? `/games/rule/play?stage=${stage + 1}`
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
                  : "5문항 중 4개를 맞히면 다음 단계가 열려요."}
              </p>
              <div className="rule-review">
                <h2>이번 규칙 돌아보기</h2>
                {a.questions.map((question, i) => (
                  <details key={question.id}>
                    <summary>
                      {i + 1}번 · {familyInfo(question.family).name} ·{" "}
                      {a.answers[i].correct
                        ? "정답"
                        : a.answers[i].skipped
                          ? "건너뜀"
                          : "다시 살펴보기"}
                    </summary>
                    <p>
                      내 선택:{" "}
                      {a.answers[i].selected === null
                        ? "선택하지 않음"
                        : termLabel(question.options[a.answers[i].selected!])}
                    </p>
                    <Explanation
                      question={question}
                      selected={a.answers[i].selected}
                    />
                  </details>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="rule-scope" data-family={q.family}>
                <strong>{info.name}</strong>
                <p>{info.scope}</p>
              </div>
              <p className="rule-order-note">
                번호 순서대로 살펴보세요. 빈칸은 {q.shown.length + 1}번째예요.
              </p>
              <div
                className={`rule-sequence terms-${q.shown.length}`}
                role="group"
                aria-label="문제 항목"
              >
                {q.shown.map((term, i) => (
                  <div
                    className={`rule-sequence-item ${a.hintLevel === 2 && q.shown.length === 6 && i % 2 === 0 ? "same-line" : ""}`}
                    key={i}
                  >
                    <small>{i + 1}번째</small>
                    <RuleTermView term={term} />
                  </div>
                ))}
                <div
                  className="rule-blank"
                  aria-label={`${q.shown.length + 1}번째 빈칸`}
                >
                  <small>{q.shown.length + 1}번째</small>
                  <span aria-hidden="true">?</span>
                </div>
              </div>
              {tutorial && (
                <div className="rule-tutorial-note">
                  <strong>예제 해설</strong>
                  <p>{explainRule(q).description}</p>
                  <p>
                    {explainRule(q).conclusion} 아래에서 같은 항목을 골라보세요.
                  </p>
                </div>
              )}
              <div
                className="rule-options"
                role="radiogroup"
                aria-label="다음 항목 선택"
                ref={options}
              >
                {q.options.map((term, i) => (
                  <button
                    type="button"
                    key={i}
                    role="radio"
                    aria-checked={a.selected === i}
                    aria-label={`${i + 1}번: ${termLabel(term)}${feedback && i === correct ? " · 정답" : feedback && a.selected === i ? " · 내 선택 · 오답" : ""}`}
                    tabIndex={selectable && (a.selected ?? 0) === i ? 0 : -1}
                    disabled={!selectable}
                    className={`rule-option ${a.selected === i ? "selected" : ""} ${feedback && i === correct ? "correct" : ""} ${feedback && a.selected === i && i !== correct ? "wrong" : ""}`}
                    onClick={() => dispatch({ type: "select", option: i })}
                    onKeyDown={(event) => {
                      if (
                        [
                          "ArrowRight",
                          "ArrowDown",
                          "ArrowLeft",
                          "ArrowUp",
                        ].includes(event.key) &&
                        selectable
                      ) {
                        event.preventDefault();
                        const next =
                          (i +
                            (["ArrowRight", "ArrowDown"].includes(event.key)
                              ? 1
                              : 3)) %
                          4;
                        dispatch({ type: "select", option: next });
                        (
                          options.current?.children[next] as HTMLButtonElement
                        )?.focus();
                      }
                    }}
                  >
                    <span className="rule-option-number">
                      {i + 1}번 {a.selected === i && <Check size={16} />}
                    </span>
                    <RuleTermView term={term} />
                    {feedback && i === correct && (
                      <strong className="rule-option-state">정답</strong>
                    )}
                    {feedback && a.selected === i && i !== correct && (
                      <strong className="rule-option-state">
                        내 선택 · 오답
                      </strong>
                    )}
                  </button>
                ))}
              </div>
              {feedback && (
                <>
                  <p
                    className="feedback-note rule-feedback-summary"
                    role="status"
                  >
                    {last.skipped
                      ? "이 문항은 건너뛰었어요. 해설에서 규칙을 확인해 보세요."
                      : optionReason(q, last.selected!)}
                  </p>
                  <Explanation question={q} selected={last.selected} />
                </>
              )}
              <div className="play-controls">
                {tutorial ? (
                  <>
                    <p className="rule-tutorial-status" role="status">
                      {a.selected === null
                        ? "설명과 같은 항목을 선택해 주세요."
                        : a.selected === correct
                          ? "맞아요. 이제 새 문제로 도전해 볼까요?"
                          : "방향·개수·표식을 해설과 다시 비교해 보세요."}
                    </p>
                    <button
                      className="button primary"
                      disabled={a.selected !== correct}
                      onClick={() => dispatch({ type: "start" })}
                    >
                      연습 완료 · 도전 시작 <ArrowRight size={18} />
                    </button>
                  </>
                ) : feedback ? (
                  <button
                    className="button primary"
                    onClick={() => dispatch({ type: "next" })}
                  >
                    {a.round === 4 ? "결과 확인" : "다음 문항"}{" "}
                    <ArrowRight size={18} />
                  </button>
                ) : (
                  <>
                    <button
                      className="button primary"
                      disabled={a.selected === null || leaving}
                      onClick={() => dispatch({ type: "confirm" })}
                    >
                      선택 확정 <Check size={18} />
                    </button>
                    <button
                      className="button quiet"
                      disabled={leaving}
                      onClick={() => dispatch({ type: "skip" })}
                    >
                      모르겠어요
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
                  key={i}
                  className={
                    a.answers[i]
                      ? a.answers[i].correct
                        ? "correct"
                        : "incorrect"
                      : i === a.round
                        ? "now"
                        : ""
                  }
                >
                  {a.answers[i] ? (
                    a.answers[i].correct ? (
                      <Check size={14} />
                    ) : (
                      <X size={14} />
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
          <span className="eyebrow">규칙을 찾는 방법</span>
          <h2>{config.goal}</h2>
          <p>
            한 번의 변화만 보고 답을 정하지 말고, 모든 항목에서 같은 규칙이
            이어지는지 확인해 보세요.
          </p>
          <div className="learning-step">
            <span>01</span>
            <div>
              <strong>속성을 나눠요</strong>
              <p>방향·개수·표식 중 바뀌는 것과 그대로인 것을 찾아요.</p>
            </div>
          </div>
          <div className="learning-step">
            <span>02</span>
            <div>
              <strong>다른 사례에도 맞춰요</strong>
              <p>생각한 규칙이 앞의 모든 항목에 맞는지 확인해요.</p>
            </div>
          </div>
          <div className="hint-box">
            <Lightbulb size={20} />
            <h3>어디부터 살펴볼까요?</h3>
            <p>
              {a.hintLevel === 0
                ? "먼저 전략 힌트로 관찰할 기준을 찾아보세요."
                : info.hint}
            </p>
            {a.hintLevel === 2 && (
              <p className="rule-second-hint">
                {q.shown.length === 6
                  ? "1·3·5번째를 먼저 비교하세요. 7번째도 같은 홀수 줄입니다."
                  : "첫 번째와 두 번째 사이의 변화가 세 번째와 네 번째 사이에서도 같은지 확인하세요."}{" "}
                {q.family === "dual-marks" ||
                q.family === "dual-count" ||
                q.family === "combined"
                  ? "두 속성을 각각 예측해야 해요."
                  : ""}
              </p>
            )}
            <button
              className="text-link"
              disabled={a.phase !== "question" || a.hintLevel === 2 || leaving}
              onClick={() => dispatch({ type: "hint" })}
            >
              {a.hintLevel === 0
                ? "전략 힌트 보기"
                : a.hintLevel === 1
                  ? "관찰 힌트 더 보기"
                  : "두 단계 힌트를 확인했어요"}
            </button>
            {a.assisted && <small>이 도전에 힌트 사용이 기록됩니다.</small>}
          </div>
          <p className="sidebar-foot">
            <ShieldCheck size={16} />
            답은 확정 전까지 바꿀 수 있어요. 힌트를 사용해도 완료한 단계는
            남아요.
          </p>
        </aside>
      </div>
    </div>
  );
}
