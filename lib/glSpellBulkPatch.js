'use strict';

/**
 * Construction & validation **pures** d'un patch d'édition en masse du catalogue de
 * sortilèges. Même contrat que `lib/glFeuilletBulkPatch.js` : liste blanche de champs,
 * coercition par champ, aucun I/O — sert la route bulk admin et ses tests.
 *
 * Champs éditables en masse (tous des ENUM : le lot sert justement à harmoniser des
 * réglages, pas à réécrire des textes de fiches un par un) :
 *   - caster_kind   ('any' | 'gnome' | 'unicorn')      peuple autorisé à lancer
 *   - approval_mode ('auto' | 'mj_required')           validation MJ avant débit
 *   - cast_scope    ('solo' | 'collective' | 'any')    périmètre solo/collectif
 *   - statut        ('officiel' | 'propose')
 *
 * Sémantique : un champ absent du patch n'est pas modifié ; une valeur vide ou
 * inconnue est une erreur (pas un retour au défaut) — l'édition en masse touche
 * potentiellement des dizaines de sorts, un silence y coûte cher.
 */

const {
  normalizeCasterKindOrNull,
  normalizeApprovalModeOrNull,
  normalizeCastScopeOrNull,
} = require('./glSpellOptions');

const BULK_FIELDS = ['caster_kind', 'approval_mode', 'cast_scope', 'statut'];

const SPELL_STATUTS = new Set(['officiel', 'propose']);

const FIELD_COERCERS = {
  caster_kind: {
    normalize: normalizeCasterKindOrNull,
    expected: "'any', 'gnome' ou 'unicorn'",
  },
  approval_mode: {
    normalize: normalizeApprovalModeOrNull,
    expected: "'auto' ou 'mj_required'",
  },
  cast_scope: {
    normalize: normalizeCastScopeOrNull,
    expected: "'solo', 'collective' ou 'any'",
  },
  statut: {
    normalize: (value) => {
      const s = String(value ?? '')
        .trim()
        .toLowerCase();
      return SPELL_STATUTS.has(s) ? s : null;
    },
    expected: "'officiel' ou 'propose'",
  },
};

/**
 * @param {object} raw patch brut (clés = colonnes)
 * @returns {{ patch: Record<string, string>, errors: Array<{field: string, error: string}> }}
 *   `patch` ne contient QUE les champs explicitement fournis et valides.
 */
function buildSpellBulkPatch(raw = {}) {
  const patch = {};
  const errors = [];
  for (const field of BULK_FIELDS) {
    if (!(field in (raw || {}))) continue; // champ non fourni => non modifié
    const value = FIELD_COERCERS[field].normalize(raw[field]);
    if (value == null) {
      errors.push({ field, error: `${field} doit valoir ${FIELD_COERCERS[field].expected}` });
    } else {
      patch[field] = value;
    }
  }
  return { patch, errors };
}

/**
 * Construit le fragment SQL `col = ?, …` + params pour un patch partiel.
 * @returns {{ setSql: string, params: string[], columns: string[] }}
 */
function buildSpellBulkUpdateSql(patch = {}) {
  const columns = Object.keys(patch).filter((k) => BULK_FIELDS.includes(k));
  const setSql = columns.map((c) => `${c} = ?`).join(', ');
  const params = columns.map((c) => patch[c]);
  return { setSql, params, columns };
}

module.exports = {
  BULK_FIELDS,
  buildSpellBulkPatch,
  buildSpellBulkUpdateSql,
};
