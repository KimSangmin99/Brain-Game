"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  Lightbulb,
  Pause,
  RotateCcw,
  Trophy,
} from "lucide-react";
import { switchEngine } from "@/lib/memory-engines";
import { useMemorySession } from "./use-memory-session";
import { switchOutcome, switchStats, type SwitchAttempt } from "@/lib/switch";
import {
  SWITCH_NAMES,
  SWITCH_OPTIONS,
  SWITCH_RULES,
  explainSwitch,
  replacementSwitchQuestion,
  switchAnswer,
  switchChanged,
  switchConfig,
  switchExample,
  switchSignalLabel,
  type SwitchQuestion,
} from "@/lib/switch-content";
// A monotonic timestamp in this page. Reload recovery clears every active clock.
const now = () => Math.floor(performance.timeOrigin + performance.now());
export function SwitchSignal({ question: q }: { question: SwitchQuestion }) {
  const s = q.signal;
  return (
    <div
      className="switch-signal"
      role="img"
      aria-label={switchSignalLabel(s)}
      data-question-id={q.id}
      data-shape={s.shape ?? ""}
      data-tone={s.tone ?? ""}
      data-direction={s.direction ?? ""}
    >
      <svg
        viewBox="0 0 180 160"
        aria-hidden="true"
        className={`switch-symbol ${s.tone === 1 ? "dark" : "light"}`}
      >
        {s.shape === 0 ? (
          <circle cx="90" cy="80" r="67" />
        ) : s.shape === 1 ? (
          <path d="M90 10 L167 146 L13 146 Z" />
        ) : (
          <rect
            x="18"
            y="12"
            width="144"
            height="136"
            rx="22"
            strokeDasharray="7 5"
          />
        )}
        {s.direction !== null && (
          <text
            x="90"
            y={s.shape === 1 ? 113 : 105}
            textAnchor="middle"
            className="switch-arrow"
          >
            {s.direction === 0 ? "↑" : "↓"}
          </text>
        )}
        {s.tone === 1 && (
          <path d="M65 126 H115 M65 132 H115" className="switch-tone-mark" />
        )}
      </svg>
      <div className="switch-attributes" aria-hidden="true">
        {SWITCH_RULES.map((k) =>
          s[k] === null ? null : (
            <span key={k}>{SWITCH_OPTIONS[k][s[k]!]}</span>
          ),
        )}
      </div>
    </div>
  );
}
function Rule({ question: q }: { question: SwitchQuestion }) {
  return (
    <div className="switch-rule" data-rule={q.rule}>
      <span className="eyebrow">현재 지시 · CURRENT RULE</span>
      <strong>{SWITCH_NAMES[q.rule]}만 보고 판단해요</strong>
      <span className="switch-rule-options">
        <span>1번 {SWITCH_OPTIONS[q.rule][0]}</span>
        <span>2번 {SWITCH_OPTIONS[q.rule][1]}</span>
      </span>
    </div>
  );
}
const reasonLabel = (a: SwitchAttempt["answers"][number]) =>
  a.reason === "timeout"
    ? "시간 초과"
    : a.reason === "skipped"
      ? "건너뜀"
      : a.reason === "revealed"
        ? "풀이 열람"
        : a.correct
          ? "정답"
          : "다른 응답";
