'use strict';

// =====================================================================
// Phase 2 — Moteur de SUGGESTION de liens « ressource <-> question ».
// 100 % pur (aucun acces BDD). A partir du texte des questions (enonce + tags +
// mots-cles) et des libelles des ressources (terme/variantes, noms d'especes,
// titres de feuillets/tutoriels...), propose des liens candidats avec un score de
// confiance et une raison. Les liens structures (quiz_question_*, *_glossary,
// photo_species_id, biome_slug...) sont deja repris par les migrations 144/145 ;
// ce moteur ajoute les rapprochements TEXTUELS, a valider par le prof/MJ
// (origin='auto', status='suggested'). Le script scripts/suggest-learning-links.js
// l'alimente depuis la BDD.
// =====================================================================

// Mots grammaticaux frequents : un libelle reduit a ces seuls tokens est ignore
// (evite de relier "le", "des", "eau" partout). On NE filtre PAS les termes du
// domaine : seuls des mots-outils + une borne de longueur minimale.
const STOPWORDS = new Set([
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'de',
  'du',
  'dans',
  'sur',
  'par',
  'pour',
  'avec',
  'sans',
  'et',
  'ou',
  'au',
  'aux',
  'en',
  'est',
  'sont',
  'qui',
  'que',
  'quoi',
  'dont',
  'ce',
  'ces',
  'cet',
  'cette',
  'son',
  'sa',
  'ses',
  'leur',
  'leurs',
  'the',
  'of',
  'and',
  'to',
  'for',
  'with',
  'a',
  'an',
]);

const MIN_LABEL_CHARS = 4; // longueur minimale (hors espaces) d'un libelle exploitable
const MAX_CONFIDENCE = 0.92; // les liens textuels ne valent jamais 1.0 (reserve aux liens structures)

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Normalise un texte : sans accents, minuscules, alphanumerique -> espaces. */
function normalizeText(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tokenise un texte normalise en mots. */
function tokenize(value) {
  const n = normalizeText(value);
  return n ? n.split(' ').filter(Boolean) : [];
}

/** Decoupe un champ "variantes" multi-valeurs (separateurs , ; / |). */
function splitLabelVariants(raw) {
  return String(raw == null ? '' : raw)
    .split(/[,;/|]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Confiance de base d'un libelle selon sa specificite (longueur, multi-mots). */
function labelWeight(tokens, chars) {
  let w = 0.4 + Math.min(0.4, 0.04 * Math.max(0, chars - MIN_LABEL_CHARS));
  if (tokens.length >= 2) w += 0.1; // expression multi-mots : plus specifique
  return round2(Math.min(MAX_CONFIDENCE, w));
}

/**
 * Construit les "entrees" exploitables a partir des ressources.
 * @param {Array<{type:string, ref:string|number, labels:string[]}>} resources
 * @returns {Array<{type, ref, tokens, label, chars, weight}>}
 */
function buildResourceEntries(resources, { minLabelChars = MIN_LABEL_CHARS } = {}) {
  const entries = [];
  for (const r of Array.isArray(resources) ? resources : []) {
    if (!r || r.ref == null) continue;
    const seen = new Set();
    for (const raw of r.labels || []) {
      for (const label of splitLabelVariants(raw)) {
        const tokens = tokenize(label);
        if (!tokens.length) continue;
        const chars = tokens.join('').length;
        if (chars < minLabelChars) continue;
        if (tokens.every((t) => STOPWORDS.has(t))) continue;
        const key = tokens.join(' ');
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({
          type: String(r.type),
          ref: String(r.ref),
          tokens,
          label: key,
          chars,
          weight: labelWeight(tokens, chars),
        });
      }
    }
  }
  return entries;
}

/** Index par premier token (acceleration du matching). */
function indexEntries(entries) {
  const byFirst = new Map();
  for (const e of entries) {
    const k = e.tokens[0];
    if (!byFirst.has(k)) byFirst.set(k, []);
    byFirst.get(k).push(e);
  }
  return byFirst;
}

/** Meilleure entree (par ressource) dont la sequence de tokens apparait dans la question. */
function matchTokens(qTokens, byFirst) {
  const best = new Map(); // "type|ref" -> entry
  for (let i = 0; i < qTokens.length; i += 1) {
    const cands = byFirst.get(qTokens[i]);
    if (!cands) continue;
    for (const e of cands) {
      if (i + e.tokens.length > qTokens.length) continue;
      let ok = true;
      for (let j = 1; j < e.tokens.length; j += 1) {
        if (qTokens[i + j] !== e.tokens[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const key = `${e.type}|${e.ref}`;
      const prev = best.get(key);
      if (!prev || e.weight > prev.weight) best.set(key, e);
    }
  }
  return best;
}

function existKeyFor(dataset, type, ref, code) {
  return dataset ? `${dataset}|${type}|${ref}|${code}` : `${type}|${ref}|${code}`;
}

/**
 * Propose des liens candidats.
 * @param {object} params
 * @param {Array<{code:string, text?:string, tags?:string, mots_cles?:string, extra?:string}>} params.questions
 * @param {Array} params.resources  cf. buildResourceEntries
 * @param {Set<string>} [params.existing]  cles existKeyFor a exclure (liens deja presents, tous statuts)
 * @param {number} [params.minConfidence]  seuil (defaut 0.5)
 * @param {string|null} [params.dataset]  'qcm' | 'qcm_lore' cote GL ; null cote ForetMap
 * @param {number} [params.maxPerQuestion]  plafond de suggestions par question (defaut 8)
 * @returns {Array<object>} liens { question_dataset?, resource_type, resource_ref, question_code, confidence, origin, status, reason }
 */
function suggestLinks({
  questions,
  resources,
  existing = new Set(),
  minConfidence = 0.5,
  dataset = null,
  maxPerQuestion = 8,
  minLabelChars = MIN_LABEL_CHARS,
} = {}) {
  const entries = buildResourceEntries(resources, { minLabelChars });
  const byFirst = indexEntries(entries);
  const out = [];
  for (const q of Array.isArray(questions) ? questions : []) {
    if (!q || !q.code) continue;
    const qTokens = tokenize([q.text, q.tags, q.mots_cles, q.extra].filter(Boolean).join(' '));
    if (!qTokens.length) continue;
    const matches = matchTokens(qTokens, byFirst);
    const ranked = [...matches.values()]
      .map((e) => ({ entry: e, confidence: e.weight }))
      .filter((m) => m.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence || a.entry.label.localeCompare(b.entry.label))
      .slice(0, Math.max(1, maxPerQuestion));
    for (const m of ranked) {
      const key = existKeyFor(dataset, m.entry.type, m.entry.ref, q.code);
      if (existing.has(key)) continue;
      const link = {
        resource_type: m.entry.type,
        resource_ref: m.entry.ref,
        question_code: String(q.code),
        confidence: m.confidence,
        origin: 'auto',
        status: 'suggested',
        reason: `text_match:${m.entry.label}`.slice(0, 255),
      };
      if (dataset) link.question_dataset = dataset;
      out.push(link);
    }
  }
  return out;
}

module.exports = {
  STOPWORDS,
  MIN_LABEL_CHARS,
  MAX_CONFIDENCE,
  normalizeText,
  tokenize,
  splitLabelVariants,
  labelWeight,
  buildResourceEntries,
  indexEntries,
  matchTokens,
  existKeyFor,
  suggestLinks,
};
