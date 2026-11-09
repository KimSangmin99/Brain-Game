"use client";
import Link from "next/link";
import { MemoryIllustration } from "./memory-illustration";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  Check,
  LockKeyhole,
  Grid2X2,
  Layers,
  Orbit,
  KeyRound,
  Blocks,
  Route,
  ScanSearch,
  ArrowLeftRight,
  Sparkles,
  Trophy,
  ShieldCheck,
  CircleHelp,
  RotateCcw,
} from "lucide-react";
import { games, type Game } from "@/lib/catalog";
import { configFor } from "@/lib/pattern";
import { nextStage, outcome } from "@/lib/memory-common";
import { sequenceConfig } from "@/lib/sequence";
import { attemptGame, type MemoryAttempt } from "@/lib/memory-types";
import { useAccount } from "./account-provider";
export const icons = {
  grid: Grid2X2,
  layers: Layers,
  orbit: Orbit,
  key: KeyRound,
  blocks: Blocks,
  route: Route,
  scan: ScanSearch,
  switch: ArrowLeftRight,
};
export function useAttempts() {
  const { load } = useAccount();
  const [attempts, setAttempts] = useState<MemoryAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    load()
      .then((a) => {
        if (live) setAttempts(a);
      })
      .catch(() => {
        if (live) setError(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [load]);
  return { attempts, loading, error };
}
export function StorageWarning() {
  return (
    <p className="notice error" role="alert">
      저장된 기록을 읽지 못했습니다. 브라우저의 저장 공간 설정을 확인한 뒤
      새로고침해 주세요. 기존 기록은 지우지 않았습니다.
    </p>
  );
}
function GameCard({
  game,
  completed = 0,
  compact = false,
}: {
  game: Game;
  completed?: number;
  compact?: boolean;
}) {
  const Icon = icons[game.icon];
  return (
    <Link
      className={`game-card ${game.color} ${game.available ? "" : "is-coming"}`}
      href={`/games/${game.id}`}
    >
      <span className="game-icon">
        <Icon size={28} />
      </span>
      <div className="card-body">
        {!compact && (
          <span className="category">
            {game.category} · {game.available ? "플레이 가능" : "준비 중"}
          </span>
        )}
        <h3>{game.name}</h3>
        <p>
          {compact
            ? `${game.id === "pattern" ? "빛의 위치를 기억해요" : "나타난 순서를 기억해요"} · ${completed}/30단계`
            : game.tagline}
        </p>
        {game.available && !compact && (
          <span className="card-progress">{completed} / 30단계 완료</span>
        )}
      </div>
      <ArrowUpRight className="card-arrow" size={23} aria-hidden="true" />
    </Link>
  );
}
function completedStages(attempts: MemoryAttempt[], game: string) {
  return new Set(
    attempts
      .filter(
        (a) =>
          attemptGame(a) === game && a.mode === "stage" && outcome(a).passed,
      )
      .map((a) => a.stage),
  ).size;
}
export function GameLibrary() {
  const [filter, setFilter] = useState("전체");
  const { attempts, loading, error } = useAttempts();
  return (
    <section className="section" aria-label="게임 목록">
      <div className="section-heading">
        <div>
          <h2>원하는 게임을 골라보세요</h2>
          <p className="muted">
            지금은 기억 게임 2종을 플레이할 수 있어요. 나머지 6종은 준비
            중입니다.
          </p>
        </div>
      </div>
      <div className="filters" role="group" aria-label="게임 분야">
        {["전체", "기억", "추론", "논리", "주의·판단"].map((f) => (
          <button
            key={f}
            className={filter === f ? "filter active" : "filter"}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      {error && <StorageWarning />}
      <div className="game-grid" aria-busy={loading}>
        {games
          .filter((g) => filter === "전체" || g.category === filter)
          .map((g) => (
            <GameCard
              key={g.id}
              game={g}
              completed={completedStages(attempts, g.id)}
            />
          ))}
      </div>
      <p className="fine-print">
        게임마다 진행도가 따로 저장돼요. 원하는 게임부터 시작해도 괜찮아요.
      </p>
    </section>
  );
}
export function Home() {
  const { user } = useAccount();
  const { attempts, loading, error } = useAttempts();
  const recentGame = attempts.length ? attemptGame(attempts[0]) : "pattern";
  const game = games.find((g) => g.id === recentGame)!;
  const own = attempts.filter((a) => attemptGame(a) === recentGame);
  const active = own.find((a) => a.phase !== "result");
  const stage = active?.stage ?? nextStage(own);
  const mode = active?.mode ?? "stage";
  const passes =
    completedStages(attempts, "pattern") +
    completedStages(attempts, "sequence");
  return (
    <>
      <div className="welcome-line">
        <span>
          {user
            ? `${user.nickname}님, 반가워요.`
            : attempts.length
              ? "다시 오셨네요. 반가워요."
              : "나를 위한 작은 연습을 시작해요."}
        </span>
        <span className="pill">
          {loading
            ? "기록 확인 중…"
            : passes
              ? `${passes}개의 단계를 완료했어요`
              : "나만의 속도로 시작해요"}
        </span>
      </div>
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <h1 id="home-title">
            오늘도 가볍게,
            <br />한 번의 발견.
          </h1>
          <p>
            {attempts.length
              ? `마지막으로 도전한 ${game.name}을 이어가세요.`
              : "짧은 게임으로 기억하는 방법을 연습해 보세요."}
            <br />
            정답을 찾고, 해설에서 나만의 방법을 발견해요.
          </p>
          <Link
            className="button primary home-start"
            aria-disabled={loading || error}
            href={
              loading || error
                ? "/games"
                : `/games/${recentGame}/play?stage=${stage}&mode=${mode}`
            }
          >
            {attempts.length ? `${game.name} 이어하기` : "첫 게임 시작하기"}
            <ArrowRight size={21} />
          </Link>
          <span className="hero-caption">
            {mode === "practice" ? "자유 연습" : `스테이지 ${stage}`} · 5문항 ·
            힌트 사용 가능{!user && " · 가입 없이 바로"}
          </span>
        </div>
        <MemoryIllustration />
      </section>
      {error && <StorageWarning />}
      <ol className="learning-path" aria-label="게임과 학습 순서">
        <li>
          <span>1</span>
          <strong>방법 익히기</strong>
        </li>
        <li>
          <span>2</span>게임 도전
        </li>
        <li>
          <span>3</span>해설로 돌아보기
        </li>
      </ol>
      <section className="home-games" aria-labelledby="home-games-title">
        <div className="section-heading">
          <h2 id="home-games-title">다른 기억도 깨워볼까요?</h2>
          <Link className="text-link" href="/games">
            게임 모두 보기 <ArrowRight size={17} />
          </Link>
        </div>
        <div className="game-grid">
          {games
            .filter((g) => g.available)
            .map((g) => (
              <GameCard
                compact
                key={g.id}
                game={g}
                completed={completedStages(attempts, g.id)}
              />
            ))}
        </div>
      </section>
      <div className="home-foot">
        <p>
          기억 · 추론 · 논리 · 주의
          <br className="mobile-only" /> 다양한 생각의 연습을 준비하고 있어요.
        </p>
        <Link href="/records" className="text-link">
          내 기록 돌아보기 <ArrowRight size={17} />
        </Link>
      </div>
    </>
  );
}
export function GameDetail({ id }: { id: string }) {
  const game = games.find((g) => g.id === id)!;
  const Icon = icons[game.icon];
  const { attempts, loading, error } = useAttempts();
  const ownAttempts = attempts.filter((a) => attemptGame(a) === id);
  const unlocked = nextStage(ownAttempts);
  const [band, setBand] = useState(0);
  const completed = new Set(
    ownAttempts
      .filter((a) => a.mode === "stage" && outcome(a).passed)
      .map((a) => a.stage),
  );
  return (
    <>
      <Link href="/games" className="back-link">
        <ChevronLeft size={17} />
        게임 목록
      </Link>
      <section className={`detail-hero ${game.color}`}>
        <div>
          <span className="eyebrow">
            {game.category} 실험실 / LAB {game.number}
          </span>
          <h1>
            <Icon size={36} />
            {game.name}
          </h1>
          <p>{game.tagline}</p>
          <p className="strategy-line">
            <Sparkles size={16} />
            {game.strategy}
          </p>
          {game.available ? (
            <Link
              className="button primary"
              aria-disabled={loading || error}
              href={
                loading || error ? "#" : `/games/${id}/play?stage=${unlocked}`
              }
            >
              스테이지 {unlocked} 도전
              <ArrowRight size={18} />
            </Link>
          ) : (
            <span className="coming-badge">이 실험실은 준비 중입니다</span>
          )}
        </div>
        <div className="detail-meta">
          <span>
            <Grid2X2 size={20} />
            짧은 문제, 차근차근
          </span>
          <span>
            <CircleHelp size={20} />
            해설과 보충 연습
          </span>
          <span>
            <ShieldCheck size={20} />
            점수보다 이해를 먼저
          </span>
        </div>
      </section>
      {error && <StorageWarning />}
      {game.available ? (
        <>
          <div className="section-heading">
            <div>
              <span className="eyebrow">YOUR JOURNEY</span>
              <h2>나의 스테이지</h2>
            </div>
            <span className="muted">{completed.size} / 30 완료</span>
          </div>
          <div className="filters">
            {["입문 · 01—10", "응용 · 11—20", "심화 · 21—30"].map((b, i) => (
              <button
                className={band === i ? "filter active" : "filter"}
                aria-pressed={band === i}
                key={b}
                onClick={() => setBand(i)}
              >
                {b}
              </button>
            ))}
          </div>
          <div className="stages">
            {Array.from({ length: 10 }, (_, i) => i + 1 + band * 10).map(
              (stage) => {
                const locked = stage > unlocked || loading || error;
                return (
                  <div
                    key={stage}
                    className={`stage-card ${completed.has(stage) ? "completed" : ""} ${stage === unlocked ? "current" : ""}`}
                  >
                    <span className="stage-number">
                      {String(stage).padStart(2, "0")}
                    </span>
                    <h3>
                      {id === "sequence"
                        ? sequenceConfig(stage).goal
                        : configFor(stage).goal}
                    </h3>
                    <p>
                      {id === "sequence"
                        ? `${sequenceConfig(stage).choices}종 도형 · ${sequenceConfig(stage).length}개 순서`
                        : `${configFor(stage).size}×${configFor(stage).size} 격자 · ${configFor(stage).count}개 위치`}
                    </p>
                    {locked ? (
                      <span className="stage-state">
                        <LockKeyhole size={14} />
                        이전 단계 완료 후
                      </span>
                    ) : (
                      <Link
                        className="stage-state"
                        href={`/games/${id}/play?stage=${stage}`}
                      >
                        {completed.has(stage) ? (
                          <>
                            <Check size={15} />
                            다시 도전
                          </>
                        ) : (
                          <>
                            도전하기
                            <ArrowRight size={15} />
                          </>
                        )}
                      </Link>
                    )}
                  </div>
                );
              },
            )}
          </div>
          <div className="practice-panel">
            <div>
              <h3>부담 없이, 자유 연습</h3>
              <p>
                현재 열린 난이도로 연습해 보세요. 스테이지 진행에는 반영되지
                않습니다.
              </p>
            </div>
            <Link
              className="button secondary"
              aria-disabled={loading || error}
              href={
                loading || error
                  ? "#"
                  : `/games/${id}/play?stage=${unlocked}&mode=practice`
              }
            >
              연습하기 <RotateCcw size={16} />
            </Link>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <Icon size={40} />
          <h2>새로운 도전을 준비하고 있어요.</h2>
          <p>
            지금은 패턴 복원과 시퀀스 기억으로 기억하는 방법을 연습해 보세요.
          </p>
          <Link href="/games/pattern" className="button primary">
            패턴 복원 만나보기 <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </>
  );
}
export function Records() {
  const { user } = useAccount();
  const { attempts, loading, error } = useAttempts();
  const rows = attempts.filter((a) => a.phase === "result");
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">MY DISCOVERIES</span>
        <h1>작은 도전이 쌓인 기록</h1>
        <p>같은 조건의 도전을 돌아보고, 다음 발견을 준비하세요.</p>
      </div>
      <p className="notice">
        <ShieldCheck size={18} />
        {user
          ? "계정의 개인 학습 기록입니다. 공식 순위에는 사용되지 않습니다."
          : "이 브라우저에 저장된 게스트 기록입니다. 브라우저 데이터를 삭제하면 기록도 사라집니다."}
      </p>
      {error ? (
        <StorageWarning />
      ) : loading ? (
        <p role="status" className="loading">
          기록을 불러오는 중입니다…
        </p>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <Trophy size={42} />
          <h2>첫 번째 기록을 만들어 볼까요?</h2>
          <p>게임 한 판을 완료하면 결과와 도움 사용 여부가 여기에 남아요.</p>
          <Link className="button primary" href="/games/pattern">
            첫 도전 시작
            <ArrowRight size={18} />
          </Link>
        </div>
      ) : (
        <div className="record-list">
          {rows.map((a) => {
            const r = outcome(a);
            const recordGame = games.find((g) => g.id === attemptGame(a))!;
            const RecordIcon = icons[recordGame.icon];
            return (
              <article className="record-card" key={a.id}>
                <div className="game-icon mint">
                  <RecordIcon />
                </div>
                <div className="record-info">
                  <h2>
                    {recordGame.name} <span>스테이지 {a.stage}</span>
                  </h2>
                  <p>
                    {new Date(a.createdAt).toLocaleString("ko-KR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    · {a.mode === "practice" ? "자유 연습" : "스테이지"}
                  </p>
                  <div className="tags">
                    <span>
                      {r.passed
                        ? a.mode === "practice"
                          ? "연습 완료"
                          : "스테이지 완료"
                        : "다시 도전"}
                    </span>
                    <span>{a.assisted ? "힌트 사용" : "힌트 없음"}</span>
                    {a.interrupted && <span>중단 후 이어 함</span>}
                  </div>
                </div>
                <div className="record-score">
                  <strong>{r.score.toLocaleString()}</strong>
                  <span>{r.correct}/5 정답</span>
                </div>
                <Link
                  className="icon-button"
                  href={`/games/${recordGame.id}/play?stage=${a.stage}&mode=practice`}
                  aria-label={`스테이지 ${a.stage} 복습`}
                >
                  <RotateCcw size={20} />
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
export function Challenges() {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">WEEKLY CHALLENGE</span>
        <h1>함께 도전하는 새로운 목표</h1>
        <p>같은 조건의 문제를 풀고, 서로의 기록에서 자극을 받아보세요.</p>
      </div>
      <div className="empty-state">
        <Trophy size={48} />
        <span className="coming-badge">준비 중</span>
        <h2>공식 챌린지는 아직 열리지 않았어요.</h2>
        <p>
          모두가 같은 조건에서 도전할 수 있도록 준비하고 있어요.
          <br />
          지금은 개인 스테이지에서 나만의 전략을 익혀 보세요.
        </p>
        <Link className="button primary" href="/games/pattern">
          개인 도전 이어가기
          <ArrowRight size={18} />
        </Link>
      </div>
    </>
  );
}
