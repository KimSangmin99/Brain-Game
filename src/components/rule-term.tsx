import {
  DIRECTIONS,
  MARKS,
  termLabel,
  type RuleTerm,
} from "@/lib/rule-content";
export function RuleTermView({ term }: { term: RuleTerm }) {
  return (
    <span
      className="rule-term"
      role="img"
      aria-label={termLabel(term)}
      data-direction={term.direction}
      data-count={term.count}
      data-mark={term.mark}
    >
      <svg
        className="rule-arrow"
        viewBox="0 0 40 40"
        aria-hidden="true"
        style={{ transform: `rotate(${term.direction * 90}deg)` }}
      >
        <path
          d="M20 33V7M8 19 20 7 32 19"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`rule-marks mark-${term.mark}`} aria-hidden="true">
        {Array.from({ length: term.count }, (_, i) => (
          <span key={i}>{MARKS[term.mark].glyph}</span>
        ))}
      </span>
      <span className="rule-term-caption" aria-hidden="true">
        {DIRECTIONS[term.direction]} · {MARKS[term.mark].name} {term.count}개
      </span>
    </span>
  );
}
