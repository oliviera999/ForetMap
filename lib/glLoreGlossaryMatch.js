'use strict';

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

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeMatchKey(value) {
  return asTrimmedString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

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

function filterLoreGlossaryList(rows, { categorie, niveau, q, chapitreScope, maxSpoilerLevel, isMj }) {
  const query = normalizeMatchKey(q);
  const maxLevel = maxSpoilerLevel || 'secret';
  return (rows || []).filter((row) => {
    if (categorie && row.categorie !== categorie) return false;
    if (niveau && row.niveau !== niveau) return false;
    if (chapitreScope && row.chapitre_scope !== 'tous' && row.chapitre_scope !== chapitreScope) {
      return false;
    }
    if (!isMj && row.niveau === 'secret') return false;
    if (!isMj && !isLoreNiveauAllowed(row.niveau, maxLevel)) return false;
    if (!query) return true;
    const hay = normalizeMatchKey([
      row.lore_code,
      row.terme,
      row.variantes,
      row.definition_courte,
    ].join(' '));
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
};
