/**
 * Notions des programmes officiels (UI).
 * Aligné sur l’ENUM SQL `curriculum_notions.niveau` et sur `lib/curriculumNotions.js`.
 *
 * Attention au mot « niveau », qui désigne plusieurs échelles dans l’application : le niveau
 * d’une question (`college` / `lycee`), la profondeur d’un terme de glossaire (`base` /
 * `approfondissement` / `avance`) et — ici — le **niveau scolaire** d’une notion de
 * programme. Les filtres d’API les distinguent par leur nom : `niveau` pour les deux
 * premiers, `notionNiveau` pour celui-ci. Leurs correspondances sont déclarées une seule
 * fois, dans `pedagoScales.js`.
 */

import { ETAPE_CURRICULUM_NIVEAUX, parseNotionNiveauFilter } from './pedagoScales.js';

export const CURRICULUM_NIVEAUX = Object.freeze([
  { value: 'cycle3', label: 'Cycle 3 (CM1–6e)' },
  { value: 'cycle4', label: 'Cycle 4 (5e–3e)' },
  { value: 'seconde', label: 'Seconde' },
  { value: 'premiere_spe', label: 'Première — spécialité SVT' },
  { value: 'terminale_spe', label: 'Terminale — spécialité SVT' },
  { value: 'es_premiere', label: 'Première — enseignement scientifique' },
  { value: 'es_terminale', label: 'Terminale — enseignement scientifique' },
]);

const NIVEAU_LABEL_BY_VALUE = new Map(CURRICULUM_NIVEAUX.map((n) => [n.value, n.label]));

export function curriculumNiveauLabel(value) {
  const key = String(value == null ? '' : value).trim();
  return NIVEAU_LABEL_BY_VALUE.get(key) || key;
}

/**
 * Échelle unique de l'apprenant (décision du 25/09/2026, question 4) : niveaux du programme,
 * plus l'université. C'est le choix proposé pour le **niveau d'une classe**
 * (`groups.curriculum_niveau`) ; les notions, elles, n'existent que du cycle 3 à la terminale.
 */
export const LEARNER_NIVEAUX = Object.freeze([
  ...CURRICULUM_NIVEAUX,
  { value: 'universite', label: 'Université (au-delà du lycée)' },
]);

const LEARNER_LABEL_BY_VALUE = new Map(LEARNER_NIVEAUX.map((n) => [n.value, n.label]));

/** Libellé d'un niveau de l'apprenant (`universite` compris). */
export function learnerNiveauLabel(value) {
  const key = String(value == null ? '' : value).trim();
  return LEARNER_LABEL_BY_VALUE.get(key) || key;
}

/**
 * Choix d’un filtre « niveau de notion » : chaque étape d’abord (« tout le collège »), puis
 * ses niveaux. Mêmes valeurs que celles acceptées par `notionNiveau` côté API.
 */
export const NOTION_NIVEAU_FILTER_OPTIONS = Object.freeze([
  { value: 'college', label: 'Tout le collège (cycles 3 et 4)' },
  ...CURRICULUM_NIVEAUX.filter((n) => ETAPE_CURRICULUM_NIVEAUX.college.includes(n.value)),
  { value: 'lycee', label: 'Tout le lycée (seconde → terminale)' },
  ...CURRICULUM_NIVEAUX.filter((n) => ETAPE_CURRICULUM_NIVEAUX.lycee.includes(n.value)),
]);

export const CURRICULUM_NIVEAU_OPTIONS = Object.freeze([
  { value: '', label: 'Tous niveaux du programme' },
  ...NOTION_NIVEAU_FILTER_OPTIONS,
]);

/**
 * Options de filtre proposées à un public : on ne garde que celles entièrement comprises
 * dans les niveaux visibles (`allowed`, `null` = tous). Une valeur déjà choisie mais hors de
 * ce public (séance « cycle 4 » ouverte par une 6ᵉ) reste affichée : le menu ne doit pas
 * mentir sur le filtre appliqué.
 */
export function notionNiveauOptionsFor(allowed, current = '', options = CURRICULUM_NIVEAU_OPTIONS) {
  if (!Array.isArray(allowed)) return options;
  const allowedSet = new Set(allowed);
  return options.filter((opt) => {
    if (!opt.value || opt.value === current) return true;
    const parsed = parseNotionNiveauFilter(opt.value);
    return !!parsed?.niveaux?.length && parsed.niveaux.every((n) => allowedSet.has(n));
  });
}

/**
 * Niveaux scolaires effectivement demandés : le filtre choisi (niveau, étape ou liste),
 * resserré aux niveaux visibles du public (`allowed`, `null` = tous). Un filtre entièrement
 * hors de ce public est respecté tel quel : c’est un choix explicite du professeur.
 *
 * @returns {string[]|null} `null` = pas de filtre de niveau (vide ou invalide)
 */
export function resolveNotionNiveaux(filter, allowed) {
  const parsed = parseNotionNiveauFilter(filter);
  if (!parsed || parsed.error) return null;
  if (!Array.isArray(allowed)) return parsed.niveaux;
  const narrowed = parsed.niveaux.filter((n) => allowed.includes(n));
  return narrowed.length > 0 ? narrowed : parsed.niveaux;
}

/** Notions d’un public et d’un filtre de niveau (sans filtre : celles du public). */
export function notionsForNiveauFilter(notions, filter, allowed) {
  const items = Array.isArray(notions) ? notions : [];
  const scope = resolveNotionNiveaux(filter, allowed) ?? allowed;
  if (!Array.isArray(scope)) return items;
  return items.filter((n) => scope.includes(n?.niveau));
}

/**
 * Options du menu « Notion du programme ».
 *
 * `countKey` choisit l’effectif affiché entre parenthèses : `question_count` côté quiz,
 * `glossary_count` côté glossaire, `null` pour n’en afficher aucun. Un menu de quiz qui
 * annoncerait le nombre de termes de glossaire tromperait sur ce qui sera tiré.
 */
export function buildNotionOptions(
  notions,
  { emptyLabel = 'Toutes notions', countKey = 'question_count' } = {},
) {
  const items = Array.isArray(notions) ? notions : [];
  return [
    { value: '', label: emptyLabel },
    ...items.map((notion) => {
      const count = countKey ? notion?.[countKey] : null;
      const suffix = count == null ? '' : ` (${count})`;
      return {
        value: String(notion?.id || ''),
        label: `${curriculumNiveauLabel(notion?.niveau)} — ${notion?.notion || notion?.id}${suffix}`,
      };
    }),
  ];
}

/** Notions regroupées par niveau scolaire, dans l’ordre de la scolarité. */
export function groupNotionsByNiveau(notions) {
  const items = Array.isArray(notions) ? notions : [];
  const groups = new Map();
  for (const notion of items) {
    const key = String(notion?.niveau || '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(notion);
  }
  return CURRICULUM_NIVEAUX.filter((niveau) => groups.has(niveau.value)).map((niveau) => ({
    ...niveau,
    notions: groups.get(niveau.value),
  }));
}

/** Libellé court d’une notion pour une pastille (le niveau y tient rarement). */
export function notionChipLabel(notion) {
  if (!notion) return '';
  return `${notion.id || ''} · ${notion.notion || ''}`.trim();
}
