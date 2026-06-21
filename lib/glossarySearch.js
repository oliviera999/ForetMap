'use strict';

function normalizeToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function variantLabels(terme, variantes) {
  const labels = [String(terme || '').trim()];
  for (const part of String(variantes || '').split(/[,;|\n]+/)) {
    const label = part.trim();
    if (label) labels.push(label);
  }
  return labels;
}

function glossaryTermMatchesQuery(term, rawQuery) {
  const q = normalizeToken(rawQuery);
  if (!q) return true;
  const labels = variantLabels(term.terme, term.variantes).map((label) => normalizeToken(label));
  if (labels.some((label) => label.includes(q))) return true;
  const tokens = q.split(/[\s,;|/\\-]+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return false;
  return tokens.every((token) => labels.some((label) => label.includes(token)));
}

module.exports = {
  glossaryTermMatchesQuery,
  variantLabels,
};
