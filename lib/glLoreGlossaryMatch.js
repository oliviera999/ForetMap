'use strict';

const { asTrimmedString } = require('./shared/stringHelpers');
const {
  normalizeMatchKey,
  tokenizeCsvLike,
  buildLookupMap,
  matchTermsForKeywords,
} = require('./shared/glossaryNormalization');

/**
 * Glossaire lore : normalisation/lookup/matching partagés avec le glossaire
 * SVT via `lib/shared/glossaryNormalization.js` (audit §4.2, paire 1.5) ;
 * champ code ici : `lore_code`. `buildTermToCodeMap` reste local : sa variante
 * lore tokenise aussi le `terme` sur les séparateurs CSV (divergence assumée
 * avec la variante SVT de `glossaryMatch.js`).
 */

const LORE_GLOSSARY_CATEGORIES = [
  'cosmologie',
  'menace',
  'peuple',
  'personnage',
  'creature',
  'objet',
  'lieu',
  'rituel',
  'concept',
  'epoque',
];

const LORE_GLOSSARY_CATEGORY_LABELS = {
  cosmologie: 'Cosmologie',
  menace: 'Menace',
  peuple: 'Peuple',
  personnage: 'Personnage',
  creature: 'Créature',
  objet: 'Objet',
  lieu: 'Lieu',
  rituel: 'Rituel',
  concept: 'Concept',
  epoque: 'Époque',
};

const LORE_NIVEAUX = ['cle', 'recit', 'secret'];

const LORE_NIVEAU_LABELS = {
  cle: 'Clé',
  recit: 'Récit',
  secret: 'Secret',
};

function buildTermToCodeMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const code = asTrimmedString(row.lore_code);
    if (!code) continue;
    const labels = [row.terme, row.variantes].filter(Boolean);
    for (const label of labels) {
      for (const part of String(label).split(/[,;|\n]+/)) {
        const key = normalizeMatchKey(part);
        if (key && !map.has(key)) map.set(key, code);
      }
    }
    const mainKey = normalizeMatchKey(row.terme);
    if (mainKey) map.set(mainKey, code);
  }
  return map;
}

function resolveRelatedLoreCodes(termesLies, termToCode) {
  const codes = new Set();
  const raw = asTrimmedString(termesLies);
  if (!raw) return [];
  for (const part of raw.split(/[,;|\n]+/)) {
    const key = normalizeMatchKey(part);
    if (!key) continue;
    const code = termToCode.get(key);
    if (code) codes.add(code);
  }
  return [...codes];
}

function normalizeLoreCategorie(value) {
  const s = asTrimmedString(value).toLowerCase();
  return LORE_GLOSSARY_CATEGORIES.includes(s) ? s : null;
}

function normalizeLoreNiveau(value) {
  const s = asTrimmedString(value).toLowerCase();
  return LORE_NIVEAUX.includes(s) ? s : null;
}

function normalizeChapitreScope(value) {
  const s = asTrimmedString(value);
  if (!s) return 'tous';
  const lower = s.toLowerCase();
  if (lower === 'tous') return 'tous';
  if (lower === 'mj') return 'MJ';
  if (lower === 'fin') return 'fin';
  return s;
}

function compareLoreNiveau(a, b) {
  const order = { cle: 0, recit: 1, secret: 2 };
  return (order[a] ?? 1) - (order[b] ?? 1);
}

function isLoreNiveauAllowed(termNiveau, maxLevel) {
  return compareLoreNiveau(termNiveau, maxLevel) <= 0;
}

const buildLoreGlossaryLookupMap = buildLookupMap;

function matchLoreGlossaryTermsForText(motsCles, glossaryByKey) {
  return matchTermsForKeywords(motsCles, glossaryByKey, {
    codeField: 'lore_code',
    toItem: (entry) => ({
      lore_code: entry.lore_code,
      terme: entry.terme,
      categorie: entry.categorie,
      definition_courte: entry.definition_courte,
      niveau: entry.niveau,
    }),
  });
}

/**
 * Un terme est-il visible de ce lecteur ? Le MJ voit tout ; un joueur ne voit ni les termes
 * « secret », ni ceux au-dessus du plafond de divulgâchage (`gameplay.loreSpoilerMaxLevel`).
 * Règle unique de la liste, de la fiche, des termes liés, de l'index des liens et des termes
 * joints aux questions.
 */
function isLoreTermVisibleToAudience(row, { isMj = false, maxSpoilerLevel } = {}) {
  if (isMj) return true;
  if (!row || row.niveau === 'secret') return false;
  return isLoreNiveauAllowed(row.niveau, maxSpoilerLevel || 'secret');
}

function filterLoreGlossaryRowsForAudience(rows, audience = {}) {
  return (rows || []).filter((row) => isLoreTermVisibleToAudience(row, audience));
}

function filterLoreGlossaryList(
  rows,
  { categorie, niveau, q, chapitreScope, maxSpoilerLevel, isMj },
) {
  const query = normalizeMatchKey(q);
  const maxLevel = maxSpoilerLevel || 'secret';
  return (rows || []).filter((row) => {
    if (categorie && row.categorie !== categorie) return false;
    if (niveau && row.niveau !== niveau) return false;
    if (chapitreScope && row.chapitre_scope !== 'tous' && row.chapitre_scope !== chapitreScope) {
      return false;
    }
    if (!isLoreTermVisibleToAudience(row, { isMj, maxSpoilerLevel: maxLevel })) return false;
    if (!query) return true;
    const hay = normalizeMatchKey(
      [row.lore_code, row.terme, row.variantes, row.definition_courte].join(' '),
    );
    return hay.includes(query);
  });
}

module.exports = {
  LORE_GLOSSARY_CATEGORIES,
  LORE_GLOSSARY_CATEGORY_LABELS,
  LORE_NIVEAUX,
  LORE_NIVEAU_LABELS,
  asTrimmedString,
  normalizeMatchKey,
  buildTermToCodeMap,
  resolveRelatedLoreCodes,
  normalizeLoreCategorie,
  normalizeLoreNiveau,
  normalizeChapitreScope,
  isLoreNiveauAllowed,
  compareLoreNiveau,
  filterLoreGlossaryList,
  filterLoreGlossaryRowsForAudience,
  isLoreTermVisibleToAudience,
  tokenizeCsvLike,
  buildLoreGlossaryLookupMap,
  matchLoreGlossaryTermsForText,
};
