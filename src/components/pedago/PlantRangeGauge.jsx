import React from 'react';

/**
 * Jauge visuelle min–max (pH, température °C, etc.).
 * @param {{ label: string, unit?: string, min: number, max: number, domainMin?: number, domainMax?: number, icon?: string }} props
 */
export function PlantRangeGauge({ label, unit = '', min, max, domainMin, domainMax, icon = '' }) {
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;

  const spanMin = domainMin != null && Number.isFinite(Number(domainMin)) ? Number(domainMin) : lo;
  const spanMax = domainMax != null && Number.isFinite(Number(domainMax)) ? Number(domainMax) : hi;
  const domainLo = Math.min(spanMin, lo, hi);
  const domainHi = Math.max(spanMax, lo, hi);
  const range = domainHi - domainLo || 1;
  const leftPct = ((Math.min(lo, hi) - domainLo) / range) * 100;
  const widthPct = ((Math.abs(hi - lo) || 0.01) / range) * 100;
  const single = lo === hi;

  return (
    <div className="pedago-range-gauge">
      <div className="pedago-range-gauge__label">
        {icon ? `${icon} ` : ''}
        {label}
      </div>
      <div className="pedago-range-gauge__track" aria-hidden="true">
        <div
          className={`pedago-range-gauge__fill${single ? ' pedago-range-gauge__fill--single' : ''}`}
          style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, single ? 2 : 4)}%` }}
        />
      </div>
      <div className="pedago-range-gauge__values">
        {single ? (
          <span>
            {lo}
            {unit}
          </span>
        ) : (
          <span>
            {lo}
            {unit} – {hi}
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
