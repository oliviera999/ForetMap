'use strict';

// =====================================================================
// Catalogue COMMUN des reglages du conditionnement des lectures (ForetMap + GL).
//
// Les deux produits definissaient chacun les memes reglages, dans deux fichiers
// distincts, avec des bornes ecrites deux fois et — surtout — des perimetres qui
// avaient fini par diverger : GL avait la granularite que ForetMap n'avait pas,
// ForetMap avait la tolerance d'essais et le plafond par session que GL n'avait
// pas. Un reglage ajoute d'un cote restait invisible de l'autre.
//
// Ici, un seul descripteur par reglage : type, bornes, defaut, et la CLE de chaque
// produit. Ajouter une ligne l'ajoute aux deux. Les stockages restent distincts
// (`app_settings` pour ForetMap, `gl_settings` pour GL) — c'est la semantique qui
// est mutualisee, pas la table.
//
// 100 % pur : aucun acces BDD, aucun etat.
// =====================================================================

const GATING_MODE_VALUES = Object.freeze(['off', 'any', 'all', 'threshold']);
const GATING_GRANULARITY_VALUES = Object.freeze(['player', 'team', 'per_resource']);
/** Portee du verrou pose apres une erreur : toute la ressource, ou la seule question ratee. */
const COOLDOWN_SCOPE_VALUES = Object.freeze(['resource', 'question']);

/**
 * Descripteurs des reglages. `fmKey`/`glKey` a null = reglage propre a un produit.
 *
 * `auto_mark_on_correct` a ete RETIRE : lu et expose des deux cotes, il n'etait
 * consulte par aucune decision depuis le retrait de l'auto-marquage. Un reglage
 * visible qui ne fait rien use la confiance dans tous les autres.
 *
 * PAS de `respect_learner_level` ici, malgre le constat C6 de l'audit (une question
 * « lycee » peut bloquer un eleve de college) : la table `users` ne porte AUCUN
 * niveau scolaire — ni colonne, ni groupe qui en tienne lieu. Les paliers RBAC
 * (novice / avance / chevronne) mesurent les taches validees, pas le niveau. Livrer
 * l'interrupteur sans la donnee ferait un second reglage sans effet. Il faut d'abord
 * decider d'ou vient le niveau d'un eleve.
 *
 * `announceOnButton` et `stateIcons` sont des reglages de PRESENTATION : ils ne changent
 * rien a la decision de conditionnement, seulement a ce que le lecteur en voit avant de
 * cliquer. Ils sont de portee prof, donc illisibles par un eleve : les routes
 * `gating/challenge` et `gating/summary` les resolvent cote serveur et les renvoient dans
 * leur reponse, plutot que d'ouvrir l'acces aux reglages.
 */
const GATING_SETTING_DEFS = Object.freeze({
  enabled: {
    type: 'boolean',
    default: false,
    fmKey: 'learning.gating.enabled',
    glKey: 'gating.enabled',
  },
  defaultMode: {
    type: 'enum',
    values: GATING_MODE_VALUES,
    default: 'any',
    fmKey: 'learning.gating.default_mode',
    glKey: 'gating.default_mode',
  },
  defaultRequiredCorrect: {
    type: 'number',
    min: 1,
    max: 50,
    default: 1,
    fmKey: 'learning.gating.default_required_correct',
    glKey: 'gating.default_required_correct',
  },
  allowedWrongAttempts: {
    type: 'number',
    min: 0,
    max: 10,
    default: 0,
    fmKey: 'learning.gating.allowed_wrong_attempts',
    glKey: 'gating.allowed_wrong_attempts',
  },
  retryCooldownDays: {
    type: 'number',
    min: 0,
    max: 365,
    default: 3,
    fmKey: 'learning.gating.retry_cooldown_days',
    glKey: 'gating.retry_cooldown_days',
  },
  cooldownScope: {
    type: 'enum',
    values: COOLDOWN_SCOPE_VALUES,
    default: 'resource',
    fmKey: 'learning.gating.cooldown_scope',
    glKey: 'gating.cooldown_scope',
  },
  maxQuestionsPerSession: {
    type: 'number',
    min: 1,
    max: 10,
    default: 3,
    fmKey: 'learning.gating.max_questions_per_session',
    glKey: 'gating.max_questions_per_session',
  },
  announceOnButton: {
    type: 'boolean',
    default: true,
    fmKey: 'learning.gating.announce_on_button',
    glKey: 'gating.announce_on_button',
  },
  stateIcons: {
    type: 'boolean',
    default: true,
    fmKey: 'learning.gating.state_icons',
    glKey: 'gating.state_icons',
  },
  granularity: {
    type: 'enum',
    values: GATING_GRANULARITY_VALUES,
    default: 'player',
    // ForetMap n'a pas d'equipes : la granularite y resterait sans effet, et un
    // reglage sans effet est exactement ce qu'on vient de retirer.
    fmKey: null,
    glKey: 'gating.granularity',
  },
});

