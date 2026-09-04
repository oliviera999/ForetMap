'use strict';

// =====================================================================
// Noyau COMMUN des registres de réglages (ForetMap, GL, Plan).
//
// Un registre est un objet plat `{ clé: meta }` où chaque `meta` décrit un réglage :
//   { type: 'boolean'|'number'|'enum'|'string'|'json', default, [min, max], [values],
//     [maxLength], [shape], [validate], [normalize], [errorMessage], ...champs libres }
// Les champs libres (`scope`, `group`…) appartiennent au produit ; ce noyau ne les lit pas.
//
// `castValue` est extrait tel quel de `lib/settings.js` (mêmes messages d'erreur), puis étendu :
//   - type `'json'` : objet ou tableau JSON (chaîne JSON acceptée, parsée d'abord) ; `shape`
//     affine : `'object'` (objet non-tableau), `'array'`, `'any'` (toute valeur JSON — la forme
//     est alors laissée à `validate`) ; défaut : objet ou tableau ;
//   - `validate(casted, raw)` : contrôle supplémentaire après le cast de type ; renvoie un
//     message d'erreur (chaîne non vide) pour refuser, sinon `null`/`undefined` ;
//   - `normalize(casted, raw)` : transformation finale de la valeur acceptée (bornage, tri…) ;
//   - `errorMessage` : message UNIQUE substitué à tout message levé par le cast, `validate` ou
//     `normalize` — nécessaire pour conserver les messages historiques (validateurs GL).
//
// 100 % pur : aucun accès BDD, aucun état.
// =====================================================================

const gatingCore = require('./gatingSettingsCore');

const UNKNOWN_KEY_MESSAGE = 'Clé de réglage inconnue';

function hasOwn(object, key) {
  return !!object && Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Valeur stockée (`value_json`) → valeur JS ; une chaîne non-JSON est rendue telle quelle. */
function parseStoredJson(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function castJson(meta, value) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch (_) {
      parsed = value;
    }
  }
  const shape = meta.shape || 'object_or_array';
  if (shape === 'any') {
    if (parsed === undefined || typeof parsed === 'function' || typeof parsed === 'symbol') {
      throw new Error('Valeur JSON attendue');
    }
    return parsed;
  }
  if (shape === 'object') {
    if (!isPlainObject(parsed)) throw new Error('Objet JSON attendu');
    return parsed;
  }
  if (shape === 'array') {
    if (!Array.isArray(parsed)) throw new Error('Liste JSON attendue');
    return parsed;
  }
  if (!isPlainObject(parsed) && !Array.isArray(parsed)) {
    throw new Error('Objet ou tableau JSON attendu');
  }
  return parsed;
}

function castByType(meta, value) {
  if (meta.type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || value === 'true') return true;
    if (value === 0 || value === '0' || value === 'false') return false;
    throw new Error('Valeur booléenne attendue');
  }
  if (meta.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error('Valeur numérique attendue');
    const i = Math.round(n);
    if (meta.min != null && i < meta.min) throw new Error(`Valeur trop petite (min ${meta.min})`);
    if (meta.max != null && i > meta.max) throw new Error(`Valeur trop grande (max ${meta.max})`);
    return i;
  }
  if (meta.type === 'enum') {
    const s = normalizeString(value);
    if (!meta.values.includes(s)) throw new Error(`Valeur invalide: ${s}`);
    return s;
  }
  if (meta.type === 'string') {
    const s = normalizeString(value);
    if (meta.maxLength != null && s.length > meta.maxLength) {
      throw new Error(`Texte trop long (max ${meta.maxLength} caractères)`);
    }
    return s;
  }
  if (meta.type === 'json') return castJson(meta, value);
  throw new Error('Type de réglage non supporté');
}

/**
 * Convertit et valide une valeur candidate selon son descripteur.
 * Lève une `Error` (message historique, ou `meta.errorMessage` s'il est défini).
 */
function castValue(meta, value) {
  if (!meta) throw new Error(UNKNOWN_KEY_MESSAGE);
  try {
    let out = castByType(meta, value);
    if (typeof meta.validate === 'function') {
      const problem = meta.validate(out, value);
      if (problem) throw new Error(String(problem));
    }
    if (typeof meta.normalize === 'function') out = meta.normalize(out, value);
    return out;
  } catch (error) {
    if (meta.errorMessage) throw new Error(meta.errorMessage);
    throw error;
  }
}

/** Copie superficielle d'un défaut (tableau/objet) pour qu'un appelant ne mute pas le registre. */
function cloneDefault(value) {
  if (Array.isArray(value)) return [...value];
  if (isPlainObject(value)) return { ...value };
  return value;
}

/** `{ clé: défaut }` pour tout le registre. */
function defaultsOf(registry) {
  const out = {};
  for (const key of Object.keys(registry || {})) {
    out[key] = cloneDefault(registry[key].default);
  }
  return out;
}

/**
 * Descripteur d'une clé, ou `Error('Clé de réglage inconnue')`.
 * Lecture par propriété propre uniquement : `constructor` ou `__proto__` (la clé vient du
 * client) ne remontent jamais un membre d'`Object.prototype`.
 */
function validateKey(registry, key) {
  const k = String(key ?? '');
  if (!hasOwn(registry, k)) throw new Error(UNKNOWN_KEY_MESSAGE);
  return registry[k];
}

/** Descripteur d'une clé, ou `null` (même garde que `validateKey`, sans exception). */
function metaOf(registry, key) {
  const k = String(key ?? '');
  return hasOwn(registry, k) ? registry[k] : null;
}

/**
 * Entrées de registre DÉRIVÉES du catalogue commun de conditionnement
 * (`gatingSettingsCore`) pour un produit : un descripteur par réglage ayant une clé
 * dans ce produit, avec les mêmes bornes. `decorate` ajoute les champs propres au
 * produit (`scope`, `group`…).
 * @param {'fm'|'gl'} product
 * @param {object} [decorate]
 */
function gatingRegistryEntries(product, decorate = {}) {
  const field = String(product).toLowerCase() === 'gl' ? 'glKey' : 'fmKey';
  const out = {};
  for (const name of gatingCore.GATING_SETTING_NAMES) {
    const def = gatingCore.GATING_SETTING_DEFS[name];
    const key = def[field];
    if (!key) continue;
    const entry = { ...decorate, type: def.type, default: def.default };
    if (def.type === 'number') {
      entry.min = def.min;
      entry.max = def.max;
    } else if (def.type === 'enum') {
      entry.values = [...def.values];
    }
    out[key] = entry;
  }
  return out;
}

module.exports = {
  UNKNOWN_KEY_MESSAGE,
  castValue,
  defaultsOf,
  validateKey,
  metaOf,
  cloneDefault,
  parseStoredJson,
  normalizeString,
  gatingRegistryEntries,
};
