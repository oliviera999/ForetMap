'use strict';

/**
 * Normalisation et matching glossaire ↔ espèces (mots_cles).
 */

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

function tokenizeCsvLike(value) {
  const raw = asTrimmedString(value);
  if (!raw) return [];
  return raw
    .split(/[,;|\n]+/)
    .map((part) => normalizeMatchKey(part))
    .filter(Boolean);
}

function parseBiomesConcernes(value) {
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw || raw === 'tous') return { allBiomes: true, slugs: [] };
  const slugs = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { allBiomes: false, slugs };
}

/**
 * @param {string} motsCles
 * @param {Map<string, object>} glossaryByKey — clé normalisée → entrée glossaire
 * @returns {object[]}
 */
function matchGlossaryTermsForSpecies(motsCles, glossaryByKey) {
  const tokens = tokenizeCsvLike(motsCles);
  const seen = new Set();
  const out = [];
  for (const token of tokens) {
    const entry = glossaryByKey.get(token);
    if (!entry || seen.has(entry.glossary_code)) continue;
    seen.add(entry.glossary_code);
    out.push({
      glossary_code: entry.glossary_code,
      terme: entry.terme,
      categorie: entry.categorie,
      definition_courte: entry.definition_courte,
    });
  }
  return out.sort((a, b) => String(a.terme).localeCompare(String(b.terme), 'fr'));
}

/**
 * Construit une Map clé normalisée → terme glossaire (terme + variantes tokenisées).
 * @param {object[]} glossaryRows
 */
function buildGlossaryLookupMap(glossaryRows) {
  const map = new Map();
  for (const row of glossaryRows || []) {
    const keys = new Set([
      normalizeMatchKey(row.terme),
      ...tokenizeCsvLike(row.variantes),
    ]);
    for (const key of keys) {
      if (!key) continue;
      if (!map.has(key)) map.set(key, row);
    }
  }
  return map;
}

/**
 * Résout termes_lies CSV vers codes glossaire.
 * @param {string} termesLies
 * @param {Map<string, string>} termToCode — clé normalisée terme → glossary_code
 */
function resolveRelatedTermCodes(termesLies, termToCode) {
  const tokens = tokenizeCsvLike(termesLies);
  const codes = [];
  const seen = new Set();
  for (const token of tokens) {
    const code = termToCode.get(token);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

function buildTermToCodeMap(glossaryRows) {
  const map = new Map();
  for (const row of glossaryRows || []) {
    const code = String(row.glossary_code || '');
    if (!code) continue;
    map.set(normalizeMatchKey(row.terme), code);
    for (const v of tokenizeCsvLike(row.variantes)) {
      if (!map.has(v)) map.set(v, code);
    }
  }
  return map;
}

/**
 * Espèces dont mots_cles contient le terme (normalisé).
 * @param {object} glossaryTerm
 * @param {object[]} speciesRows
 */
function matchSpeciesForGlossaryTerm(glossaryTerm, speciesRows) {
  const termKey = normalizeMatchKey(glossaryTerm.terme);
  if (!termKey) return [];
  const out = [];
  for (const sp of speciesRows || []) {
    const tokens = tokenizeCsvLike(sp.mots_cles);
    if (tokens.includes(termKey)) {
      out.push({
        species_code: sp.species_code,
        nom_commun: sp.nom_commun,
        type: sp.type,
      });
    }
  }
  return out.sort((a, b) => String(a.nom_commun).localeCompare(String(b.nom_commun), 'fr'));
}

const GLOSSARY_CATEGORIES = [
  'ecologie',
  'climat',
  'faune',
  'flore',
  'biome',
  'ecosysteme',
  'conservation',
  'geographie',
  'geologie',
  'interaction',
  'methode_svt',
];

const GLOSSARY_CATEGORY_LABELS = {
  ecologie: 'Écologie',
  climat: 'Climat',
  faune: 'Faune',
  flore: 'Flore',
  biome: 'Biome',
  ecosysteme: 'Écosystème',
  conservation: 'Conservation',
  geographie: 'Géographie',
  geologie: 'Géologie',
  interaction: 'Interactions',
  methode_svt: 'Méthode SVT',
};

module.exports = {
  asTrimmedString,
  normalizeMatchKey,
  tokenizeCsvLike,
  parseBiomesConcernes,
  matchGlossaryTermsForSpecies,
  buildGlossaryLookupMap,
  resolveRelatedTermCodes,
  buildTermToCodeMap,
  matchSpeciesForGlossaryTerm,
  GLOSSARY_CATEGORIES,
  GLOSSARY_CATEGORY_LABELS,
};
