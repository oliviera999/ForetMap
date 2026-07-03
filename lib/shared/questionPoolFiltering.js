'use strict';

/**
 * Filtres en mémoire communs aux pools de questions QCM des repères
 * (audit §4.2, paire 1.4). Ces helpers étaient recopiés ligne à ligne dans
 * `lib/glMarkerQuestionPool.js` (biomes) et `lib/glMarkerLoreQuestionPool.js`
 * (lore) ; source unique ici, les deux pools importent.
 */

/** Mélange de Fisher-Yates (copie, sans muter l'entrée). */
function fisherYates(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Filtre plein-texte (question + tags + mots_cles, insensible à la casse). */
function applyTextSearch(rows, searchQuery) {
  const q = String(searchQuery || '')
    .trim()
    .toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const hay = `${row.question || ''} ${row.tags || ''} ${row.mots_cles || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

/** Restreint aux codes question explicitement sélectionnés (liste vide = tout). */
function applySelectedCodes(rows, selectedQuestionCodes) {
  const selected = Array.isArray(selectedQuestionCodes)
    ? selectedQuestionCodes
        .map((c) =>
          String(c || '')
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean)
    : [];
  if (selected.length === 0) return rows;
  const allowed = new Set(selected);
  return rows.filter((row) => allowed.has(String(row.question_code || '').toUpperCase()));
}

/** Écarte les codes question exclus (déjà tirés, etc.) ; liste vide = tout. */
function applyExcludedCodes(rows, excludeCodes) {
  const exclude = new Set(
    (Array.isArray(excludeCodes) ? excludeCodes : [])
      .map((c) =>
        String(c || '')
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean),
  );
  if (exclude.size === 0) return rows;
  return rows.filter((row) => !exclude.has(String(row.question_code || '').toUpperCase()));
}

module.exports = {
  fisherYates,
  applyTextSearch,
  applySelectedCodes,
  applyExcludedCodes,
};
