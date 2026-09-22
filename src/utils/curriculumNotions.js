/**
 * Notions des programmes officiels (UI).
 * Aligné sur l’ENUM SQL `curriculum_notions.niveau` et sur `lib/curriculumNotions.js`.
 *
 * Attention au mot « niveau », qui désigne trois choses dans l’application : le niveau
 * d’une question (`college` / `lycee`), la profondeur d’un terme de glossaire (`base` /
 * `approfondissement` / `avance`) et — ici — le **niveau scolaire** d’une notion de
 * programme. Les filtres d’API les distinguent par leur nom : `niveau` pour les deux
 * premiers, `notionNiveau` pour celui-ci.
 */

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

export const CURRICULUM_NIVEAU_OPTIONS = Object.freeze([
  { value: '', label: 'Tous niveaux du programme' },
  ...CURRICULUM_NIVEAUX,
]);

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