function Feedback({
  question: q,
  answer,
}: {
  question: SwitchQuestion;
  answer: SwitchAttempt["answers"][number];
}) {
  return (
    <div className="switch-feedback" role="status">
      <strong>{reasonLabel(answer)}</strong>
      <p>{switchSignalLabel(q.signal)}</p>
      <p>
        내 응답:{" "}
        {answer.selected === null
          ? "응답 없음"
          : `${answer.selected + 1}번 · ${SWITCH_OPTIONS[q.rule][answer.selected]}`}
      </p>
      <p>{explainSwitch(q)}</p>
      {answer.reason === "timeout" && (
        <p>제한 시간이 끝나 미응답으로 기록했어요. 선택 오답과 구분합니다.</p>
      )}
    </div>
  );
}
export function SwitchPlayer({
  stage,
  mode,
}: {
  stage: number;
  mode: SwitchAttempt["mode"];
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
  } = useMemorySession(switchEngine, stage, mode);
  const [leaving, setLeaving] = useState(false),
    [clock, setClock] = useState(0),
    heading = useRef<HTMLHeadingElement>(null),
    task = useRef<HTMLDivElement>(null);
  const send = useRef(dispatch);
  send.current = dispatch;
  const endsAt = attempt?.endsAt,
    phase = attempt?.phase,
    qid = attempt?.questions[attempt.round].id;
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [phase, attempt?.round]);
  useEffect(() => {
    if (phase && ["cue", "ready", "question"].includes(phase))
      task.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [phase]);
  useEffect(() => {
    if (endsAt == null || !qid || leaving) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const time = now();
      if (time < endsAt) timer = setTimeout(tick, Math.max(1, endsAt - time));
      else send.current({ type: "tick", questionId: qid, now: time });
    };
    timer = setTimeout(tick, Math.max(0, endsAt - now()));
    return () => clearTimeout(timer);
  }, [endsAt, qid, phase, leaving]);
  useEffect(() => {
    if (phase !== "question" || endsAt == null) return;
    setClock(now());
    const timer = setInterval(() => setClock(now()), 100);
    return () => clearInterval(timer);
  }, [phase, endsAt]);
  useEffect(() => {
    if (phase !== "question" || !qid || leaving) return;
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.shiftKey ||
        target?.closest(
          'input,textarea,select,[contenteditable="true"],[role="dialog"]',
        ) ||
        !["1", "2"].includes(e.key)
      )
        return;
      e.preventDefault();
      send.current({
        type: "answer",
        questionId: qid,
        choice: e.key === "1" ? 0 : 1,
        now: now(),
      });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [phase, qid, leaving]);
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
        <Link className="button secondary" href="/games/switch">
          스테이지 목록으로
        </Link>
      </div>
    );
  if (!attempt)
    return (
      <p className="loading" role="status">
        규칙과 문항을 준비하고 있어요…
      </p>
    );
  const a = attempt,
    c = switchConfig(stage),
    tutorial = a.phase === "tutorial",
    result = a.phase === "result",
    q = tutorial ? switchExample(stage) : a.questions[a.round],
    r = switchOutcome(a),
    stats = switchStats(a),
    answer = a.answers[a.round];
  const title =
    a.phase === "intro"
      ? "지시가 바뀌면, 판단 기준도 새롭게"
      : tutorial
        ? "예제에서 지시와 버튼을 연결해요."
        : a.phase === "paused"
          ? "잠시 멈췄어요."
          : result
            ? r.passed
              ? "현재 지시에 맞춰 도전을 마쳤어요!"
              : "지시를 돌아보고 다시 도전해요."
            : a.phase === "feedback"
              ? "이번 지시와 응답을 비교해요."
              : a.phase === "gap"
                ? "다음 문항을 준비해요."
                : a.phase === "cue"
                  ? "현재 지시를 확인해요."
                  : a.phase === "ready"
                    ? "준비되면 문항을 시작하세요."
                    : "현재 지시에 맞는 버튼을 누르세요.";
  const resume = () =>
    dispatch({
      type: "resume",
      now: now(),
      ...(a.pausedFrom === "question"
        ? {
            question: replacementSwitchQuestion(
              stage,
              a.round,
              a.questions[a.round],
            ),
          }
        : {}),
    });
  const timed = (type: "show" | "hint" | "reveal" | "skip") =>
    dispatch({ type, questionId: q.id, now: now() });
  return (
    <div className="player-wrap switch-player">
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
          룰 스위치 / {mode === "practice" ? "자유 연습" : `스테이지 ${stage}`}
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
          기록을 저장하지 못했어요. 화면을 유지하고 다시 시도해 주세요.
          <button onClick={retrySave}>저장 재시도</button>
        </p>
      )}
      {leaving && (
        <div className="exit-panel" role="alert">
          <p>
            확정한 응답은 남아요. 자극을 본 문항은 이어갈 때 새 자극으로 바뀌며
            중단 이력을 표시해요.
          </p>
          <button
            className="button secondary"
            onClick={() => setLeaving(false)}
          >
            계속하기
          </button>
          <Link className="button primary" href="/games/switch">
            나가기
          </Link>
        </div>
      )}
      <section
        className="experiment"
        aria-label="룰 스위치 실험실"
        data-phase={a.phase}
      >
        <div className="experiment-header">
          <span className="badge amber">주의·판단</span>
          <span className="small muted">{a.round + 1} / 20문항</span>
        </div>
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        <p className="experiment-subtitle">
          {c.goal} ·{" "}
          {mode === "practice"
            ? "시간 제한 없는 자유 연습"
            : `자극이 나타난 뒤 문항당 ${c.seconds}초`}
        </p>
        {a.phase === "intro" ? (
          <div className="switch-intro">
            <p>
              화면의 <strong>현재 지시</strong>가 모양·밝기·방향 중 무엇인지
              확인하고 두 버튼 중 하나를 누르세요. 첫 응답이 바로 확정됩니다.
            </p>
            <p>
              20문항 중 <strong>16개 정답</strong>이면 통과해요.{" "}
              {c.rules.length === 1
                ? "이번 단계에서는 한 가지 규칙을 유지해요."
                : `${c.interval}문항마다 규칙이 바뀌어요.`}
            </p>
            <p>
              문항마다 준비 화면에서 쉬어 갈 수 있어요. 0.5초의 빈 간격과 1초의
              전환 안내는 응답 시간에서 제외합니다.{" "}
              {mode === "practice"
                ? "이 연습은 시간 제한 없이 저장되며 단계 개방에는 반영되지 않아요."
                : "시간 조절이 필요하면 스테이지 목록에서 시간 제한 없는 자유 연습을 선택하세요."}
            </p>
            <div className="play-controls">
              <button
                className="button primary"
                onClick={() => dispatch({ type: "tutorial" })}
              >
                지시 예제로 익히기 <ArrowRight size={18} />
              </button>
              {!c.requiresTutorial && (
                <button
                  className="button quiet"
                  onClick={() => dispatch({ type: "start", now: now() })}
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
              {a.pausedFrom === "question"
                ? "확정한 응답은 보존하고, 자극을 본 미확정 문항만 새 자극으로 교체해요. 중단 이력이 표시됩니다."
                : "아직 자극을 보지 않아 같은 문항을 준비 화면부터 이어갑니다. 이 준비 중 멈춤만으로 중단 이력이 추가되지는 않아요."}
            </p>
            <button
              className="button primary"
              disabled={leaving}
              onClick={resume}
            >
              {a.pausedFrom === "question"
                ? "새 자극으로 이어가기"
                : "준비 화면으로 이어가기"}{" "}
              <ArrowRight size={18} />
            </button>
          </div>
        ) : result ? (
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
                <strong>{r.correct} / 20 정답</strong>
                {mode === "practice" ? "시간 제한 없는 연습" : "기본 시간 조건"}
              </span>
              <span>
                <strong>
                  시간 초과 {stats.timeouts} · 선택 오답 {stats.wrong}
                </strong>
                건너뜀 {stats.skipped} · 풀이 열람 {stats.revealed}
              </span>
              <span>
                <strong>
                  {r.passed ? "스테이지 기준 통과" : "다시 연습해 봐요"}
                </strong>
                {r.independent
                  ? "도움 없이 통과"
                  : a.assisted
                    ? "도움과 함께"
                    : a.interrupted
                      ? "중단 후 이어 함"
                      : "16개 정답부터 통과"}
              </span>
            </div>
            <div className="result-actions">
              {r.passed && mode === "stage" && stage < 30 ? (
                <Link
                  className="button primary"
                  aria-disabled={saved !== a.revision}
                  href={
                    saved === a.revision
                      ? `/games/switch/play?stage=${stage + 1}`
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
                  새 문항으로 재도전 <RotateCcw size={18} />
                </button>
              )}
              <Link className="button secondary" href="/records">
                내 기록 보기
              </Link>
            </div>
            <p className="small muted">
              {mode === "practice"
                ? "자유 연습은 단계 개방에 반영되지 않아요."
                : "정답마다 500점이며 8,000점부터 다음 단계가 열려요."}
            </p>
            <div className="switch-statistics">
              <h2>이번 도전을 돌아봐요</h2>
              {stats.byRule.map((row) => (
                <p key={row.rule}>
                  {SWITCH_NAMES[row.rule]} 지시: {row.correct}/{row.total} 정답
                </p>
              ))}
              <p>
                규칙 전환 직후:{" "}
                {stats.changedTotal
                  ? `${stats.changedCorrect}/${stats.changedTotal} 정답`
                  : "이번 단계는 전환 없음"}
              </p>
              <p>
                정답의 평균 응답 시간:{" "}
                {stats.meanCorrectMs === null
                  ? "정답 응답 없음"
                  : `약 ${(stats.meanCorrectMs / 1000).toFixed(2)}초`}
              </p>
              <p className="small muted">
                이 브라우저에서 측정한 학습 참고 값입니다. 지능·인지 능력의
                진단이나 공식 기록으로 사용하지 않아요.
              </p>
            </div>
            <details className="switch-review">
              <summary>20문항의 지시와 응답 다시 보기</summary>
              {a.answers.map((answer, i) => (
                <article key={answer.questionId}>
                  <h3>
                    {i + 1}번 문항 · {reasonLabel(answer)}
                  </h3>
                  <Feedback question={a.questions[i]} answer={answer} />
                </article>
              ))}
            </details>
          </div>
        ) : (
          <div className="switch-workspace">
            <div className="switch-task" ref={task}>
              {a.phase === "gap" ? (
                <div className="switch-blank" role="status">
                  잠깐의 빈 간격 · 0.5초
                </div>
              ) : (
                <Rule question={q} />
              )}
              {a.phase === "cue" ? (
                <div className="switch-blank" role="status">
                  {switchChanged(stage, a.round)
                    ? "지시를 확인하세요 · 1초"
                    : "현재 지시를 다시 확인하세요 · 1초"}
                </div>
              ) : a.phase === "ready" ? (
                <div className="switch-blank">
                  위의 지시와 응답 버튼을 먼저 읽어보세요.
                </div>
              ) : a.phase === "question" ||
                a.phase === "feedback" ||
                tutorial ? (
                <SwitchSignal question={q} />
              ) : null}
              {["ready", "question"].includes(a.phase) && (
                <div className="switch-start-row">
                  <button
                    className="button primary"
                    disabled={a.phase !== "ready" || leaving}
                    onClick={() => timed("show")}
                  >
                    문항 시작
                  </button>
                  <span
                    className="switch-clock"
                    role="timer"
                    aria-label={
                      a.timing === "untimed"
                        ? "시간 제한 없음"
                        : "남은 응답 시간"
                    }
                  >
                    {a.phase === "ready"
                      ? "시작 전 · 무제한"
                      : a.endsAt === null
                        ? "시간 제한 없음"
                        : `${Math.max(0, (a.endsAt - Math.max(clock, a.startedAt!)) / 1000).toFixed(1)}초 남음`}
                  </span>
                </div>
              )}
              {a.phase !== "gap" && (
                <div
                  className="switch-choices"
                  role="group"
                  aria-label="현재 지시의 응답"
                >
                  <button
                    className="button secondary"
                    disabled={leaving || (!tutorial && a.phase !== "question")}
                    onClick={() =>
                      tutorial
                        ? dispatch({ type: "tutorialAnswer", choice: 0 })
                        : dispatch({
                            type: "answer",
                            questionId: q.id,
                            choice: 0,
                            now: now(),
                          })
                    }
                  >
                    <kbd>1</kbd>
                    {SWITCH_OPTIONS[q.rule][0]}
                  </button>
                  <button
                    className="button secondary"
                    disabled={leaving || (!tutorial && a.phase !== "question")}
                    onClick={() =>
                      tutorial
                        ? dispatch({ type: "tutorialAnswer", choice: 1 })
                        : dispatch({
                            type: "answer",
                            questionId: q.id,
                            choice: 1,
                            now: now(),
                          })
                    }
                  >
                    <kbd>2</kbd>
                    {SWITCH_OPTIONS[q.rule][1]}
                  </button>
                </div>
              )}
              {tutorial ? (
                <>
                  <p role="status">
                    {a.tutorialChoice === null
                      ? "시간 제한 없이 예제를 풀어보세요. 예제의 실수는 도움 사용으로 기록되지 않아요."
                      : a.tutorialChoice === switchAnswer(q)
                        ? `맞아요! ${explainSwitch(q)}`
                        : "현재 지시만 보고 다시 골라보세요."}
                  </p>
                  <button
                    className="button primary"
                    disabled={a.tutorialChoice !== switchAnswer(q) || leaving}
                    onClick={() => dispatch({ type: "start", now: now() })}
                  >
                    예제 완료 · 도전 시작 <ArrowRight size={18} />
                  </button>
                </>
              ) : null}
              {a.phase === "feedback" && (
                <>
                  <Feedback question={q} answer={answer} />
                  <button
                    className="button primary"
                    disabled={leaving}
                    onClick={() => dispatch({ type: "next", now: now() })}
                  >
                    {a.round === 19 ? "결과 확인" : "다음 문항"}{" "}
                    <ArrowRight size={18} />
                  </button>
                </>
              )}
              <p className="small muted">
                {tutorial
                  ? "Tab으로 응답 이동 · Enter/Space로 예제 선택"
                  : "키보드 1·2 또는 응답 버튼 · 첫 응답이 확정돼요."}
              </p>
            </div>
            <aside className="switch-learning">
              <span className="eyebrow">판단하는 방법</span>
              <h2>지시부터, 한 가지씩</h2>
              <p>
                같은 자극도 지시에 따라 답이 달라져요. 모양 지시라면 바깥
                모양만, 밝기라면 밝음·어두움만, 방향이라면 화살표만 살펴보세요.
              </p>
              <p className="small muted">
                속성 이름을 글자로 함께 표시해요. 어두운 표식에는 아래쪽에 두
                줄이 있어요.
              </p>
              {!tutorial && (
                <div className="hint-box">
                  <Lightbulb size={20} />
                  <h3>준비 화면에서 도움받기</h3>
                  <p>
                    {a.hintLevel === 0
                      ? "먼저 지시를 읽고 두 버튼의 뜻을 연결해 보세요."
                      : a.hintLevel === 1
                        ? `이번에는 ${SWITCH_NAMES[q.rule]}만 보세요. 다른 속성은 판단에서 제외해요.`
                        : `${SWITCH_OPTIONS[q.rule][0]}이면 1번, ${SWITCH_OPTIONS[q.rule][1]}이면 2번이에요.`}
                  </p>
                  <button
                    className="text-link"
                    disabled={
                      leaving ||
                      a.hintLevel === 2 ||
                      (a.phase !== "ready" &&
                        !(a.phase === "question" && a.timing === "untimed"))
                    }
                    onClick={() => timed("hint")}
                  >
                    {a.hintLevel === 0
                      ? "전략 힌트 보기"
                      : a.hintLevel === 1
                        ? "응답 기준 힌트 보기"
                        : "힌트를 확인했어요"}
                  </button>
                  <small>
                    {a.assisted
                      ? "이 도전에 도움 사용이 기록됩니다."
                      : "시간이 흐르는 동안에는 힌트를 열 수 없어요. 준비 화면 또는 시간 제한 없는 연습에서 확인하세요."}
                  </small>
                </div>
              )}
            </aside>
          </div>
        )}
        {a.phase === "question" && (
          <div className="switch-end-options">
            <details>
              <summary>풀이 열람 안내</summary>
              <p>
                이번 문항은 0점·도움 사용으로 확정하고 실제 판단 기준을
                확인해요.
              </p>
              <button
                className="button secondary"
                disabled={leaving}
                onClick={() => timed("reveal")}
              >
                이번 문항 풀이 확인
              </button>
            </details>
            <button
              className="text-link"
              disabled={leaving}
              onClick={() => timed("skip")}
            >
              이번 문항 건너뛰기
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
