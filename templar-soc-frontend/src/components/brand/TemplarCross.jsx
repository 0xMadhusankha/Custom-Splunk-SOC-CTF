/* ============================================================
   TEMPLAR CROSS — the Order's mark.
   Original geometry (not a Ubisoft asset): a cross pattée set
   inside a segmented ring, evoking the Animus/Abstergo lineage.
   Used sparingly as an enterprise identity, per brief.
   ============================================================ */

export default function TemplarCross({ size = 40, glow = true, tone = 'crimson' }) {
  const stroke = tone === 'gold' ? 'var(--gold)' : 'var(--crimson)';
  const faint = tone === 'gold' ? 'var(--gold-dim)' : 'var(--crimson-dim)';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Templar Order"
      style={glow ? { filter: `drop-shadow(0 0 6px ${tone === 'gold' ? 'var(--gold-glow)' : 'var(--crimson-glow)'})` } : undefined}
    >
      {/* segmented outer ring */}
      <g stroke={faint} strokeWidth="1.4">
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2;
          const r1 = 44, r2 = 47;
          return (
            <line
              key={i}
              x1={50 + Math.cos(a) * r1}
              y1={50 + Math.sin(a) * r1}
              x2={50 + Math.cos(a) * r2}
              y2={50 + Math.sin(a) * r2}
              opacity={i % 2 ? 0.35 : 0.7}
            />
          );
        })}
      </g>
      <circle cx="50" cy="50" r="40" stroke={faint} strokeWidth="1.2" opacity="0.5" />
      <circle cx="50" cy="50" r="33" stroke={stroke} strokeWidth="1.6" opacity="0.85" />

      {/* cross pattée — four flared arms */}
      <g fill={stroke}>
        <path d="M50 15 L57 38 L50 33 L43 38 Z" />
        <path d="M85 50 L62 57 L67 50 L62 43 Z" />
        <path d="M50 85 L43 62 L50 67 L57 62 Z" />
        <path d="M15 50 L38 43 L33 50 L38 57 Z" />
      </g>

      {/* inner core */}
      <circle cx="50" cy="50" r="7.5" stroke={stroke} strokeWidth="1.6" fill="var(--void)" />
      <circle cx="50" cy="50" r="2.4" fill={stroke} />
    </svg>
  );
}
