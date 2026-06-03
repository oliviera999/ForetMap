import React from 'react';

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
      <div className={numberClassName}>{value}</div>
      <div className={labelClassName}>{label}</div>
    </div>
  );
}

export function StatsSummaryGrid({
  children,
  className = 'stats-grid',
  style,
}) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
