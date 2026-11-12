"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Lightbulb,
  Pause,
  RotateCcw,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { codeEngine } from "@/lib/memory-engines";
import { useMemorySession } from "./use-memory-session";
import { codeOutcome, type CodeAttempt } from "@/lib/code";
import {
  CODE_SYMBOLS,
  codeConfig,
  codeExample,
  candidateCodes,
  matchesClues,
  sameCode,
} from "@/lib/code-rules";
export function CodeWord({
  symbols,
  label,
}: {
  symbols: readonly number[];
  label: string;
}) {
  return (
    <span
      className="code-word"
      role="img"
      aria-label={`${label}: ${symbols.map((n) => CODE_SYMBOLS[n].name).join("、")}`}
      data-symbols={symbols.join(",")}
    >
      {symbols.map((n, i) => (
        <span key={i} className={`code-symbol symbol-${n}`} aria-hidden="true">
          {CODE_SYMBOLS[n].glyph}
        </span>
      ))}
    </span>
  );
}
export function CodePlayer({
  stage,
  mode,
}: {
  stage: number;
  mode: CodeAttempt["mode"];
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
  } = useMemorySession(codeEngine, stage, mode);
  const [leaving, setLeaving] = useState(false),
    [inputError, setInputError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const config = codeConfig(stage),
    example = codeExample(stage);
  const candidates = useMemo(
    () =>
      attempt?.hintLevel === 2 ? candidateCodes(stage, attempt.guesses) : [],
    [stage, attempt?.hintLevel, attempt?.guesses],
  );
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    setInputError("");
  }, [attempt?.phase]);
  const fill = (symbol: number) => {
    if (!attempt || attempt.phase !== "playing") return;
    if (
      !config.repeats &&
      attempt.draft.some((v, i) => i !== attempt.cursor && v === symbol)
    ) {
      setInputError(
        "이 단계는 기호 중복이 없어요. 다른 칸을 비우거나 다른 기호를 골라 주세요.",
      );
      return;
    }
    setInputError("");
    dispatch({ type: "fill", symbol });
  };
  useEffect(() => {
    const input = (event: KeyboardEvent) => {
      if (
        leaving ||
        attempt?.phase !== "playing" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat
      )
        return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input,textarea,select,[contenteditable=true]"))
        return;
      if (/^[1-6]$/.test(event.key) && Number(event.key) <= config.choices) {
        event.preventDefault();
        fill(Number(event.key) - 1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        dispatch({
          type: "slot",
          index:
            (attempt.cursor +
              (event.key === "ArrowRight" ? 1 : config.length - 1)) %
            config.length,
        });
      } else if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        setInputError("");
        dispatch({ type: event.key === "Backspace" ? "backspace" : "clear" });
      }
    };
    document.addEventListener("keydown", input);
    return () => document.removeEventListener("keydown", input);
  }, [attempt, leaving]);
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
        <Link className="button secondary" href="/games/code">
          스테이지 목록으로
        </Link>
      </div>
    );
  if (!attempt)
    return (
      <p className="loading" role="status">
        코드를 준비하고 있어요…
      </p>
    );
  const a = attempt,
    result = codeOutcome(a),
    complete = a.draft.every((v) => v !== null),
    duplicate =
      complete &&
      a.guesses.some((g) => sameCode(g.symbols, a.draft as number[]));
  const title =
    a.phase === "intro"
      ? "단서로 비밀 코드를 풀어볼까요?"
      : a.phase === "tutorial"
        ? "두 단서의 차이를 익혀요."
        : a.phase === "paused"
          ? "잠시 멈췄어요."
          : a.phase === "result"
            ? result.passed
              ? "비밀 코드를 해독했어요!"
              : a.revealed
                ? "풀이에서 단서를 확인해요."
                : "단서를 돌아보고, 새 코드로 도전해요."
            : "어떤 조합이 숨어 있을까요?";
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
          <ChevronLeft size={18} />
          실험실 나가기
        </button>
        <span className="eyebrow">
          코드 브레이커 /{" "}
          {mode === "practice" ? "자유 연습" : `스테이지 ${stage}`}
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
              같은 코드와 추측 이력, 작성 중인 조합을 그대로 이어갈 수 있어요.
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => setLeaving(false)}
          >
            계속하기
          </button>
          <Link className="button primary" href="/games/code">
            나가기
          </Link>
        </div>
      )}
      <div className="player-layout">
        <section className="experiment code-experiment">
          <div className="experiment-header">
            <span className="badge purple">코드 브레이커</span>
            <span className="muted">
              {config.length}자리 · 최대 {config.maxGuesses}회
            </span>
          </div>
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          <p className="experiment-subtitle">
            {config.repeats
              ? "같은 기호가 여러 자리에 들어갈 수 있어요."
              : "이 단계에서는 같은 기호가 두 번 들어가지 않아요."}{" "}
            응답 시간 제한은 없어요.
          </p>
          {a.phase === "intro" ? (
            <div className="code-intro">
              <div className="code-lock" aria-hidden="true">
                {Array.from({ length: config.length }, (_, i) => (
                  <span key={i}>?</span>
                ))}
              </div>
              <h2>{config.goal}</h2>
              <p>
                {config.choices}종 기호로 만든 {config.length}자리 코드예요.
                추측을 제출하면 위치와 기호에 관한 두 단서를 드려요.
              </p>
              <div className="play-controls">
                <button
                  className="button primary"
                  onClick={() => dispatch({ type: "tutorial" })}
                >
                  단서 예제 확인 <ArrowRight size={18} />
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
              <p className="small muted">
                해독하면 다음 단계가 열려요. 시도 횟수가 끝나면 새 코드로 다시
                도전할 수 있어요.
              </p>
            </div>
          ) : a.phase === "tutorial" ? (
            <div className="code-tutorial">
              <div className="code-example-row">
                <strong>예제 정답</strong>
                <CodeWord symbols={example.target} label="예제 정답" />
              </div>
              <div className="code-example-row">
                <strong>예제 추측</strong>
                <CodeWord symbols={example.guess} label="예제 추측" />
              </div>
              <p>
                먼저 같은 자리의 기호를 세면 <strong>{example.exact}개</strong>
                예요. 그 기호를 제외하고 남은 정답 기호와 대응하면, 자리만 다른
                기호는 <strong>{example.misplaced}개</strong>예요. 중복 기호도
                정답에 남아 있는 개수만큼만 한 번씩 셉니다.
              </p>
              <h2>이 추측에 맞는 단서는?</h2>
              <div className="code-example-options">
                {[
                  { exact: example.exact, misplaced: example.misplaced },
                  {
                    exact: example.exact + 1,
                    misplaced: example.misplaced - 1,
                  },
                  {
                    exact: example.exact - 1,
                    misplaced: example.misplaced + 1,
                  },
                ].map((r, i) => (
                  <button
                    key={i}
                    className="button secondary"
                    onClick={() => dispatch({ type: "example", ...r })}
                  >
                    위치 {r.exact} · 기호 {r.misplaced}
                  </button>
                ))}
              </div>
              <p role="status">
                {a.tutorialPassed
                  ? "맞아요. 예제는 점수에 포함되지 않아요."
                  : "예제 설명과 같은 단서를 선택해 주세요."}
              </p>
              <div className="play-controls">
                <button
                  className="button primary"
                  disabled={!a.tutorialPassed}
                  onClick={() => dispatch({ type: "start" })}
                >
                  예제 완료 · 코드 해독 시작 <ArrowRight size={18} />
                </button>
              </div>
            </div>
          ) : a.phase === "paused" ? (
            <div className="paused-panel">
              <Pause size={44} />
              <p>
                같은 코드·추측·작성 중인 조합을 그대로 이어갑니다. 이 도전에
                중단 이력이 표시돼요.
              </p>
              <button
                className="button primary"
                onClick={() => dispatch({ type: "resume" })}
              >
                이 코드로 이어가기 <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <>
              {a.phase === "result" ? (
                <div className="result-panel">
                  <span className="result-medal">
                    <Trophy size={44} />
                  </span>
                  <div className="result-score">
                    {result.score.toLocaleString()}
                    <small>점</small>
                  </div>
                  <div className="code-solution">
                    <strong>이번 코드의 정답</strong>
                    <CodeWord symbols={a.secret} label="코드 정답" />
                  </div>
                  <div className="result-facts">
                    <span>
                      <strong>
                        {a.guesses.length} / {config.maxGuesses}회
                      </strong>
                      사용한 추측
                    </span>
                    <span>
                      <strong>
                        {result.passed
                          ? "해독 성공"
                          : a.endReason === "exhausted"
                            ? "시도 소진"
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
                            : "다음 도전을 준비해요"}
                    </span>
                  </div>
                  <div className="result-actions">
                    {result.passed && mode === "stage" && stage < 30 ? (
                      <Link
                        className="button primary"
                        aria-disabled={saved !== a.revision}
                        href={
                          saved === a.revision
                            ? `/games/code/play?stage=${stage + 1}`
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
                        새 코드로 재도전 <RotateCcw size={18} />
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
                        ? "해독한 단계는 그대로 남아요."
                        : "시도 소진·건너뛰기·풀이 열람은 0점이며 다음 단계를 열지 않아요."}
                  </p>
                </div>
              ) : (
                <div className="code-input-panel">
                  <div className="code-attempt-count" role="status">
                    {a.guesses.length + 1}번째 추측 ·{" "}
                    {config.maxGuesses - a.guesses.length}회 남음
                  </div>
                  <div
                    className="code-draft"
                    role="group"
                    aria-label="작성 중인 코드"
                  >
                    {a.draft.map((n, i) => (
                      <button
                        type="button"
                        className={`code-slot ${a.cursor === i ? "active" : ""}`}
                        key={i}
                        aria-pressed={a.cursor === i}
                        aria-label={`${i + 1}번째 자리, ${n === null ? "빈칸" : CODE_SYMBOLS[n].name}`}
                        disabled={leaving}
                        onClick={() => {
                          setInputError("");
                          dispatch({ type: "slot", index: i });
                        }}
                      >
                        <small>{i + 1}번째</small>
                        <span
                          className={
                            n === null ? "" : "code-symbol symbol-" + n
                          }
                        >
                          {n === null ? "·" : CODE_SYMBOLS[n].glyph}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="code-key-help">
                    칸을 고르고 기호를 넣으세요. 숫자 1~{config.choices}, 좌우
                    방향키, Backspace도 사용할 수 있어요.
                  </p>
                  <div
                    className="code-palette"
                    role="group"
                    aria-label="사용할 기호"
                  >
                    {CODE_SYMBOLS.slice(0, config.choices).map((symbol, n) => (
                      <button
                        key={n}
                        disabled={leaving}
                        onClick={() => fill(n)}
                        aria-label={`${symbol.name} 입력 (${n + 1})`}
                      >
                        <span className={`code-symbol symbol-${n}`}>
                          {symbol.glyph}
                        </span>
                        <small>
                          {symbol.name} <kbd>{n + 1}</kbd>
                        </small>
                      </button>
                    ))}
                  </div>
                  <p className="code-input-error" role="status">
                    {inputError ||
                      (duplicate
                        ? "이미 제출한 조합이에요. 기호나 위치를 바꿔 주세요."
                        : "기호와 위치를 바꾸며 이전 단서와 비교해 보세요.")}
                  </p>
                  <div className="play-controls">
                    <button
                      className="button primary"
                      disabled={!complete || duplicate || leaving}
                      onClick={() => {
                        setInputError("");
                        dispatch({ type: "confirm" });
                      }}
                    >
                      추측 제출 <Check size={18} />
                    </button>
                    <button
                      className="button secondary"
                      disabled={leaving}
                      onClick={() => {
                        setInputError("");
                        dispatch({ type: "clear" });
                      }}
                    >
                      이 칸 비우기
                    </button>
                  </div>
                </div>
              )}
              <div className="code-history">
                <h2>
                  지금까지의 추측 <span>{a.guesses.length}회</span>
                </h2>
                <div className="code-clue-legend">
                  <p>
                    <strong>위치 일치</strong> 기호와 자리가 모두 맞는 수
                  </p>
                  <p>
                    <strong>기호 일치</strong> 같은 자리를 제외하고 기호만 맞는
                    수
                  </p>
                  <p>어느 칸이 맞는지는 알려주지 않아요.</p>
                </div>
                {a.guesses.length === 0 ? (
                  <p className="muted">
                    첫 추측을 제출하면 두 단서가 여기에 남아요.
                  </p>
                ) : (
                  <ol aria-label="추측 이력">
                    {a.guesses.map((g, i) => (
                      <li key={i}>
                        <span className="code-guess-number">{i + 1}차</span>
                        <CodeWord
                          symbols={g.symbols}
                          label={`${i + 1}차 추측`}
                        />
                        <div
                          className="code-feedback"
                          data-exact={g.exact}
                          data-misplaced={g.misplaced}
                        >
                          <span>
                            위치 일치 <strong>{g.exact}</strong>
                          </span>
                          <span>
                            기호 일치 <strong>{g.misplaced}</strong>
                          </span>
                        </div>
                        {!matchesClues(g.symbols, a.guesses.slice(0, i)) && (
                          <p className="code-conflict">
                            앞선 단서와 모순된 추측이에요. 이 조합이 정답이라면
                            이전 단서 중 일부가 달라져야 해요.
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </section>
        <aside className="learning-sidebar">
          <span className="eyebrow">단서를 좁히는 방법</span>
          <h2>{config.goal}</h2>
          <p>빠른 추측보다 이전 결과에 맞는 조합인지 확인해 보세요.</p>
          <div className="learning-step">
            <span>01</span>
            <div>
              <strong>두 조건을 나눠요</strong>
              <p>
                위치 일치와 기호 일치를 따로 읽어요. 두 수는 겹쳐 세지 않아요.
              </p>
            </div>
          </div>
          <div className="learning-step">
            <span>02</span>
            <div>
              <strong>앞선 단서와 맞춰요</strong>
              <p>
                새 조합이 정답이라면, 이전 추측들이 같은 단서를 주는지 확인해요.
              </p>
            </div>
          </div>
          <div className="hint-box">
            <Lightbulb size={20} />
            <h3>가능성을 함께 좁혀볼까요?</h3>
            <p>
              {a.hintLevel
                ? "위치가 맞은 기호와 포함만 된 기호를 구분하세요. 위치·기호 합이 0인 추측의 기호는 정답에서 제외할 수 있어요."
                : "전략 힌트와 후보 확인을 선택할 수 있어요."}
            </p>
            {a.hintLevel === 2 && (
              <div className="code-candidates">
                <p>
                  이전 단서와 맞는 후보는 <strong>{candidates.length}개</strong>
                  예요. 아래는 {Math.min(3, candidates.length)}개 예시이며
                  유일한 정답을 뜻하지 않아요.
                </p>
                {candidates.slice(0, 3).map((code, i) => (
                  <CodeWord
                    key={i}
                    symbols={code}
                    label={`가능 조합 예시 ${i + 1}`}
                  />
                ))}
              </div>
            )}
            <button
              className="text-link"
              disabled={a.phase !== "playing" || a.hintLevel === 2 || leaving}
              onClick={() => dispatch({ type: "hint" })}
            >
              {a.hintLevel === 0
                ? "전략 힌트 보기"
                : a.hintLevel === 1
                  ? "남은 후보 확인"
                  : "후보를 확인했어요"}
            </button>
            {a.assisted && <small>이 도전에 도움 사용이 기록됩니다.</small>}
          </div>
          {a.phase === "playing" && (
            <div className="code-end-options">
              <details>
                <summary>풀이 열람 안내</summary>
                <p>
                  정답을 확인하고 이번 도전을 0점으로 끝냅니다. 단계는 열리지
                  않아요.
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
                이번 코드 건너뛰기
              </button>
            </div>
          )}
          <p className="sidebar-foot">
            <ShieldCheck size={16} />
            색뿐 아니라 모양과 이름으로도 기호를 구분할 수 있어요.
          </p>
        </aside>
      </div>
    </div>
  );
}
