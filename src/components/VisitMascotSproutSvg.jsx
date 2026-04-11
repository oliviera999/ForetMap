import React from 'react';

/** SPR0UT: hybride bio-punk capsule + feuilles. */
function VisitMascotSproutSvg() {
  return (
    <svg className="visit-sprout-svg" viewBox="0 0 128 148" role="presentation" focusable="false">
      <ellipse cx="64" cy="140" rx="28" ry="6" fill="rgba(11,43,27,0.2)" />
      <g className="visit-sprout-roots">
        <path d="M52 128 Q42 136 34 134" fill="none" stroke="#2f855a" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M64 128 Q64 138 56 142" fill="none" stroke="#2f855a" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M76 128 Q86 136 94 133" fill="none" stroke="#2f855a" strokeWidth="3.2" strokeLinecap="round" />
      </g>
      <g className="visit-sprout-body">
        <rect x="38" y="40" width="52" height="86" rx="24" fill="#6ee7b7" stroke="#0f5132" strokeWidth="4" />
        <rect x="42" y="44" width="44" height="78" rx="20" fill="#a7f3d0" opacity="0.66" />
      </g>
      <g className="visit-sprout-plant">
        <path d="M65 50 Q78 30 97 35 Q88 56 65 50 Z" fill="#84cc16" stroke="#3f6212" strokeWidth="2.2" />
        <path d="M62 54 Q46 36 29 42 Q42 62 62 54 Z" fill="#4ade80" stroke="#166534" strokeWidth="2.2" />
      </g>
      <g className="visit-sprout-face">
        <ellipse cx="52" cy="74" rx="7" ry="7.5" fill="#fff" />
        <ellipse cx="76" cy="74" rx="7" ry="7.5" fill="#fff" />
        <circle cx="54" cy="75" r="3" fill="#0f172a" />
        <circle cx="78" cy="75" r="3" fill="#0f172a" />
        <path d="M50 93 Q64 101 78 93" fill="none" stroke="#0f5132" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className="visit-sprout-core">
        <circle cx="64" cy="106" r="8.5" fill="#22d3ee" opacity="0.85" />
        <circle cx="64" cy="106" r="5" fill="#e0f2fe" />
      </g>
      <g className="visit-sprout-lights">
        <circle cx="46" cy="108" r="2.2" fill="#a3e635" />
        <circle cx="82" cy="108" r="2.2" fill="#a3e635" />
      </g>
    </svg>
  );
}

export default VisitMascotSproutSvg;
