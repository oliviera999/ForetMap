'use strict';

/**
 * Options de comportement d'un sortilège, portées par des colonnes ENUM de `gl_spells` :
 *
 * - `caster_kind`   — peuple autorisé à lancer : `any` | `gnome` | `unicorn` ;
 * - `approval_mode` — validation MJ avant débit : `auto` | `mj_required` ;
 * - `cast_scope`    — périmètre de lancement : `solo` | `collective` | `any`.
 *
 * Le peuple d'un lanceur n'est pas porté par le joueur mais par **son équipe**
 * (`gl_teams.type` = 'gnome' | 'unicorn') : on réutilise donc le même vocabulaire.
 *
 * Module pur (aucune I/O) : sert `lib/glSpellCast.js`, les routes d'admin, l'import
 * XLSX et leurs tests. Le miroir front vit dans `src/gl/utils/glSpellFieldLabels.js`
 * pour les libellés seulement — la règle d'autorisation reste ici, côté serveur.
 */

const CASTER_KINDS = ['any', 'gnome', 'unicorn'];
const CASTER_KIND_SET = new Set(CASTER_KINDS);

/** Alias tolérés à l'import XLSX / saisie libre (français comme anglais). */
const CASTER_KIND_ALIASES = new Map([
  ['', 'any'],
  ['any', 'any'],
  ['tous', 'any'],
  ['tout', 'any'],
  ['toutes', 'any'],
  ['both', 'any'],
  ['les deux', 'any'],
  ['gnomes et licornes', 'any'],
  ['gnome et licorne', 'any'],
  ['aucune', 'any'],
  ['aucune restriction', 'any'],
  ['gnome', 'gnome'],
  ['gnomes', 'gnome'],
  ['unicorn', 'unicorn'],
  ['unicorns', 'unicorn'],
  ['licorne', 'unicorn'],
  ['licornes', 'unicorn'],
]);

const CASTER_KIND_LABELS = {
  any: 'Gnomes et licornes',
  gnome: 'Gnomes uniquement',
  unicorn: 'Licornes uniquement',
};

/** Libellé du peuple d'une équipe (`gl_teams.type`). */
const TEAM_TYPE_LABELS = {
  gnome: 'Gnomes',
  unicorn: 'Licornes',
};

/**
 * Normalise une valeur de `caster_kind` ; retourne `null` si la valeur est absente
 * (distinguer « absent » de « any » est nécessaire à l'import : une colonne manquante
 * ne doit pas écraser la restriction déjà en base).
 * @param {unknown} value
 * @returns {'any'|'gnome'|'unicorn'|null}
 */
function normalizeCasterKindOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  if (s === '') return null;
  return CASTER_KIND_ALIASES.get(s) || (CASTER_KIND_SET.has(s) ? s : null);
}

/**
 * Normalise une valeur de `caster_kind` en repliant tout inconnu sur `'any'`.
 * @param {unknown} value
 * @returns {'any'|'gnome'|'unicorn'}
 */
function normalizeCasterKind(value) {
  return normalizeCasterKindOrNull(value) || 'any';
}

/**
 * Normalise un type d'équipe (`gl_teams.type`). Retourne `null` si inconnu — un
 * peuple indéterminé ne peut satisfaire aucune restriction (cf. `isCasterKindAllowed`).
 * @param {unknown} value
 * @returns {'gnome'|'unicorn'|null}
 */
function normalizeTeamType(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  if (s === 'gnome' || s === 'gnomes') return 'gnome';
  if (s === 'unicorn' || s === 'unicorns' || s === 'licorne' || s === 'licornes') return 'unicorn';
  return null;
}

/**
 * Le peuple `teamType` peut-il lancer un sort restreint à `casterKind` ?
 * Un peuple indéterminé (`null`) est refusé dès qu'une restriction existe : mieux
 * vaut bloquer un lancement que laisser passer un contributeur non vérifiable.
 * @param {unknown} casterKind
 * @param {unknown} teamType
 * @returns {boolean}
 */
function isCasterKindAllowed(casterKind, teamType) {
  const kind = normalizeCasterKind(casterKind);
  if (kind === 'any') return true;
  return normalizeTeamType(teamType) === kind;
}

/** Libellé lisible d'une restriction (`caster_kind`). */
function casterKindLabel(value) {
  return CASTER_KIND_LABELS[normalizeCasterKind(value)];
}

/** Libellé lisible du peuple d'une équipe, ou `null` si indéterminé. */
function teamTypeLabel(value) {
  const type = normalizeTeamType(value);
  return type ? TEAM_TYPE_LABELS[type] : null;
}

const APPROVAL_MODES = ['auto', 'mj_required'];
const APPROVAL_MODE_ALIASES = new Map([
  ['auto', 'auto'],
  ['automatique', 'auto'],
  ['immediat', 'auto'],
  ['mj_required', 'mj_required'],
  ['mj', 'mj_required'],
  ['validation mj', 'mj_required'],
  ['approbation mj', 'mj_required'],
]);

const CAST_SCOPES = ['solo', 'collective', 'any'];
const CAST_SCOPE_ALIASES = new Map([
  ['any', 'any'],
  ['libre', 'any'],
  ['indifferent', 'any'],
  ['solo', 'solo'],
  ['seul', 'solo'],
  ['individuel', 'solo'],
  ['collective', 'collective'],
  ['collectif', 'collective'],
  ['groupe', 'collective'],
]);

/** Fabrique un normaliseur ENUM tolérant : `null` si absent, alias acceptés. */
function makeEnumNormalizer(values, aliases) {
  const allowed = new Set(values);
  return (value) => {
    if (value == null) return null;
    const s = String(value).trim().toLowerCase();
    if (s === '') return null;
    return aliases.get(s) || (allowed.has(s) ? s : null);
  };
}

const normalizeApprovalModeOrNull = makeEnumNormalizer(APPROVAL_MODES, APPROVAL_MODE_ALIASES);
const normalizeCastScopeOrNull = makeEnumNormalizer(CAST_SCOPES, CAST_SCOPE_ALIASES);

/** @returns {'auto'|'mj_required'} */
function normalizeApprovalMode(value) {
  return normalizeApprovalModeOrNull(value) || 'auto';
}

/** @returns {'solo'|'collective'|'any'} */
function normalizeCastScope(value) {
  return normalizeCastScopeOrNull(value) || 'any';
}

module.exports = {
  CASTER_KINDS,
  CASTER_KIND_LABELS,
  TEAM_TYPE_LABELS,
  APPROVAL_MODES,
  CAST_SCOPES,
  normalizeCasterKind,
  normalizeCasterKindOrNull,
  normalizeTeamType,
  isCasterKindAllowed,
  casterKindLabel,
  teamTypeLabel,
  normalizeApprovalMode,
  normalizeApprovalModeOrNull,
  normalizeCastScope,
  normalizeCastScopeOrNull,
};
