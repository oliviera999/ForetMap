/**
 * Recherche de lieux — module partagé (lot 4 du plan de convergence,
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.5). Pur, sans dépendance : le plan s'en sert pour
 * sa barre de recherche, et la carte de travail comme la Visite peuvent l'adopter ensuite.
 *
 * Principes : insensible à la casse, aux accents et à la ponctuation ; une saisie est une
 * suite de mots dont **chacun** doit se retrouver dans le lieu (nom, alias, sous-titre,
 * accroche, catégorie) ; le classement privilégie le nom, puis un début de mot, puis un
 * alias, enfin le reste. Aucun index externe : la liste des lieux d'un plan tient en mémoire.
 */

/** Poids de champ (plus haut = plus pertinent). */
const FIELD_WEIGHTS = Object.freeze({
  name: 100,
  alias: 70,
  subtitle: 40,
  category: 30,
  text: 15,
});

/** Bonus cumulés selon la qualité de la correspondance dans le champ. */
const MATCH_BONUS = Object.freeze({
  exact: 60,
  prefix: 30,
  wordStart: 18,
  contains: 0,
});

/**
 * Normalise une chaîne pour la comparaison : minuscules, accents retirés, ponctuation et
 * espaces réduits à une espace simple.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Découpe une saisie en mots normalisés (vides retirés, doublons conservés sans effet).
 * @param {unknown} value
 * @returns {string[]}
 */
export function tokenizeSearchQuery(value) {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(' ') : [];
}

function fieldEntry(kind, value) {
  const text = normalizeSearchText(value);
  return text ? { kind, text, words: text.split(' ') } : null;
}

/**
 * Construit l'index de recherche d'une liste de lieux.
 *
 * @param {Array<object>} places lieux du plan (zones et repères déjà unifiés :
 *   `{ id, name, search_aliases, visit_subtitle, visit_short_description, categories }`).
 * @param {object} [options]
 * @param {(place: object) => string} [options.getName] libellé principal (défaut : `name` ou `label`).
 * @param {(place: object) => string[]} [options.getCategoryLabels] libellés de catégories.
 * @returns {Array<{ place: object, fields: Array<{ kind: string, text: string, words: string[] }> }>}
 */
export function buildPlaceIndex(places, options = {}) {
  const {
    getName = (p) => p?.name ?? p?.label ?? '',
    getCategoryLabels = (p) => (p?.categories || []).map((c) => c?.label ?? ''),
  } = options;
  return (places || []).map((place) => {
    const aliases = Array.isArray(place?.search_aliases)
      ? place.search_aliases
      : String(place?.search_aliases ?? '')
          .split(';')
          .filter(Boolean);
    const fields = [
      fieldEntry('name', getName(place)),
      ...aliases.map((alias) => fieldEntry('alias', alias)),
      fieldEntry('subtitle', place?.visit_subtitle),
      ...getCategoryLabels(place).map((label) => fieldEntry('category', label)),
      fieldEntry('text', place?.visit_short_description),
      fieldEntry('text', place?.description),
      fieldEntry('text', place?.note),
    ].filter(Boolean);
    return { place, fields };
  });
}

/** Meilleur score d'un mot dans un champ, ou `null` si le mot est absent du champ. */
function scoreTokenInField(field, token) {
  if (!field.text.includes(token)) return null;
  const weight = FIELD_WEIGHTS[field.kind] ?? FIELD_WEIGHTS.text;
  if (field.text === token) return weight + MATCH_BONUS.exact;
  if (field.text.startsWith(token)) return weight + MATCH_BONUS.prefix;
  if (field.words.some((w) => w.startsWith(token))) return weight + MATCH_BONUS.wordStart;
  return weight + MATCH_BONUS.contains;
}

/**
 * Recherche : ne garde que les lieux dont **chaque** mot de la saisie apparaît quelque part,
 * et les classe par score décroissant puis par nom (ordre stable, comparaison française).
 *
 * @param {ReturnType<typeof buildPlaceIndex>} index
 * @param {string} query
 * @param {object} [options]
 * @param {number} [options.limit] nombre maximal de résultats (défaut : tous).
 * @returns {Array<{ place: object, score: number, matchedFields: string[] }>}
 */
export function searchPlaces(index, query, options = {}) {
  const { limit } = options;
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return [];
  const results = [];
  for (const entry of index || []) {
    let total = 0;
    const matchedFields = new Set();
    let allMatched = true;
    for (const token of tokens) {
      let best = null;
      for (const field of entry.fields) {
        const score = scoreTokenInField(field, token);
        if (score != null && (best == null || score > best.score)) {
          best = { score, kind: field.kind };
        }
      }
      if (best == null) {
        allMatched = false;
        break;
      }
      total += best.score;
      matchedFields.add(best.kind);
    }
    if (!allMatched) continue;
    results.push({ place: entry.place, score: total, matchedFields: [...matchedFields] });
  }
  const collator = new Intl.Collator('fr-FR', { sensitivity: 'base' });
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const an = String(a.place?.name ?? a.place?.label ?? '');
    const bn = String(b.place?.name ?? b.place?.label ?? '');
    return collator.compare(an, bn);
  });
  return typeof limit === 'number' && limit > 0 ? results.slice(0, limit) : results;
}
