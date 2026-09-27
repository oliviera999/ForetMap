/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/enums/enumCore.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * Référentiel des valeurs énumérées — outils communs (audit du 25/09/2026, § 3.2.5, étape B1
 * de la piste B).
 *
 * Chaque colonne ENUM ou SET du schéma (hors `gl_*`), et chaque `varchar` utilisé comme
 * énumération (statut, niveau…), a **une seule** définition, rangée par domaine dans
 * `src/shared/enums/<domaine>Enums.js`. Une définition a la forme :
 *
 * ```js
 * Object.freeze({
 *   values: ['college', 'lycee'],          // ordre de l'ENUM SQL quand il y en a un
 *   labels: { college: 'Collège', … },     // libellé français de chaque valeur
 *   columns: ['quiz_questions.niveau'],    // colonnes SQL décrites (peut être vide)
 *   subsetOf: 'PEDAGO_ETAPES',             // seulement pour un sous-ensemble volontaire
 * })
 * ```
 *
 * Un sous-ensemble volontaire (les niveaux d'une question : collège et lycée, sans
 * l'université) est **déclaré** par `defineSubset`, jamais recopié : ses libellés viennent
 * de l'ensemble parent, et une valeur inconnue du parent lève une erreur au chargement.
 *
 * Sources ESM ici ; miroirs CJS à plat dans `lib/shared/` régénérés par
 * `scripts/sync-shared-cores.js` (`npm run sync:shared-cores`, vérifiés en CI par
 * `sync:shared-cores:check`). `tests/enums-referential.test.js` compare chaque définition à
 * `information_schema` sur la base de test. Aucune I/O ici.
 */

function assertDistinct(values, name) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${name} : valeur en double « ${value} ».`);
    seen.add(value);
  }
}

function freezeLabels(values, labels, name, { rejectOrphans = true } = {}) {
  const out = {};
  for (const value of values) {
    const label = labels ? labels[value] : undefined;
    if (typeof label !== 'string' || label === '') {
      throw new Error(`${name} : libellé manquant pour « ${value} ».`);
    }
    out[value] = label;
  }
  for (const key of rejectOrphans ? Object.keys(labels || {}) : []) {
    if (!values.some((value) => String(value) === key)) {
      throw new Error(`${name} : libellé sans valeur « ${key} ».`);
    }
  }
  return Object.freeze(out);
}

/**
 * Déclare une énumération complète.
 *
 * @param {string} name nom de la constante (messages d'erreur, `subsetOf` des enfants)
 * @param {{ values: Array<string|number>, labels: Record<string, string>, columns?: string[] }} def
 */
function defineEnum(name, { values, labels, columns = [] }) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${name} : liste de valeurs vide.`);
  }
  assertDistinct(values, name);
  return Object.freeze({
    values: Object.freeze([...values]),
    labels: freezeLabels(values, labels, name),
    columns: Object.freeze([...columns]),
  });
}

/**
 * Déclare un sous-ensemble volontaire d'une énumération : mêmes libellés, valeurs prises
 * dans le parent, et `subsetOf` qui nomme ce parent. L'ordre donné est conservé (un
 * sous-ensemble peut avoir son ordre d'affichage propre).
 *
 * @param {string} name
 * @param {{ values: Array<string|number>, labels: Record<string, string> }} parent
 * @param {string} parentName
 * @param {{ values: Array<string|number>, columns?: string[] }} def
 */
function defineSubset(name, parent, parentName, { values, columns = [] }) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${name} : liste de valeurs vide.`);
  }
  assertDistinct(values, name);
  for (const value of values) {
    if (!parent.values.includes(value)) {
      throw new Error(`${name} : « ${value} » absent de ${parentName}.`);
    }
  }
  return Object.freeze({
    values: Object.freeze([...values]),
    labels: freezeLabels(values, parent.labels, name, { rejectOrphans: false }),
    columns: Object.freeze([...columns]),
    subsetOf: parentName,
  });
}

/** Vrai si `value` est exactement l'une des valeurs de la définition. */
function isEnumValue(def, value) {
  return def.values.includes(value);
}

/** Libellé d'une valeur, ou `fallback` si elle est inconnue. */
function enumLabel(def, value, fallback = '') {
  return isEnumValue(def, value) ? def.labels[value] : fallback;
}

/**
 * Options `{ value, label }` d'un menu. `order` choisit un ordre d'affichage (sous-ensemble
 * ou permutation) : chaque valeur y est contrôlée, une valeur inconnue lève une erreur.
 */
function enumOptions(def, order = def.values) {
  return order.map((value) => {
    if (!isEnumValue(def, value)) {
      throw new Error(`enumOptions : « ${value} » absent de la définition.`);
    }
    return { value, label: def.labels[value] };
  });
}

module.exports = {
  defineEnum,
  defineSubset,
  isEnumValue,
  enumLabel,
  enumOptions,
};
