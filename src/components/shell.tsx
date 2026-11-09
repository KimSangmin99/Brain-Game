"use client";
import Link from "next/link";
import { useAccount } from "./account-provider";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Asterisk,
  House,
  LayoutGrid,
  ChartNoAxesCombined,
  Trophy,
  SlidersHorizontal,
  X,
  Monitor,
} from "lucide-react";

const nav = [
  { href: "/", label: "오늘", icon: House },
  { href: "/games", label: "게임", icon: LayoutGrid },
  { href: "/challenges", label: "챌린지", icon: Trophy },
  { href: "/records", label: "내 기록", icon: ChartNoAxesCombined },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, status, syncError } = useAccount();
  const isPlaying = path.endsWith("/play");
  const settingsButton = useRef<HTMLButtonElement>(null);
  const [settings, setSettings] = useState(false);
  const [large, setLarge] = useState(false);
  useEffect(() => {
    try {
      setLarge(localStorage.getItem("brain-large-type") === "true");
    } catch {
      /* Preferences are optional. */
    }
  }, []);
  useEffect(() => {
    if (!settings) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettings(false);
        settingsButton.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [settings]);
  return (
    <div
      className={`app ${large ? "large-type" : ""} ${isPlaying ? "is-playing" : ""}`}
    >
      <a className="skip-link" href="#main">
        본문으로 이동
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="브레인 랩 연구소 홈">
            <span className="brand-mark">
              <Asterisk size={26} strokeWidth={1.6} />
            </span>
            <span>
              BRAIN<span className="brand-light">LAB</span>
            </span>
          </Link>
          {isPlaying && (
            <span className="focus-label">한 번에, 하나의 발견</span>
          )}
          <nav className="desktop-nav" aria-label="주 메뉴">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={
                  (href === "/" ? path === "/" : path.startsWith(href))
                    ? "page"
                    : undefined
                }
              >
                <Icon size={17} />
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <Link href="/account" className="guest" aria-label="내 계정">
              <span className="status-dot" />
              {user ? `${user.nickname} · 내 계정` : "로그인 / 가입"}
            </Link>
            <button
              ref={settingsButton}
              className="icon-button"
              aria-label="화면 설정"
              onClick={() => setSettings(!settings)}
              aria-expanded={settings}
            >
              <SlidersHorizontal size={19} />
            </button>
          </div>
        </div>
      </header>
      {settings && (
        <section className="settings-panel" aria-label="화면 설정">
          <div className="row between">
            <strong>화면 설정</strong>
            <button
              className="icon-button"
              aria-label="설정 닫기"
              onClick={() => setSettings(false)}
            >
              <X size={18} />
            </button>
          </div>
          <label className="setting">
            <input
              type="checkbox"
              checked={large}
              onChange={(e) => {
                setLarge(e.target.checked);
                try {
                  localStorage.setItem(
                    "brain-large-type",
                    String(e.target.checked),
                  );
                } catch {
                  /* Keep the current view usable. */
                }
              }}
            />
            큰 글자로 보기
          </label>
          <p>편안하게 읽을 수 있도록 글자 크기를 조절하세요.</p>
        </section>
      )}
      <main id="main" className="main-container" tabIndex={-1}>
        {user && status && (syncError || isPlaying) && (
          <p className={`notice ${syncError ? "error" : ""}`} role="status">
            {status}
            {syncError && (
              <>
                {" "}
                <Link href="/account">저장 상태 확인</Link>
              </>
            )}
          </p>
        )}
        {children}
      </main>
      <footer className="site-footer">
        <span>
          <Asterisk size={18} strokeWidth={1.6} /> BRAINLAB
        </span>
        <p>작은 도전이 쌓이는 곳. 오늘은 나의 속도로.</p>
        <span>
          <Monitor size={14} />
          {user
            ? "완료 기록은 계정에 저장됩니다. 저장 상태를 확인해 주세요."
            : "기록은 이 브라우저에 저장됩니다."}
        </span>
      </footer>
      <nav className="mobile-nav" aria-label="모바일 주 메뉴">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={
              (href === "/" ? path === "/" : path.startsWith(href))
                ? "page"
                : undefined
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
