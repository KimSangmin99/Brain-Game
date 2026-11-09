"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BrainCircuit,
  House,
  LayoutGrid,
  ChartNoAxesCombined,
  Trophy,
  SlidersHorizontal,
  X,
  Monitor,
} from "lucide-react";

const nav = [
  { href: "/", label: "연구소", icon: House },
  { href: "/games", label: "게임", icon: LayoutGrid },
  { href: "/challenges", label: "챌린지", icon: Trophy },
  { href: "/records", label: "내 기록", icon: ChartNoAxesCombined },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [settings, setSettings] = useState(false);
  const [large, setLarge] = useState(false);
  return (
    <div className={large ? "app large-type" : "app"}>
      <a className="skip-link" href="#main">
        본문으로 이동
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="브레인 랩 연구소 홈">
            <span className="brand-mark">
              <BrainCircuit size={25} />
            </span>
            <span>
              BRAIN<span className="brand-light">LAB</span>
              <small>나를 발견하는 두뇌 연구소</small>
            </span>
          </Link>
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
            <span className="guest">
              <span className="status-dot" />
              게스트 연구원
            </span>
            <button
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
              onChange={(e) => setLarge(e.target.checked)}
            />
            큰 글자로 보기
          </label>
          <p>이 화면에 적용됩니다. 기기의 동작 감소 설정도 따릅니다.</p>
        </section>
      )}
      <main id="main" className="main-container">
        {children}
      </main>
      <footer className="site-footer">
        <span>
          <BrainCircuit size={16} /> BRAINLAB
        </span>
        <p>작은 도전이 쌓이는 곳. 오늘은 나의 속도로.</p>
        <span>
          <Monitor size={14} />
          기록은 이 브라우저에 저장됩니다.
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
