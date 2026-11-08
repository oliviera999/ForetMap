'use strict';

/**
 * Statistiques pures du banc : médiane, quantiles, Spearman (rangs moyens en cas d'égalité),
 * Gini. Toutes tolèrent les listes vides (`null`) et ignorent les valeurs non finies.
 */

/** Valeurs numériques finies (`null`, `undefined`, `''` et `NaN` écartés : `Number(null)` vaut 0). */
function nombres(values) {
  return (Array.isArray(values) ? values : [])
    .filter((v) => v != null && v !== '' && typeof v !== 'boolean')
    .map(Number)
    .filter((v) => Number.isFinite(v));
}

function moyenne(values) {
  const xs = nombres(values);
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Quantile linéaire (type 7, comme numpy par défaut) ; `p` dans [0, 1]. */
function quantile(values, p) {
  const xs = nombres(values).sort((a, b) => a - b);
  if (!xs.length) return null;
  const pos = (xs.length - 1) * Math.min(1, Math.max(0, Number(p)));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return xs[lo];
  return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

function mediane(values) {
  return quantile(values, 0.5);
}

/** Rangs moyens (1-based) avec gestion des égalités. */
function rangs(values) {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(values.length);
  let k = 0;
  while (k < idx.length) {
    let j = k;
    while (j + 1 < idx.length && idx[j + 1].v === idx[k].v) j += 1;
    const r = (k + j) / 2 + 1;
    for (let m = k; m <= j; m += 1) out[idx[m].i] = r;
    k = j + 1;
  }
  return out;
}

/** Corrélation de Pearson. */
function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = moyenne(xs);
  const my = moyenne(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

/** Corrélation de rang de Spearman (`null` sous deux paires). */
function spearman(xs, ys) {
  const n = Math.min((xs || []).length, (ys || []).length);
  const px = [];
  const py = [];
  for (let i = 0; i < n; i += 1) {
    const x = Number(xs[i]);
    const y = Number(ys[i]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      px.push(x);
      py.push(y);
    }
  }
  if (px.length < 2) return null;
  return pearson(rangs(px), rangs(py));
}

/** Indice de Gini de valeurs positives ou nulles (0 = égalité parfaite). */
function gini(values) {
  const xs = nombres(values)
    .map((v) => Math.max(0, v))
    .sort((a, b) => a - b);
  const n = xs.length;
  if (!n) return null;
  const total = xs.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let cumul = 0;
  for (let i = 0; i < n; i += 1) cumul += (i + 1) * xs[i];
  return (2 * cumul) / (n * total) - (n + 1) / n;
}

/** Résumé `{ n, mediane, p10, p90, moyenne, min, max }` d'une liste. */
function resume(values) {
  const xs = nombres(values);
  if (!xs.length) {
    return { n: 0, mediane: null, p10: null, p90: null, moyenne: null, min: null, max: null };
  }
  return {
    n: xs.length,
    mediane: mediane(xs),
    p10: quantile(xs, 0.1),
    p90: quantile(xs, 0.9),
    moyenne: moyenne(xs),
    min: Math.min(...xs),
    max: Math.max(...xs),
  };
}

function pourcent(num, den) {
  if (!den) return null;
  return (100 * num) / den;
}

function arrondi(v, d = 1) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const f = 10 ** d;
  return Math.round(Number(v) * f) / f;
}

module.exports = {
  nombres,
  moyenne,
  quantile,
  mediane,
  rangs,
  pearson,
  spearman,
  gini,
  resume,
  pourcent,
  arrondi,
};
