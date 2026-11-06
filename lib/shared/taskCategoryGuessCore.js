/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/taskCategoryGuessCore.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * Suggestion de métier et de format d'une tâche à partir de son titre et de sa description
 * (migration 329). Règles par motifs, **premier motif qui correspond** ; le texte est replié
 * (minuscules, sans accents, apostrophes et ponctuation en espaces) avant comparaison.
 *
 * C'est une **suggestion**, jamais une décision : le formulaire la pré-remplit (modifiable,
 * mention « suggéré ») et le script de reprise (`scripts/backfill-task-taxonomy.js`) l'écrit
 * dans un CSV relu avant application. Un titre qu'aucune règle ne reconnaît ne reçoit
 * **aucune** suggestion plutôt qu'un mauvais métier.
 *
 * Règles de départ : annexe 1 du cahier des charges du 06/11/2026, ajustées sur les tâches
 * de la base (ordre terrassement avant bricolage pour « réparer les bordures », « affaires qui
 * traînent » en entretien, motifs courts bornés au mot pour éviter « chat » dans « achat »).
 *
 * Noyau partagé front (formulaire de tâche) / back (`lib/shared/taskCategoryGuessCore.js`,
 * généré par `npm run sync:shared-cores`, réexporté par `lib/tasks/taskCategoryGuess.js`).
 * Aucune I/O ici.
 */

const { effectiveTaskFormat } = require('./taskTaxonomyCore');

