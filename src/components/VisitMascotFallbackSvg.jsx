import React from 'react';

/** Gnome de profil (variantes couleur). */
function GnomeVisitMascotSvg({ variant = 'forest' }) {
  const isAmber = variant === 'amber';
  const isPunk = variant === 'punk';
  const hatFill = isPunk ? '#111827' : (isAmber ? '#b45309' : '#2f855a');
  const bodyFill = isPunk ? '#d946ef' : (isAmber ? '#7c9a42' : '#6cc596');
  const beltFill = isPunk ? '#1f2937' : (isAmber ? '#92400e' : '#84512f');
  const skinFill = isPunk ? '#f5dfcf' : (isAmber ? '#f2ddc2' : '#f4e9d0');
  const beardFill = isPunk ? '#f3f4f6' : (isAmber ? '#fff3df' : '#fff8ef');
  const charmFill = isPunk ? '#22d3ee' : (isAmber ? '#f59e0b' : '#fbbf24');
  const shoesFill = isPunk ? '#111827' : (isAmber ? '#5b3a1b' : '#6b4f2d');

  return (
    <svg className="visit-gnome-svg" viewBox="0 0 128 148" role="presentation" focusable="false">
      <ellipse cx="64" cy="140" rx="30" ry="7" fill="rgba(26,71,49,0.2)" />
      <g className="visit-gnome-hat">
        <path d="M34 40 L73 12 L100 37 L74 42 Z" fill={hatFill} stroke="#1a4731" strokeWidth="4" />
        <circle cx="100" cy="37" r="4" fill={charmFill} stroke="#1a4731" strokeWidth="2" />
        {isPunk ? (
          <g className="visit-gnome-mohawk">
            <path d="M66 17 L71 5 L76 17 Z" fill="#22d3ee" stroke="#1a4731" strokeWidth="1.6" />
            <path d="M74 18 L80 6 L85 18 Z" fill="#f43f5e" stroke="#1a4731" strokeWidth="1.6" />
            <path d="M82 20 L88 8 L93 20 Z" fill="#f59e0b" stroke="#1a4731" strokeWidth="1.6" />
          </g>
        ) : null}
      </g>
      <g className="visit-gnome-head">
        <ellipse cx="68" cy="52" rx="20" ry="16" fill={skinFill} stroke="#1a4731" strokeWidth="3.5" />
        <ellipse cx="75" cy="50" rx="5.5" ry="6.8" fill="#fff" />
        <ellipse cx="76.5" cy="51.5" rx="2.4" ry="3.3" fill="#1a4731" />
        <circle cx="77.4" cy="50.4" r="1" fill="#fff" />
        <circle cx="84" cy="54" r="2.2" fill="#d97745" />
        <path d="M73 60 Q79 63 85 58" fill="none" stroke="#1a4731" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M58 60 Q77 96 95 61 Q89 108 77 116 Q65 107 58 60 Z" fill={beardFill} stroke="#1a4731" strokeWidth="3" />
        {isPunk ? (
          <circle cx="88.8" cy="56.2" r="1.5" fill="#9ca3af" stroke="#1a4731" strokeWidth="1.2" />
        ) : null}
      </g>
      <g className="visit-gnome-body">
        <rect x="52" y="76" width="45" height="34" rx="13" fill={bodyFill} stroke="#1a4731" strokeWidth="4" />
        <rect x="71" y="78" width="8" height="27" rx="4" fill={beltFill} />
      </g>
      <g className="visit-gnome-arm visit-gnome-arm--back">
        <rect x="54" y="82" width="12" height="25" rx="6" fill={skinFill} stroke="#1a4731" strokeWidth="3" />
      </g>
      <g className="visit-gnome-arm visit-gnome-arm--front">
        <rect x="85" y="81" width="12" height="25" rx="6" fill={skinFill} stroke="#1a4731" strokeWidth="3" />
      </g>
      <g className="visit-gnome-leg visit-gnome-leg--back">
        <rect x="60" y="108" width="14" height="26" rx="7" fill={shoesFill} />
      </g>
      <g className="visit-gnome-leg visit-gnome-leg--front">
        <rect x="79" y="108" width="14" height="26" rx="7" fill={shoesFill} />
      </g>
    </svg>
  );
}

