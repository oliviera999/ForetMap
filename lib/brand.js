'use strict';

/**
 * Identité de marque — source unique des noms affichés (logiciel et établissement).
 *
 * Objectif : qu'une installation puisse porter un autre nom de produit et un autre
 * établissement **sans toucher au code**. Avant ce module, « Lycée Lyautey » et « ForêtMap »
 * étaient écrits en dur dans le registre produits, les défauts de réglages et les entrées
 * HTML ; une deuxième installation obligeait à éditer une quarantaine de fichiers.
 *
 * Périmètre : **les noms affichés, et eux seuls.** Ce module ne renomme jamais un identifiant
 * technique — identifiants de produit (`foret`, `gl`, `plan`, `staff`), en-tête
 * `X-Foretmap-Product`, claim JWT `product`, préfixes d'API (`/api/gl`), préfixes de variables
 * d'environnement `FORETMAP_*`, noms de tables, nom npm du paquet. Ces chaînes sont des
 * contrats entre le client et le serveur, ou entre le dépôt et son hébergement : les rendre
 * variables casserait les sessions en cours et les déploiements existants pour un gain nul,
 * puisqu'elles ne sont jamais montrées à un utilisateur.
 *
 * Restent également hors périmètre, et volontairement :
 * - les **préfixes de host** du registre produits (`planlyautey.`, `proflyautey.`,
 *   `stafflyautey.`) : c'est du routage de déploiement, pas de l'affichage. Servir le Plan
 *   sur un autre domaine demande le champ `hosts` exact décrit dans
 *   `docs/reference/exploitation/marque-et-domaines.md` ;
 * - `ui.plan.map_id` (défaut `lyautey`) : identifiant de ligne dans la table `maps`, donc une
 *   **donnée**, pas un libellé.
 *
 * Les valeurs par défaut reproduisent exactement l'installation du Lycée Lyautey : sans
 * variable d'environnement, aucun texte visible ne change.
 *
 * Lecture au **premier appel** puis mise en cache : les variables d'environnement sont posées
 * avant le démarrage (`dotenv`, panneau « Setup Node.js App »), et une lecture par chaîne
 * affichée serait gratuite. `resetBrandCache()` existe pour les tests.
 */

/** Longueur maximale d'un nom de marque : `content.auth.title` borne déjà ses valeurs à 80. */
const BRAND_NAME_MAX_LENGTH = 80;

/** Caractères de contrôle : un retour chariot collé dans une variable d'environnement casserait
 * un titre HTML ou un manifeste PWA. On les remplace par une espace avant de réduire. */
const CONTROL_CHARS_RE = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

/**
 * Identité du Lycée Lyautey — valeurs par défaut. Changer une valeur ici change l'installation
 * de référence ; une autre installation passe par les variables d'environnement ci-dessous.
 */
const DEFAULT_BRAND = Object.freeze({
  appName: 'ForêtMap',
  appShortName: 'ForêtMap',
  orgName: 'Lycée Lyautey',
  orgShortName: 'Lyautey',
  glName: 'Gnomes & Licornes',
  glShortName: 'G&L',
});

/** Variable d'environnement portant chaque champ. */
const BRAND_ENV_VARS = Object.freeze({
  appName: 'FORETMAP_BRAND_APP_NAME',
  appShortName: 'FORETMAP_BRAND_APP_SHORT_NAME',
  orgName: 'FORETMAP_BRAND_ORG_NAME',
  orgShortName: 'FORETMAP_BRAND_ORG_SHORT_NAME',
  glName: 'FORETMAP_BRAND_GL_NAME',
  glShortName: 'FORETMAP_BRAND_GL_SHORT_NAME',
});

const BRAND_FIELDS = Object.freeze(Object.keys(BRAND_ENV_VARS));

/**
 * Nom de marque normalisé : caractères de contrôle retirés, espaces réduits, valeur bornée.
 * Une chaîne vide est significative — elle veut dire « cette installation n'a pas
 * d'établissement » — et n'est donc jamais remplacée par le défaut.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeBrandName(value) {
  return String(value == null ? '' : value)
    .replace(CONTROL_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, BRAND_NAME_MAX_LENGTH);
}

/** Couples (nom long, nom court) : un nom court suit son nom long quand il n'est pas déclaré. */
const BRAND_NAME_PAIRS = Object.freeze([
  Object.freeze(['appName', 'appShortName']),
  Object.freeze(['orgName', 'orgShortName']),
  Object.freeze(['glName', 'glShortName']),
]);

