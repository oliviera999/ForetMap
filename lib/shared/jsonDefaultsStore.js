'use strict';

// Noyau partagé ForetMap / GL : contenu éditable stocké en base **par-dessus** un
// fichier de défauts versionné (`data/*.json`).
//
// Les deux produits appliquent exactement le même mécanisme de lecture :
//   1. charger les défauts depuis un JSON du dépôt (cache mémoire + clone défensif) ;
//   2. lire la surcharge enregistrée en base ;
//   3. la normaliser au modèle du produit, en retombant sur les défauts si la
//      valeur stockée est absente ou illisible.
//
// Seuls la **table de réglages** (`app_settings` vs `gl_settings`), les colonnes
// d'audit et le **modèle de contenu** (normalisation) diffèrent : ils restent
// chez l'appelant. Conformément à la règle du projet, on factorise le noyau,
// pas la plomberie — l'écriture (upsert) reste donc côté produit.
//
// Consommateurs : `lib/helpContent.js` (ForetMap), `lib/glHelp.js` (GL).

const fs = require('fs');

/**
 * Construit un chargeur de défauts JSON avec cache mémoire.
 *
 * Le fichier n'est lu qu'une fois ; chaque appel renvoie une **copie profonde**,
 * de sorte qu'un appelant qui mute le résultat ne corrompt pas le cache.
 *
 * @param {string} absolutePath chemin absolu du fichier JSON de défauts
 * @returns {() => object} chargeur renvoyant une copie des défauts
 */
function createDefaultsLoader(absolutePath) {
  let cache = null;
  return function loadDefaults() {
    if (!cache) {
      cache = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    }
    return JSON.parse(JSON.stringify(cache));
  };
}

/**
 * Résout une configuration à partir d'une valeur stockée en base.
 *
 * Toute valeur absente, vide ou illisible (JSON invalide) retombe sur les
 * défauts — jamais d'exception propagée à l'appelant, jamais de configuration
 * partielle servie.
 *
 * @param {string|object|null|undefined} storedValue valeur brute lue en base (`value_json`)
 * @param {object} options
 * @param {() => object} options.loadDefaults chargeur de défauts (cf. `createDefaultsLoader`)
 * @param {(raw: object) => object} options.normalize normalisation au modèle du produit
 * @returns {object} configuration normalisée
 */
function resolveStoredConfig(storedValue, { loadDefaults, normalize }) {
  if (!storedValue) return loadDefaults();
  try {
    const parsed = typeof storedValue === 'string' ? JSON.parse(storedValue) : storedValue;
    return normalize(parsed);
  } catch (_) {
    return loadDefaults();
  }
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isEmptyObject(value) {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

/**
 * Réduit une configuration **dense** (normalisée, tous les champs remplis) à la
 * seule **surcharge** : ce qui diffère réellement des défauts versionnés.
 *
 * Pourquoi c'est structurant. Enregistrer l'objet complet fige le contenu : une
 * fois la ligne écrite en base, améliorer un défaut dans `data/*.json` n'a plus
 * aucun effet à l'écran, puisque la valeur stockée gagne pour *toutes* les clés,
 * y compris celles que personne n'a jamais touchées. En ne stockant que l'écart,
 * la base ne retient que les décisions éditoriales réelles, et tout le reste
 * continue de suivre le dépôt.
 *
 * La lecture n'a rien à changer : les normalisations produit retombent déjà sur
 * les défauts pour toute valeur absente (`raw?.x ?? defaults.x`), donc un objet
 * creux se fusionne exactement comme un objet dense.
 *
 * Règles :
 * - valeur identique au défaut ⇒ **omise** (c'est tout l'objet du mécanisme) ;
 * - chaîne vide face à un défaut non vide ⇒ **conservée** : vider un texte est
 *   une décision, pas une absence de décision ;
 * - clé absente des défauts ⇒ conservée telle quelle ;
 * - tableaux d'objets (les `items` d'un panneau) ⇒ diff **positionnel**, les
 *   positions inchangées devenant des trous `{}`. C'est la forme qu'attend la
 *   fusion positionnelle des normalisations produit ;
 * - tout autre tableau ⇒ conservé en entier dès qu'il diffère (on ne cherche pas
 *   à trouer un tableau de primitives, la fusion ne saurait pas le recoller).
 *
 * @param {*} value valeur normalisée (dense)
 * @param {*} defaults valeur de référence issue du fichier de défauts
 * @returns {*} surcharge, ou `undefined` s'il n'y a rien à stocker
 */
function diffAgainstDefaults(value, defaults) {
  if (isPlainObject(value)) {
    if (!isPlainObject(defaults)) return value;
    const overrides = {};
    for (const [key, item] of Object.entries(value)) {
      const diff = diffAgainstDefaults(item, defaults[key]);
      if (diff !== undefined) overrides[key] = diff;
    }
    return Object.keys(overrides).length > 0 ? overrides : undefined;
  }

  if (Array.isArray(value)) {
    if (!Array.isArray(defaults)) return value;
    const positional = value.every(isPlainObject) && defaults.every(isPlainObject);
    if (!positional) {
      return JSON.stringify(value) === JSON.stringify(defaults) ? undefined : value;
    }
    const items = value.map((item, index) => diffAgainstDefaults(item, defaults[index]) ?? {});
    const hasOverride = items.some((item) => !isEmptyObject(item));
    // Un tableau plus court que les défauts n'est pas une suppression : la fusion
    // positionnelle complète avec les défauts. On ne le stocke donc pas pour rien.
    if (!hasOverride && value.length <= defaults.length) return undefined;
    return items;
  }

  return value === defaults ? undefined : value;
}

/**
 * Surcharge prête à persister : `diffAgainstDefaults` avec `{}` plutôt que
 * `undefined` quand rien ne diffère (une ligne vide se relit en défauts purs).
 */
function buildStoredOverride(value, defaults) {
  return diffAgainstDefaults(value, defaults) ?? {};
}

module.exports = {
  createDefaultsLoader,
  resolveStoredConfig,
  diffAgainstDefaults,
  buildStoredOverride,
};
