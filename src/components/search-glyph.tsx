import type { SearchTarget } from "@/lib/search-content";
const outlines = [
  <circle key="circle" cx="32" cy="32" r="26" />,
  <path key="triangle" d="M32 5 60 56H4Z" />,
  <rect key="square" x="7" y="7" width="50" height="50" rx="3" />,
  <path key="diamond" d="m32 3 29 29-29 29L3 32Z" />,
];
export function SearchGlyph({ shape, mark }: SearchTarget) {
  return (
    <svg
      className={`search-glyph ${mark === null ? "neutral" : mark < 2 ? "dots" : "bars"}`}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      >
        {shape === null ? (
          <rect
            x="7"
            y="7"
            width="50"
            height="50"
            rx="4"
            strokeDasharray="5 4"
          />
        ) : (
          outlines[shape]
        )}
      </g>
      <g fill="currentColor">
        {mark === 0 ? (
          <circle cx="32" cy="34" r="4.2" />
        ) : mark === 1 ? (
          <>
            <circle cx="25" cy="34" r="4.2" />
            <circle cx="39" cy="34" r="4.2" />
          </>
        ) : mark === 2 ? (
          <rect x="21" y="32" width="22" height="4" rx="2" />
        ) : mark === 3 ? (
          <>
            <rect x="21" y="26" width="22" height="4" rx="2" />
            <rect x="21" y="38" width="22" height="4" rx="2" />
          </>
        ) : null}
      </g>
    </svg>
  );
}