/** Champignon flottant lumineux. */
function SporeVisitMascotSvg() {
  return (
    <svg className="visit-spore-svg" viewBox="0 0 128 148" role="presentation" focusable="false">
      <ellipse cx="64" cy="138" rx="22" ry="5" fill="rgba(26,71,49,0.18)" />
      <g className="visit-spore-body">
        <ellipse className="visit-spore-cap" cx="64" cy="58" rx="42" ry="36" fill="#86efac" stroke="#1a4731" strokeWidth="3.5" />
        <ellipse cx="64" cy="52" rx="28" ry="22" fill="#bbf7d0" opacity="0.85" />
        <rect x="48" y="88" width="32" height="44" rx="14" fill="#f4e9d0" stroke="#1a4731" strokeWidth="3.5" />
        <circle cx="54" cy="108" r="4" fill="#1a4731" />
        <circle cx="74" cy="108" r="4" fill="#1a4731" />
        <path className="visit-spore-glow" d="M64 22 Q88 38 64 46 Q40 38 64 22" fill="#fef08a" opacity="0.55" stroke="#ca8a04" strokeWidth="1.5" />
      </g>
      <g className="visit-spore-spores" opacity="0.7">
        <circle cx="28" cy="72" r="3" fill="#a7f3d0" />
        <circle cx="100" cy="68" r="2.5" fill="#fde68a" />
        <circle cx="92" cy="95" r="2" fill="#bae6fd" />
      </g>
    </svg>
  );
}

/** Liane en S avec bourgeon. */
function VineVisitMascotSvg() {
  return (
    <svg className="visit-vine-svg" viewBox="0 0 128 148" role="presentation" focusable="false">
      <ellipse cx="64" cy="140" rx="28" ry="6" fill="rgba(26,71,49,0.15)" />
      <g className="visit-vine-body">
        <path
          d="M88 128 Q40 108 52 78 Q64 48 40 28 Q32 18 48 14"
          fill="none"
          stroke="#166534"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M88 128 Q40 108 52 78 Q64 48 40 28 Q32 18 48 14"
          fill="none"
          stroke="#22c55e"
          strokeWidth="8"
          strokeLinecap="round"
          opacity="0.9"
        />
        <g className="visit-vine-bud">
          <circle cx="48" cy="14" r="14" fill="#bbf7d0" stroke="#1a4731" strokeWidth="3" />
          <path d="M48 6 L52 2 L56 8 Z" fill="#fbbf24" stroke="#1a4731" strokeWidth="1.5" />
          <circle cx="45" cy="16" r="2" fill="#1a4731" />
        </g>
      </g>
    </svg>
  );
}

/** Blob mousse multi-yeux. */
function MossVisitMascotSvg() {
  return (
    <svg className="visit-moss-svg" viewBox="0 0 128 148" role="presentation" focusable="false">
      <ellipse cx="64" cy="138" rx="32" ry="7" fill="rgba(26,71,49,0.2)" />
      <g className="visit-moss-body">
        <path
          d="M40 118 Q22 88 38 58 Q48 32 78 38 Q108 44 102 78 Q98 108 72 118 Q56 124 40 118 Z"
          fill="#4ade80"
          stroke="#14532d"
          strokeWidth="3.5"
        />
        <ellipse cx="58" cy="72" rx="38" ry="28" fill="#86efac" opacity="0.5" />
        <circle className="visit-moss-eye" cx="52" cy="68" r="7" fill="#fff" stroke="#1a4731" strokeWidth="2" />
        <circle className="visit-moss-eye" cx="78" cy="64" r="5" fill="#fff" stroke="#1a4731" strokeWidth="2" />
        <circle className="visit-moss-eye" cx="68" cy="88" r="4" fill="#fff" stroke="#1a4731" strokeWidth="1.8" />
        <circle cx="54" cy="69" r="3" fill="#1a4731" />
        <circle cx="79" cy="65" r="2.2" fill="#1a4731" />
        <circle cx="69" cy="89" r="2" fill="#1a4731" />
      </g>
    </svg>
  );
}

