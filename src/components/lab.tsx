"use client";
import Link from "next/link";
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
  Target,
  Flame,
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
import { readAllAttempts } from "@/lib/storage";
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
  const [attempts, setAttempts] = useState<MemoryAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    readAllAttempts()
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
  }, []);
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
function GameCard({ game }: { game: Game }) {
  const Icon = icons[game.icon];
  return (
    <Link className={`game-card ${game.color}`} href={`/games/${game.id}`}>
      <div className="row between">
        <span className="game-icon">
          <Icon size={24} />
        </span>
        <span className="card-number">LAB / {game.number}</span>
      </div>
      <div className="card-body">
        <span className="category">{game.category}</span>
        <h3>{game.name}</h3>
        <p>{game.tagline}</p>
      </div>
      <div className="card-footer">
        <span>
          {game.available ? (
            <>
              <span className="status-dot" />
              플레이 가능
            </>
          ) : (
            "준비 중"
          )}
        </span>
        <ArrowUpRight size={18} />
      </div>
    </Link>
  );
}
export function GameLibrary({ compact = false }: { compact?: boolean }) {
  const [filter, setFilter] = useState("전체");
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">EXPLORE THE LAB</span>
          <h2>
            {compact ? "어떤 능력을 탐험해 볼까요?" : "나에게 맞는 실험실"}
          </h2>
        </div>
        {compact && (
          <Link className="text-link" href="/games">
            모든 게임 <ArrowRight size={16} />
          </Link>
        )}
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
      <div className="game-grid">
        {games
          .filter((g) => filter === "전체" || g.category === filter)
          .map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
      </div>
    </section>
  );
}
function HeroArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="orbit-ring one" />
      <div className="orbit-ring two" />
      <div className="orbit-label label-one">
        <span className="status-dot" /> MEMORY LAB
      </div>
      <div className="floating-symbol">
        <Sparkles size={21} />
      </div>
      <div className="art-board">
        {Array.from({ length: 9 }, (_, i) => (
          <div
            className={[0, 1, 4, 8].includes(i) ? "art-cell lit" : "art-cell"}
            key={i}
          >
            {[0, 1, 4, 8].includes(i) && <span />}
          </div>
        ))}
      </div>
      <div className="orbit-label label-two">관찰하고, 기억하고, 발견하기</div>
      <span className="art-cross">+</span>
    </div>
  );
}
export function Home() {
  const { attempts, loading, error } = useAttempts();
  const completed = attempts.filter((a) => a.phase === "result");
  const passes = new Set(
    completed
      .filter((a) => a.mode === "stage" && outcome(a).passed)
      .map((a) => `${attemptGame(a)}:${a.stage}`),
  ).size;
  const recentGame = attempts.length ? attemptGame(attempts[0]) : "pattern";
  const best = completed.length ? outcome(completed[0]).score : null;
  return (
    <>
      <div className="welcome-line">
        <span>
          <span className="status-dot" /> 연구소에 오신 것을 환영합니다
        </span>
        <span>YOUR MIND, YOUR PACE</span>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow pill">
            <Sparkles size={14} />
            매일 새로운 발견
          </span>
          <h1>
            즐거운 도전,
            <br />
            생각의 <em>새로운 가능성.</em>
          </h1>
          <p>
            기억하고, 추리하고, 연결하며.
            <br />
            게임 속에서 나만의 해결 방법을 발견해 보세요.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href={`/games/${recentGame}`}>
              {attempts.length ? "이어서 도전하기" : "첫 번째 실험 시작하기"}
              <ArrowRight size={18} />
            </Link>
            <Link className="button quiet" href="/games">
              실험실 둘러보기
            </Link>
          </div>
          <div className="hero-caption">
            <ShieldCheck size={15} />
            가입 없이 바로 · 나만의 속도로 · 무료 플레이
          </div>
        </div>
        <HeroArt />
      </section>
      {error && <StorageWarning />}
      <div className="stats-strip">
        <div>
          <span className="stat-icon mint">
            <Target />
          </span>
          <span>
            <small>완료한 스테이지</small>
            <strong>
              {loading ? "—" : passes}
              <i>개</i>
            </strong>
          </span>
        </div>
        <div>
          <span className="stat-icon purple">
            <Trophy />
          </span>
          <span>
            <small>
              {completed.length
                ? games.find((g) => g.id === attemptGame(completed[0]))?.name
                : "최근 도전"}{" "}
              기록
            </small>
            <strong>
              {loading || best === null ? "—" : best.toLocaleString()}
              <i>점</i>
            </strong>
          </span>
        </div>
        <div>
          <span className="stat-icon amber">
            <Flame />
          </span>
          <span>
            <small>쌓아온 도전</small>
            <strong>
              {loading ? "—" : completed.length}
              <i>회</i>
            </strong>
          </span>
        </div>
      </div>
      <GameLibrary compact />
      <section className="learning-banner">
        <span className="learning-symbol">
          <Orbit size={34} />
        </span>
        <div>
          <span className="eyebrow">MORE THAN A GAME</span>
          <h2>정답 다음에, 배움이 시작됩니다.</h2>
          <p>
            결과를 확인하고, 해설에서 전략을 배우고, 새로운 문제에 적용해
            보세요.
          </p>
        </div>
        <Link href="/games/pattern" className="button secondary">
          기억 전략 만나보기
          <ArrowRight size={16} />
        </Link>
      </section>
      <p className="fine-print">
        플레이 기록은 게임 안에서의 수행을 보여줍니다. 지능이나 인지 건강을
        진단하는 지표가 아닙니다.
      </p>
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
        실험실 목록
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
          <p>지금은 패턴 복원에서 위치를 기억하는 전략을 만나보세요.</p>
          <Link href="/games/pattern" className="button primary">
            패턴 복원 만나보기 <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </>
  );
}
export function Records() {
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
        <ShieldCheck size={18} />이 브라우저에 저장된 게스트 기록입니다.
        브라우저 데이터를 삭제하면 기록도 사라집니다.
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
          계정과 공정한 기록 검증을 준비하고 있습니다.
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
