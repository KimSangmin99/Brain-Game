export function MemoryIllustration() {
  return (
    <div className="hero-art" aria-hidden="true">
      <svg viewBox="0 0 430 340">
        <defs>
          <filter id="memory-shadow">
            <feDropShadow
              dx="0"
              dy="15"
              stdDeviation="16"
              floodColor="#304834"
              floodOpacity=".13"
            />
          </filter>
          <linearGradient id="memory-paper" x2="1" y2="1">
            <stop stopColor="#fffef8" />
            <stop offset="1" stopColor="#e4eadb" />
          </linearGradient>
        </defs>
        <ellipse cx="222" cy="291" rx="157" ry="18" fill="#e4e8dc" />
        <circle cx="218" cy="159" r="132" fill="#edf0e3" />
        <g
          transform="translate(103 49) rotate(-10 110 110)"
          filter="url(#memory-shadow)"
        >
          <rect x="18" y="18" width="226" height="226" rx="21" fill="#c8d3be" />
          <rect x="8" y="7" width="226" height="226" rx="21" fill="#e0e7d6" />
          <rect
            width="226"
            height="226"
            rx="21"
            fill="url(#memory-paper)"
            stroke="#d1dcc8"
          />
          <g transform="translate(29 28)">
            <rect width="48" height="48" rx="9" fill="#547a57" />
            <rect x="60" width="48" height="48" rx="9" fill="#dbe2d2" />
            <rect x="120" width="48" height="48" rx="9" fill="#dbe2d2" />
            <rect y="60" width="48" height="48" rx="9" fill="#dbe2d2" />
            <rect x="60" y="60" width="48" height="48" rx="9" fill="#547a57" />
            <rect x="120" y="60" width="48" height="48" rx="9" fill="#dbe2d2" />
            <rect y="120" width="48" height="48" rx="9" fill="#dbe2d2" />
            <rect x="60" y="120" width="48" height="48" rx="9" fill="#dbe2d2" />
            <rect
              x="120"
              y="120"
              width="48"
              height="48"
              rx="9"
              fill="#547a57"
            />
          </g>
        </g>
        <circle cx="352" cy="85" r="18" fill="#e9c68e" />
        <path d="M62 132l6-13 6 13-6 13z" fill="#9baf87" />
      </svg>
      <span>작은 기억을, 나만의 방법으로.</span>
    </div>
  );
}
