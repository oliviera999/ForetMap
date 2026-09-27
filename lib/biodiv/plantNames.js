'use strict';

/**
 * Noms des fiches espèces — `plant_name_aliases.kind` (migration 304, piste C de l'audit du
 * 25/09/2026, § 1.3.6, § 2.3 et § 3.5).
 *
 * Logique pure partagée par la lecture et l'écriture :
 *
 * - **Sortes de noms** (`kind`) :
 *   - `nom_secondaire` : autre nom courant, affiché sur la fiche (« Autres noms ») et saisi
 *     dans le formulaire — la reprise des anciens `plants.second_name` ;
 *   - `variante` : forme reconnue d'un nom (pluriel, forme courte, ancien nom, genre…),
 *     apportée par les migrations de contenu pour rattacher des noms historiques à la fiche ;
 *     cherchable, pas affichée. C'est la sorte de toutes les lignes d'avant la migration 304 ;
 *   - `synonyme` : synonyme scientifique, réservé à une saisie éditoriale (aucune reprise
 *     automatique).
 *   `alias` reste la clé primaire : un nom désigne UNE fiche (résolution des noms historiques,
 *   `lib/speciesJunction.js`), d'où les conflits signalés à l'écriture.
 * - **Miroir (T2, retiré au T3)** : `plants.second_name` reste écrit, liste des autres noms
 *   séparés par « , ».
 * - **Repli de lecture (T1, retiré au T3)** : si les autres noms de la table ne correspondent
 *   plus à `second_name` (écriture sans la table : version antérieure du code, migration de
 *   contenu, script ; ou nom en conflit avec une autre fiche), la fiche lit `second_name`.
 *
 * Découpage de `second_name` (mesuré sur le fixture : 149 valeurs, 25 multiples, toutes
 * séparées par « , ») : virgule, point-virgule ou retour à la ligne ; une précision finale
 * entre parenthèses (« Gommier bleu (usage courant) ») est retirée ; doublons retirés
 * (comparaison sans casse ni accents, comme la collation de la base). La migration 304
 * rejoue ce découpage en SQL.
 */

const { asTrimmedString } = require('../shared/stringHelpers');

const NAME_KINDS = Object.freeze(['nom_secondaire', 'variante', 'synonyme']);
const MAX_ALIAS_LENGTH = 255;
/** `plants.second_name` est un VARCHAR(255) : borne du miroir tant qu'il existe. */
const MAX_SECOND_NAME_MIRROR_LENGTH = 255;
const MAX_SECONDARY_NAMES = 30;

/**
 * Clé de comparaison d'un nom, proche de la collation `utf8mb4_unicode_ci` : sans casse ni
 * accents, ligatures dépliées, espaces réduits. Les apostrophes droite et typographique
 * restent distinctes, comme en base.
 */
function foldName(value) {
  return asTrimmedString(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ');
}

/** Un nom nettoyé : espaces retirés, précision finale entre parenthèses retirée. */
function cleanName(value) {
  let s = asTrimmedString(value).replace(/\s+/g, ' ');
  const paren = s.indexOf(' (');
  if (s.endsWith(')') && paren > 0) s = s.slice(0, paren).trim();
  return s;
}

/** Découpe une liste de noms (texte « a, b ; c » ou tableau), nettoyée et sans doublon. */
function splitNames(value) {
  const raw = Array.isArray(value)
    ? value.map((entry) => asTrimmedString(entry))
    : asTrimmedString(value).split(/[,;\n\r]+/);
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const name = cleanName(entry);
    const key = foldName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Autres noms d'une fiche d'après une liste, sans son propre nom. */
function secondaryNamesExcludingOwn(value, ownName) {
  const own = foldName(ownName);
  return splitNames(value).filter((name) => foldName(name) !== own);
}

/** Miroir `plants.second_name` : autres noms séparés par « , », ou `null`. */
function secondNameMirror(names) {
  const list = (names || []).map((n) => asTrimmedString(n)).filter(Boolean);
  return list.length > 0 ? list.join(', ') : null;
}

/** Tri des autres noms : ordre éditorial, puis alphabétique. */
function sortAliasRows(rows) {
  return [...(rows || [])].sort(
    (a, b) =>
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      String(a.alias).localeCompare(String(b.alias), 'fr', { sensitivity: 'base' }),
  );
}

/**
 * Noms effectifs d'une fiche (lecture T1).
 *
 * @param {object} plantRow ligne `plants` (`name`, `second_name`)
 * @param {Array<{ alias: string, kind: string, sort_order?: number }>} aliasRows noms de la fiche
 * @returns {{ secondaryNames: string[], aliases: Array<{ alias: string, kind: string }>,
 *   origin: 'table'|'colonnes' }}
 */
function resolvePlantNames(plantRow, aliasRows) {
  const rows = Array.isArray(aliasRows) ? aliasRows : [];
  const secondaryRows = sortAliasRows(rows.filter((r) => r.kind === 'nom_secondaire'));
  const fromTable = secondaryRows.map((r) => r.alias);
  const fromColumn = secondaryNamesExcludingOwn(plantRow?.second_name, plantRow?.name);
  const consistent =
    fromTable.length === fromColumn.length &&
    fromTable.every((name, i) => foldName(name) === foldName(fromColumn[i]));
  const secondaryNames = consistent ? fromTable : fromColumn;
  const aliases = sortAliasRows(rows).map((r) => ({ alias: r.alias, kind: r.kind }));
  return { secondaryNames, aliases, origin: consistent ? 'table' : 'colonnes' };
}

/**
 * Autres noms envoyés par un client : texte (« a, b ») ou tableau. Renvoie `{ names }` ou
 * `{ error }` (400).
 */
function normalizeClientSecondaryNames(input, ownName) {
  if (input != null && typeof input !== 'string' && !Array.isArray(input)) {
    return { error: 'secondary_names : texte ou liste attendu' };
  }
  const names = secondaryNamesExcludingOwn(input, ownName);
  if (names.length > MAX_SECONDARY_NAMES) {
    return { error: `Autres noms : ${MAX_SECONDARY_NAMES} au plus` };
  }
  if (names.some((name) => name.length > MAX_ALIAS_LENGTH)) {
    return { error: `Autres noms : ${MAX_ALIAS_LENGTH} caractères au plus par nom` };
  }
  const mirror = secondNameMirror(names);
  if (mirror && mirror.length > MAX_SECOND_NAME_MIRROR_LENGTH) {
    return {
      error: `Autres noms : ${MAX_SECOND_NAME_MIRROR_LENGTH} caractères au plus au total (limite de l’ancienne colonne, jusqu’à son retrait)`,
    };
  }
  return { names };
}

module.exports = {
  NAME_KINDS,
  MAX_SECONDARY_NAMES,
  foldName,
  cleanName,
  splitNames,
  secondaryNamesExcludingOwn,
  secondNameMirror,
  sortAliasRows,
  resolvePlantNames,
  normalizeClientSecondaryNames,
};