/** Texte replié pour la comparaison : minuscules, sans accents, mots séparés par une espace. */
function foldForGuess(raw) {
  return ` ${String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

/**
 * Un motif est une chaîne : « préfixe » (début de mot, `nettoy` couvre « nettoyer ») ;
 * entouré d'espaces (`' chat '`), il doit correspondre à un mot entier.
 */
function matches(folded, pattern) {
  if (pattern.startsWith(' ') && pattern.endsWith(' ')) return folded.includes(pattern);
  return folded.includes(` ${pattern}`);
}

/**
 * Règles ordonnées : `{ id, category, format, patterns }`. `format` est le format de départ,
 * corrigé ensuite par `refineFormat`.
 */
const GUESS_RULES = Object.freeze([
  {
    id: 'electronique',
    category: 'electronique',
    format: 'seance',
    patterns: [
      'firmware',
      'firmwire',
      'circuit',
      'raspberry',
      'capteur',
      'pompe',
      'solaire',
      'esp32',
      ' code ',
      'arduino',
      'cablage',
      'soudure',
    ],
  },
  // Avant le rangement : « ranger les affaires qui traînent » est de l'entretien courant.
  {
    id: 'entretien-affaires',
    category: 'entretien',
    format: 'flash',
    patterns: ['affaires qui trainent', 'qui traine'],
  },
  // Avant le bricolage : « réparer les bordures » est du terrassement.
  {
    id: 'terrassement',
    category: 'terrassement',
    format: 'seance',
    patterns: ['creuser', ' trou ', ' trous ', 'bordure', 'cacteraie', 'tranchee', 'combler'],
  },
  {
    id: 'bricolage',
    category: 'bricolage',
    format: 'seance',
    patterns: [
      'etagere',
      'plateforme',
      'fixation',
      'reparer',
      'reparation',
      'peinture',
      'peindre',
      'antirouille',
      'toile de jute',
      'vernir',
      'assemblage',
      'panneau',
      'construire',
      'construction',
      'visser',
      'percer',
    ],
  },
  {
    id: 'rangement',
    category: 'rangement',
    format: 'seance',
    patterns: [
      'ranger',
      'rangement',
      'trier',
      'deplacer',
      'rassembler',
      'organisation',
      'stockage',
      'reagencer',
      ' recuperer ',
    ],
  },
  {
    id: 'animaux',
    category: 'animaux',
    format: 'seance',
    patterns: [
      'gambusie',
      'insectopolis',
      'dar des chats',
      ' chat ',
      ' chats ',
      'insecte',
      'cetoine',
      'chenille',
      'goeland',
      'transferer des vers',
      'nourrir',
    ],
  },
  {
    id: 'entretien',
    category: 'entretien',
    format: 'flash',
    // « établi » seul n'est pas un motif : « arrosage des plantes au-dessus de l'établi »
    // est du jardinage ; « nettoyage établi » est reconnu par `nettoy`.
    patterns: ['nettoy', 'dechet', 'poubelle', 'entretien mobilier', 'gants', 'balayer'],
  },
  {
    id: 'communication',
    category: 'communication',
    format: 'seance',
    patterns: [
      'etiquet',
      'planche',
      'badge',
      'manuel du',
      'le manuel',
      ' guide ',
      ' guides ',
      'goodies',
      'plastifi',
      'affich',
      'imprimer',
    ],
  },
  {
    id: 'jardinage',
    category: 'jardinage',
    format: 'seance',
    patterns: [
      'arros',
      'desherb',
      'paill',
      'taill',
      'boutur',
      'rempot',
      'en pot',
      'recolt',
      'semis',
      'semer',
      'graine',
      'compost',
      'jus de vers',
      'tomate',
      'peuplier',
      'oidium',
      'parcelle',
      'planter',
      'plantation',
      'tuteur',
      'vivipare',
      'tillandsia',
      'culture',
      'mise en terre',
    ],
  },
]);

/** Seuil de description courte (caractères) pour une petite tâche → Flash. */
const SHORT_DESCRIPTION_CHARS = 120;
/** Au plus ce nombre d'élèves requis pour qu'une tâche courte soit un Flash. */
const FLASH_MAX_STUDENTS = 2;
/**
 * Métiers techniques : une tâche courte y reste une Séance (outillage, sécurité, montage) ;
 * leur description est souvent vide dans les projets, ce qui ne dit rien de leur durée.
 */
const NEVER_FLASH_CATEGORIES = Object.freeze(['electronique', 'bricolage', 'terrassement']);
/** À partir de ce nombre d'élèves requis, une tâche n'est plus un Flash. */
const GROUP_TASK_MIN_STUDENTS = 3;

/**
 * Format affiné (une récurrence impose toujours `routine`) :
 *  - `seance` → `flash` pour une récolte (hors graines), ou une petite tâche (au plus
 *    `FLASH_MAX_STUDENTS` élèves, description de moins de `SHORT_DESCRIPTION_CHARS`
 *    caractères) — sauf métier technique et sauf étape de projet ;
 *  - `flash` → `seance` pour une tâche de groupe (`GROUP_TASK_MIN_STUDENTS` élèves et plus).
 */
function refineFormat(baseFormat, category, folded, task) {
  const requiredStudents = Number(task?.required_students) || 1;
  const descriptionLength =
    task?.description_length != null
      ? Number(task.description_length) || 0
      : String(task?.description ?? '').trim().length;
  const inProject = task?.project_id != null && String(task.project_id).trim() !== '';
  let format = baseFormat;
  if (format === 'seance' && !inProject && !NEVER_FLASH_CATEGORIES.includes(category)) {
    const harvest = matches(folded, 'recolt') && !matches(folded, 'graine');
    const small =
      requiredStudents <= FLASH_MAX_STUDENTS && descriptionLength < SHORT_DESCRIPTION_CHARS;
    if (harvest || small) format = 'flash';
  } else if (format === 'flash' && requiredStudents >= GROUP_TASK_MIN_STUDENTS) {
    format = 'seance';
  }
  return effectiveTaskFormat(task?.recurrence, format);
}

/**
 * Suggestion pour une tâche.
 * @param {{ title?: string, description?: string, required_students?: number,
 *           recurrence?: string|null, project_id?: string|null, description_length?: number }} task
 * @returns {{ category: string|null, format: string|null, rule: string|null }}
 *   `category` null : aucune règle ne reconnaît la tâche (le format n'est alors suggéré que
 *   pour une tâche récurrente).
 */
function guessTaskTaxonomy(task = {}) {
  const titleFolded = foldForGuess(task.title);
  const fullFolded = foldForGuess(`${task.title ?? ''} ${task.description ?? ''}`);
  // Le titre prime : une règle qui reconnaît le titre l'emporte sur la description.
  for (const folded of [titleFolded, fullFolded]) {
    const rule = GUESS_RULES.find((r) => r.patterns.some((p) => matches(folded, p)));
    if (rule) {
      return {
        category: rule.category,
        format: refineFormat(rule.format, rule.category, titleFolded, task),
        rule: rule.id,
      };
    }
  }
  return { category: null, format: task.recurrence ? 'routine' : null, rule: null };
}

module.exports = {
  foldForGuess,
  GUESS_RULES,
  SHORT_DESCRIPTION_CHARS,
  FLASH_MAX_STUDENTS,
  NEVER_FLASH_CATEGORIES,
  GROUP_TASK_MIN_STUDENTS,
  guessTaskTaxonomy,
};
