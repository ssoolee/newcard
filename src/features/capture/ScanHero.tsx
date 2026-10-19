/**
 * The first thing on the first screen: a card being read.
 *
 * Drawn as inline SVG rather than shipped as an image so it follows the theme
 * variables into dark mode, costs no extra request, and needs no exception in
 * the content-security policy.
 *
 * The lines on the card are blocks, never sample text. A mock-up with a
 * plausible name and phone number on it would be a stranger's details sitting
 * in a public repo, and someone would eventually read it as a real contact.
 */
export default function ScanHero() {
  return (
    <figure className="hero">
      <svg
        className="hero-art"
        viewBox="0 0 320 150"
        role="img"
        aria-label="명함을 비추며 글자를 읽어내는 모습"
      >
        <defs>
          <linearGradient id="heroCard" x1="0" y1="0" x2="1" y2="1">
            <stop className="hero-card-a" offset="0" />
            <stop className="hero-card-b" offset="1" />
          </linearGradient>
          <linearGradient id="heroAvatar" x1="0" y1="0" x2="1" y2="1">
            <stop className="hero-avatar-a" offset="0" />
            <stop className="hero-avatar-b" offset="1" />
          </linearGradient>
          <linearGradient id="heroBeam" x1="0" y1="0" x2="0" y2="1">
            <stop className="hero-beam-edge" offset="0" />
            <stop className="hero-beam-core" offset="0.5" />
            <stop className="hero-beam-edge" offset="1" />
          </linearGradient>
          <clipPath id="heroClip">
            <rect x="70" y="28" width="180" height="94" rx="13" />
          </clipPath>
        </defs>

        {/* Viewfinder brackets: the card is being aimed at, not just shown. */}
        <g className="hero-frame" fill="none" strokeWidth="3" strokeLinecap="round">
          <path d="M50 32 V20 a6 6 0 0 1 6-6 H68" />
          <path d="M270 32 V20 a6 6 0 0 0-6-6 H252" />
          <path d="M50 118 V130 a6 6 0 0 0 6 6 H68" />
          <path d="M270 118 V130 a6 6 0 0 1-6 6 H252" />
        </g>

        <rect x="70" y="28" width="180" height="94" rx="13" fill="url(#heroCard)" />

        <circle cx="96" cy="56" r="12" fill="url(#heroAvatar)" />
        <g className="hero-line">
          <rect x="118" y="48" width="78" height="8" rx="4" />
          <rect x="118" y="63" width="52" height="6" rx="3" opacity="0.6" />
          <rect x="84" y="86" width="118" height="6" rx="3" opacity="0.75" />
          <rect x="84" y="100" width="88" height="6" rx="3" opacity="0.5" />
        </g>

        <g clipPath="url(#heroClip)">
          <rect className="hero-beam" x="70" y="0" width="180" height="26" fill="url(#heroBeam)" />
        </g>

        <g className="hero-badge">
          <rect x="208" y="96" width="34" height="18" rx="9" />
          <text x="225" y="109" textAnchor="middle">
            AI
          </text>
        </g>

        <g className="hero-spark">
          <path d="M38 44 q1.5-6 7.5-7.5 -6-1.5-7.5-7.5 -1.5 6-7.5 7.5 6 1.5 7.5 7.5Z" />
          <path d="M284 110 q1.2-5 6-6 -4.8-1.2-6-6 -1.2 4.8-6 6 4.8 1.2 6 6Z" />
          <path d="M276 36 q1-4 5-5 -4-1-5-5 -1 4-5 5 4 1 5 5Z" />
        </g>
      </svg>

      <figcaption className="hero-caption">
        사진 한 장이면 <strong>이름 · 회사 · 연락처</strong>를 읽어 드립니다
      </figcaption>
    </figure>
  );
}