/** Graine fusée à une grande feuille. */
function SeedVisitMascotSvg() {
  return (
    <svg className="visit-seed-svg" viewBox="0 0 128 148" role="presentation" focusable="false">
      <ellipse cx="64" cy="140" rx="24" ry="5" fill="rgba(26,71,49,0.16)" />
      <g className="visit-seed-body">
        <path
          className="visit-seed-leaf"
          d="M72 48 Q110 20 118 52 Q100 70 72 58 Z"
          fill="#22c55e"
          stroke="#14532d"
          strokeWidth="3"
        />
        <ellipse cx="64" cy="92" rx="22" ry="48" fill="#d4a574" stroke="#1a4731" strokeWidth="3.5" />
        <path d="M64 52 Q52 92 64 132 Q76 92 64 52" fill="#c49a6c" opacity="0.6" />
        <ellipse cx="60" cy="82" rx="4" ry="5" fill="#1a4731" />
        <path d="M58 96 Q64 100 70 96" fill="none" stroke="#1a4731" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Nuage de lucioles en silhouette. */
function SwarmVisitMascotSvg() {
  return (
    <svg className="visit-swarm-svg" viewBox="0 0 128 148" role="presentation" focusable="false">
      <ellipse cx="64" cy="140" rx="26" ry="5" fill="rgba(26,71,49,0.12)" />
      <g className="visit-swarm-figure">
        <circle className="visit-swarm-dot" cx="64" cy="28" r="5" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
        <circle className="visit-swarm-dot" cx="48" cy="48" r="4" fill="#a7f3d0" stroke="#166534" strokeWidth="1.2" />
        <circle className="visit-swarm-dot" cx="80" cy="46" r="4" fill="#bae6fd" stroke="#0369a1" strokeWidth="1.2" />
        <circle className="visit-swarm-dot" cx="40" cy="72" r="3.5" fill="#fde68a" stroke="#b45309" strokeWidth="1" />
        <circle className="visit-swarm-dot" cx="88" cy="70" r="3.5" fill="#fbcfe8" stroke="#be185d" strokeWidth="1" />
        <circle className="visit-swarm-dot" cx="56" cy="92" r="4" fill="#fef9c3" stroke="#ca8a04" strokeWidth="1.2" />
        <circle className="visit-swarm-dot" cx="72" cy="90" r="4" fill="#d9f99d" stroke="#4d7c0f" strokeWidth="1.2" />
        <circle className="visit-swarm-dot" cx="52" cy="118" r="3" fill="#fef08a" stroke="#ca8a04" strokeWidth="1" />
        <circle className="visit-swarm-dot" cx="76" cy="118" r="3" fill="#a7f3d0" stroke="#166534" strokeWidth="1" />
        <line x1="64" y1="33" x2="52" y2="48" stroke="rgba(254,240,138,0.5)" strokeWidth="1" />
        <line x1="64" y1="33" x2="76" y2="46" stroke="rgba(254,240,138,0.5)" strokeWidth="1" />
        <line x1="48" y1="52" x2="56" y2="88" stroke="rgba(167,243,208,0.45)" strokeWidth="1" />
        <line x1="80" y1="50" x2="72" y2="86" stroke="rgba(186,230,253,0.45)" strokeWidth="1" />
      </g>
    </svg>
  );
}

/**
 * @param {object} props
 * @param {'gnome'|'spore'|'vine'|'moss'|'seed'|'swarm'} props.silhouette
 * @param {string} [props.variant] — pour silhouette gnome : forest | amber | punk
 */
function VisitMascotFallbackSvg({ silhouette = 'gnome', variant = 'forest' }) {
  switch (silhouette) {
    case 'spore':
      return <SporeVisitMascotSvg />;
    case 'vine':
      return <VineVisitMascotSvg />;
    case 'moss':
      return <MossVisitMascotSvg />;
    case 'seed':
      return <SeedVisitMascotSvg />;
    case 'swarm':
      return <SwarmVisitMascotSvg />;
    case 'gnome':
    default:
      return <GnomeVisitMascotSvg variant={variant} />;
  }
}

/** Compat : ancien nom = gnome uniquement. */
function DefaultVisitMascotStaticSvg(props) {
  return <VisitMascotFallbackSvg silhouette="gnome" {...props} />;
}

export default VisitMascotFallbackSvg;
export {
  VisitMascotFallbackSvg,
  DefaultVisitMascotStaticSvg,
  GnomeVisitMascotSvg,
  SporeVisitMascotSvg,
  VineVisitMascotSvg,
  MossVisitMascotSvg,
  SeedVisitMascotSvg,
  SwarmVisitMascotSvg,
};
