import React from 'react';
import { useCountUp } from '../hooks/useCountUp.js';

function parseCountValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '')
    .trim()
    .replace(/\s/g, '');
  if (/^\d+$/.test(raw)) return Number(raw);
  return null;
}

function StatNumber({ value, animateCount, numberClassName }) {
  const numeric = parseCountValue(value);
  const { ref, value: animated } = useCountUp(numeric ?? 0, {
    enabled: animateCount && numeric != null,
  });
  const display = animateCount && numeric != null ? animated.toLocaleString('fr-FR') : value;
  return (
    <div ref={animateCount && numeric != null ? ref : undefined} className={numberClassName}>
      {display}
    </div>
  );
}

/**
 * Carte de statistique réutilisable (ForetMap + GL).
 * Les classes CSS par défaut ciblent le thème ForetMap ; passer gridClassName/cardClassName pour GL.
 * Les cartes utilisent l'animation partagée `statPop` (voir src/shared/styles/motion.css).
 */
export function StatCard({
  icon,
  value,
  label,
  highlight = false,
  title,
  animateCount = false,
  cardClassName = 'stat-card',
  highlightClassName = 'highlight',
  iconClassName = 'stat-icon',
  numberClassName = 'stat-number',
  labelClassName = 'stat-label',
}) {
  const classes = [cardClassName, highlight ? highlightClassName : ''].filter(Boolean).join(' ');
  return (
    <div className={classes} title={title || undefined}>
      {icon != null && icon !== '' ? <div className={iconClassName}>{icon}</div> : null}
      <StatNumber value={value} animateCount={animateCount} numberClassName={numberClassName} />
      <div className={labelClassName}>{label}</div>
    </div>
  );
}

export function StatsSummaryGrid({ children, className = 'stats-grid', style }) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