const GATING_SETTING_NAMES = Object.freeze(Object.keys(GATING_SETTING_DEFS));

/** Cles de stockage d'un produit, dans l'ordre du catalogue. */
function gatingKeysFor(product) {
  const field = String(product).toLowerCase() === 'gl' ? 'glKey' : 'fmKey';
  return GATING_SETTING_NAMES.map((name) => GATING_SETTING_DEFS[name][field]).filter(Boolean);
}

/** Nom logique correspondant a une cle de stockage, ou null. */
function gatingNameForKey(product, key) {
  const field = String(product).toLowerCase() === 'gl' ? 'glKey' : 'fmKey';
  return GATING_SETTING_NAMES.find((name) => GATING_SETTING_DEFS[name][field] === key) || null;
}

function asBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

/**
 * Normalise UNE valeur selon son descripteur : bornage numerique, valeur d'enum
 * connue, booleen tolerant aux formes '1'/'true'. Toute valeur inexploitable
 * retombe sur le defaut — un reglage illisible ne doit jamais casser une lecture.
 */
function normalizeGatingSetting(name, value) {
  const def = GATING_SETTING_DEFS[name];
  if (!def) return undefined;
  if (value == null || value === '') return def.default;

  if (def.type === 'boolean') return asBoolean(value, def.default);
  if (def.type === 'enum') {
    const v = String(value).trim().toLowerCase();
    return def.values.includes(v) ? v : def.default;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return def.default;
  return Math.max(def.min, Math.min(def.max, Math.floor(n)));
}

/**
 * Construit l'objet de reglages effectifs a partir de valeurs brutes indexees par
 * NOM LOGIQUE. Les reglages absents prennent leur defaut ; ceux qui n'existent pas
 * pour le produit demande sont omis.
 * @param {object} raw valeurs brutes par nom logique
 * @param {'fm'|'gl'} [product]
 */
function buildGatingSettings(raw = {}, product = 'fm') {
  const field = String(product).toLowerCase() === 'gl' ? 'glKey' : 'fmKey';
  const out = {};
  for (const name of GATING_SETTING_NAMES) {
    if (!GATING_SETTING_DEFS[name][field]) continue;
    out[name] = normalizeGatingSetting(name, raw[name]);
  }
  return out;
}

/** Valide une ecriture : `{ ok, value }` ou `{ ok:false, error }`. */
function validateGatingSetting(name, value) {
  const def = GATING_SETTING_DEFS[name];
  if (!def) return { ok: false, error: 'Réglage de conditionnement inconnu' };
  if (def.type === 'boolean') {
    const b = asBoolean(value, null);
    if (b == null) return { ok: false, error: 'Valeur booléenne attendue' };
    return { ok: true, value: b };
  }
  if (def.type === 'enum') {
    const v = String(value == null ? '' : value)
      .trim()
      .toLowerCase();
    if (!def.values.includes(v)) {
      return { ok: false, error: `Valeur attendue parmi : ${def.values.join(', ')}` };
    }
    return { ok: true, value: v };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return { ok: false, error: 'Valeur numérique attendue' };
  if (n < def.min || n > def.max) {
    return { ok: false, error: `Valeur attendue entre ${def.min} et ${def.max}` };
  }
  return { ok: true, value: Math.floor(n) };
}

/** Le verrou porte-t-il sur la seule question ratée ? */
function isQuestionScopedCooldown(settings) {
  return normalizeGatingSetting('cooldownScope', settings?.cooldownScope) === 'question';
}

module.exports = {
  GATING_SETTING_DEFS,
  GATING_SETTING_NAMES,
  GATING_MODE_VALUES,
  GATING_GRANULARITY_VALUES,
  COOLDOWN_SCOPE_VALUES,
  gatingKeysFor,
  gatingNameForKey,
  normalizeGatingSetting,
  buildGatingSettings,
  validateGatingSetting,
  isQuestionScopedCooldown,
};
