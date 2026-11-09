"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "./account-provider";
import { api } from "@/lib/account-api";
import { readAllAttempts } from "@/lib/storage";
import type { MemoryAttempt } from "@/lib/memory-types";
export function AuthForm({ register = false }: { register?: boolean }) {
  const { user } = useAccount();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (user)
    return (
      <div className="empty-state">
        <h1>이미 로그인되어 있어요.</h1>
        <Link className="button primary" href="/account">
          내 계정으로
        </Link>
      </div>
    );
  return (
    <section className="account-panel">
      <span className="eyebrow">MY BRAINLAB</span>
      <h1>{register ? "연구원으로 시작하기" : "다시 만나 반가워요"}</h1>
      <p>ID와 비밀번호로 나의 완료 기록을 이어갑니다.</p>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          const form = new FormData(e.currentTarget);
          try {
            await api(register ? "/auth/register" : "/auth/login", {
              loginId: form.get("loginId"),
              password: form.get("password"),
              ...(register ? { accepted: form.get("accepted") === "on" } : {}),
            });
            window.location.assign("/account");
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "요청을 완료하지 못했습니다.",
            );
            setBusy(false);
          }
        }}
      >
        <label htmlFor="loginId">로그인 ID</label>
        <input
          id="loginId"
          name="loginId"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          minLength={4}
          maxLength={20}
          required
          aria-describedby="id-help"
        />
        <small id="id-help">영문 소문자·숫자·밑줄 4~20자</small>
        <label htmlFor="password">비밀번호</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          minLength={15}
          maxLength={128}
          required
          aria-describedby="password-help"
        />
        <small id="password-help">
          15~128자. 공백·한글을 사용할 수 있습니다.
        </small>
        {register && (
          <>
            <label className="consent">
              <input name="accepted" type="checkbox" required />{" "}
              <span>
                <Link href="/account/guide" target="_blank">
                  이용·개인정보 안내
                </Link>
                를 확인했습니다.
              </span>
            </label>
            <p className="notice">
              복구 이메일 기능은 준비 중입니다. 현재 비밀번호를 잊으면 자동
              복구할 수 없으므로 안전하게 보관해 주세요.
            </p>
          </>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "처리 중…" : register ? "회원가입" : "로그인"}
        </button>
      </form>
      <p>
        {register ? "이미 계정이 있나요?" : "계정이 없나요?"}{" "}
        <Link href={register ? "/login" : "/register"}>
          {register ? "로그인" : "회원가입"}
        </Link>
      </p>
      <Link href="/games">게스트로 게임하기</Link>
    </section>
  );
}
export function Account() {
  const { user, load, upload, status, syncError } = useAccount();
  const [guest, setGuest] = useState<MemoryAttempt[]>([]),
    [accountCount, setAccountCount] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [imported, setImported] = useState(false);
  useEffect(() => {
    if (!user) return;
    let live = true;
    Promise.all([readAllAttempts(), load()])
      .then(([all, account]) => {
        if (!live) return;
        setGuest(
          all.filter(
            (a) =>
              a.phase === "result" &&
              !localStorage.getItem(`brain-linked-${a.id}`),
          ),
        );
        setAccountCount(account.filter((a) => a.phase === "result").length);
      })
      .catch(() => {
        if (live)
          setError(
            "기록을 읽지 못했습니다. 브라우저 저장 공간을 확인해 주세요.",
          );
      });
    return () => {
      live = false;
    };
  }, [user, load]);
  if (!user)
    return (
      <section className="account-panel">
        <h1>나의 연구 기록을 이어가세요</h1>
        <p>
          로그인하면 완료한 기록과 단계 진행을 다른 기기에서도 불러올 수 있어요.
        </p>
        <div className="hero-actions">
          <Link href="/login" className="button primary">
            로그인
          </Link>
          <Link href="/register" className="button secondary">
            회원가입
          </Link>
        </div>
      </section>
    );
  return (
    <section className="account-panel">
      <span className="eyebrow">MY ACCOUNT</span>
      <h1>{user.nickname}의 연구실</h1>
      <p>
        로그인 ID: <strong>{user.loginId}</strong>
      </p>
      <p>
        계정 완료 기록 <strong>{accountCount}개</strong>
      </p>
      <p className="account-count-note">
        완료 기록 수에는 이 기기에 저장 대기 중인 결과가 포함될 수 있어요.
        아래에서 계정 저장 상태를 확인해 주세요.
      </p>
      <p className={`notice ${syncError ? "error" : ""}`} role="status">
        {status || "계정 기록을 확인하는 중입니다…"}
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const rows = await load();
            setAccountCount(rows.filter((a) => a.phase === "result").length);
          } finally {
            setBusy(false);
          }
        }}
      >
        계정 기록 다시 동기화
      </button>
      <div className="import-panel">
        <h2>게스트 기록 가져오기</h2>
        <p>
          이 브라우저의 미연결 완료 기록은 {guest.length}개입니다. 가져오면 이
          계정의 진행도에 합쳐집니다. 다른 계정으로 다시 가져올 수 없습니다.
        </p>
        <p>아직 완료하지 않은 게임은 게스트 플레이에서 이어갈 수 있습니다.</p>
        {guest.length > 0 && (
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await upload(guest, true);
                setImported(true);
                setGuest([]);
                const rows = await load();
                setAccountCount(
                  rows.filter((a) => a.phase === "result").length,
                );
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "기록을 가져오지 못했습니다.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            완료 기록 {guest.length}개를 이 계정으로 가져오기
          </button>
        )}
        {imported && (
          <p role="status">
            기록을 가져왔습니다. 원본은 이 브라우저에 보관됩니다.
          </p>
        )}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <p>
        가져온 기록과 현재 게임 결과는 개인 학습 기록이며 공식 순위에 사용되지
        않습니다. 진행 중인 문항은 기기 간 동기화되지 않습니다.
      </p>
      <p>복구 이메일 기능은 준비 중입니다.</p>
      <div className="hero-actions">
        <Link className="button primary" href="/records">
          내 기록 보기
        </Link>
        <button
          disabled={busy}
          className="button secondary"
          onClick={async () => {
            setBusy(true);
            try {
              await api("/auth/logout", {});
              window.location.assign("/");
            } catch {
              setError("로그아웃하지 못했습니다. 다시 시도해 주세요.");
              setBusy(false);
            }
          }}
        >
          로그아웃
        </button>
      </div>
    </section>
  );
}