/** Valeur déclarée pour un champ, ou `null` si la variable d'environnement est absente. */
function readBrandEnv(field) {
  const raw = process.env[BRAND_ENV_VARS[field]];
  return raw === undefined ? null : normalizeBrandName(raw);
}

/** @type {Readonly<Record<string, string>> | null} */
let cachedBrand = null;

/**
 * Identité de marque effective : variable d'environnement si elle est **définie** (même vide,
 * pour permettre de retirer l'établissement), valeur par défaut sinon.
 *
 * Règle des noms courts, qui évite un mélange de marques : un nom court non déclaré suit le
 * nom long **dès que celui-ci est redéfini**, et ne retombe sur son propre défaut que si le
 * nom long est lui aussi au défaut. Sans cette règle, déclarer le seul
 * `FORETMAP_BRAND_ORG_NAME` laissait « Lyautey » dans le titre du Plan.
 *
 * @returns {Readonly<{ appName: string, appShortName: string, orgName: string, orgShortName: string, glName: string, glShortName: string }>}
 */
function getBrand() {
  if (cachedBrand) return cachedBrand;
  const brand = {};
  for (const [longField, shortField] of BRAND_NAME_PAIRS) {
    const declaredLong = readBrandEnv(longField);
    const declaredShort = readBrandEnv(shortField);
    const longName = declaredLong === null ? DEFAULT_BRAND[longField] : declaredLong;
    let shortName;
    if (declaredShort !== null) shortName = declaredShort;
    else if (declaredLong !== null) shortName = longName;
    else shortName = DEFAULT_BRAND[shortField];
    brand[longField] = longName;
    // Un nom court vide alors que le long ne l'est pas viderait un titre de PWA pour rien.
    brand[shortField] = shortName || longName;
  }
  cachedBrand = Object.freeze(brand);
  return cachedBrand;
}

/** Vide le cache — réservé aux tests, qui modifient `process.env` entre deux cas. */
function resetBrandCache() {
  cachedBrand = null;
}

/** Jetons de substitution acceptés par `brandText`. */
function brandTokens(brand) {
  return {
    app: brand.appName,
    appShort: brand.appShortName,
    org: brand.orgName,
    orgShort: brand.orgShortName,
    gl: brand.glName,
    glShort: brand.glShortName,
  };
}

/**
 * Texte de marque : substitue `{app}`, `{appShort}`, `{org}`, `{orgShort}`, `{gl}`, `{glShort}`.
 *
 * Si l'un des jetons **présents dans le gabarit** est vide, c'est `fallbackTemplate` qui est
 * rendu à la place. C'est ce qui évite les « Plan du  : se repérer… » et les tirets orphelins
 * quand une installation n'a pas d'établissement : plutôt que de deviner comment recoudre une
 * phrase, on écrit les deux formulations. Sans repli, le gabarit est rendu tel quel, jetons
 * vides compris.
 *
 * @param {string} template Gabarit principal, ex. `'Plan du {org} : se repérer'`.
 * @param {string} [fallbackTemplate] Formulation sans établissement, ex. `'Plan : se repérer'`.
 * @returns {string}
 */
function brandText(template, fallbackTemplate = '') {
  const tokens = brandTokens(getBrand());
  const render = (tpl) =>
    String(tpl || '')
      .replace(/\{(\w+)\}/g, (match, key) =>
        Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : match,
      )
      .trim();

  const used = String(template || '').match(/\{(\w+)\}/g) || [];
  const hasEmptyToken = used.some((token) => {
    const key = token.slice(1, -1);
    return Object.prototype.hasOwnProperty.call(tokens, key) && !tokens[key];
  });
  if (hasEmptyToken && fallbackTemplate) return render(fallbackTemplate);
  return render(template);
}

/**
 * Assemble des segments de titre en ignorant les vides : `['ForêtMap', '']` donne `'ForêtMap'`,
 * jamais `'ForêtMap – '`. Utilisé pour les titres composés (nom du produit + établissement).
 * @param {Array<string>} segments
 * @param {string} [separator]
 * @returns {string}
 */
function joinBrandSegments(segments, separator = ' – ') {
  return (Array.isArray(segments) ? segments : [])
    .map((segment) => String(segment == null ? '' : segment).trim())
    .filter(Boolean)
    .join(separator);
}

module.exports = {
  BRAND_ENV_VARS,
  BRAND_FIELDS,
  BRAND_NAME_MAX_LENGTH,
  DEFAULT_BRAND,
  brandText,
  getBrand,
  joinBrandSegments,
  normalizeBrandName,
  resetBrandCache,
};
