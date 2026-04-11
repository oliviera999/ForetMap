import React from 'react';

/** SCR4P: robot analyste compact avec écran et balayage. */
function VisitMascotScrapSvg() {
  return (
    <svg className="visit-scrap-svg" viewBox="0 0 128 148" role="presentation" focusable="false">
      <ellipse cx="64" cy="140" rx="28" ry="6" fill="rgba(15,23,42,0.2)" />
      <g className="visit-scrap-antenna">
        <line x1="64" y1="30" x2="64" y2="18" stroke="#94a3b8" strokeWidth="3" />
        <circle cx="64" cy="14" r="4.5" fill="#38bdf8" stroke="#0f172a" strokeWidth="1.5" />
      </g>
      <g className="visit-scrap-body">
        <rect x="34" y="36" width="60" height="86" rx="12" fill="#94a3b8" stroke="#1e293b" strokeWidth="4" />
        <rect x="42" y="48" width="44" height="30" rx="8" fill="#0f172a" stroke="#38bdf8" strokeWidth="2.5" />
        <rect x="40" y="88" width="48" height="24" rx="7" fill="#cbd5e1" />
        <circle cx="52" cy="100" r="3.2" fill="#475569" />
        <circle cx="64" cy="100" r="3.2" fill="#475569" />
        <circle cx="76" cy="100" r="3.2" fill="#475569" />
      </g>
      <g className="visit-scrap-face">
        <rect x="50" y="57" width="8" height="8" rx="2" fill="#22d3ee" />
        <rect x="70" y="57" width="8" height="8" rx="2" fill="#22d3ee" />
        <path d="M51 71 Q64 76 77 71" fill="none" stroke="#38bdf8" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      <g className="visit-scrap-beam" opacity="0.65">
        <path d="M97 94 Q115 100 97 106 Z" fill="#93c5fd" />
      </g>
      <g className="visit-scrap-glitch" opacity="0.5">
        <rect x="44" y="52" width="8" height="3" fill="#f43f5e" />
        <rect x="74" y="66" width="10" height="3" fill="#facc15" />
      </g>
    </svg>
  );
}

export default VisitMascotScrapSvg;
