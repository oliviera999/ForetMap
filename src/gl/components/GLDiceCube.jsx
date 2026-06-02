import React from 'react';

const PIP_POSITIONS = {
  1: ['center'],
  2: ['tl', 'br'],
  3: ['tl', 'center', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'center', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
};

export function GLDiceCube({
  value = null,
  rolling = false,
  staggerIndex = 0,
  placeholder = false,
}) {
  const face = value != null && value >= 1 && value <= 6 ? value : null;
  const displayFace = face ?? 1;
  const positions = PIP_POSITIONS[displayFace] || PIP_POSITIONS[1];

  const classNames = ['gl-dice-cube'];
  if (rolling) classNames.push('is-rolling');
  if (placeholder) classNames.push('is-placeholder');
  if (face != null && !rolling) classNames.push(`is-face-${face}`);

  const style = rolling
    ? { '--gl-dice-stagger': `${staggerIndex * 0.08}s` }
    : undefined;

  return (
    <div
      className={classNames.join(' ')}
      style={style}
      aria-hidden={placeholder && !rolling}
      data-testid={placeholder ? 'gl-dice-cube-placeholder' : 'gl-dice-cube'}
      data-value={face ?? ''}
    >
      <div className="gl-dice-cube__inner">
        {positions.map((pos) => (
          <span key={pos} className={`gl-dice-cube__pip gl-dice-cube__pip--${pos}`} />
        ))}
      </div>
    </div>
  );
}
