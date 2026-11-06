/**
 * Taxonomie des tâches et des projets — noyau partagé front (`src/`) / back (`lib/shared/`).
 *
 * **Source unique** des métiers, formats, phases de projet et types de projet (migration 329).
 * Les valeurs et libellés viennent du référentiel `enums/taskEnums.js` ; ce module ajoute ce
 * qui sert à l'affichage (emoji, descriptions, phrase élève de chaque phase), la validation
 * (`isValid*`, `parseTaxonomyInput`) et la normalisation (clé ou libellé, sans casse ni
 * accents : l'import CSV/XLSX accepte « Électronique et code » comme `electronique`).
 *
 * Une valeur inconnue n'est jamais remise à NULL en silence : `parseTaxonomyInput` renvoie
 * une erreur, que l'API transforme en 400 (cf. audit du 25/09/2026, « 7 endroits »).
 *
 * Dans l'interface, ces valeurs s'affichent en **étiquettes** ; le mot « badge » est réservé
 * aux récompenses (`lib/rewards/`).
 *
 * Miroir CJS : `lib/shared/taskTaxonomyCore.js` (généré par `npm run sync:shared-cores`).
 * Aucune I/O ici.
 */

import {
  TASK_CATEGORY_ENUM,
  TASK_FORMAT_ENUM,
  TASK_PROJECT_PHASE_ENUM,
  TASK_PROJECT_TYPE_ENUM,
} from './enums/taskEnums.js';

const CATEGORY_DETAILS = {
  jardinage: {
    emoji: '🪴',
    description: 'Arroser, désherber, pailler, tailler, bouturer, récolter, composter.',
  },
  animaux: {
    emoji: '🐞',
    description: 'Insectopolis, Dar des chats, gambusies, vers : nourrir, soigner, installer.',
  },
  entretien: { emoji: '🧽', description: 'Nettoyer, ramasser les déchets, vider les poubelles.' },
  bricolage: {
    emoji: '🔨',
    description: 'Menuiserie, réparation, peinture, fixations.',
  },
  terrassement: {
    emoji: '⛏️',
    description: 'Creuser, combler, poser des bordures, aménager le sol.',
  },
  rangement: { emoji: '📦', description: 'Ranger, trier, déplacer, organiser.' },
  electronique: {
    emoji: '🔌',
    description: 'Capteurs, circuits, alimentation solaire, programmes.',
  },
  communication: {
    emoji: '📣',
    description: 'Étiquettes, panneaux, guides, événements.',
  },
};

const FORMAT_DETAILS = {
  flash: { emoji: '⚡', description: 'Moins de 15 min.' },
  routine: { emoji: '🔁', description: 'Régulière, consigne connue.' },
  seance: { emoji: '🛠', description: 'Environ une heure.' },
};

const PROJECT_TYPE_DETAILS = {
  amenagement: {
    description: 'Transformer un lieu : un coin du jardin, une parcelle, du mobilier.',
  },
  construction: { description: 'Fabriquer et installer un objet ou une structure durable.' },
  dispositif_technique: {
    description: 'Monter un système qui mesure, pilote ou alimente : capteurs, pompe, énergie.',
  },
  evenement: { description: 'Préparer et animer un moment ouvert à d’autres : visite, journée.' },
  campagne: { description: 'Une même action répétée sur une période : arrosage, suivi, collecte.' },
};

const PHASE_DETAILS = {
  concevoir: { emoji: '📐', phrase: 'Observer, mesurer, proposer, décider.' },
  preparer: { emoji: '🧰', phrase: 'Réunir le matériel, faire les plans, dégager la place.' },
  realiser: { emoji: '🏗️', phrase: 'Faire le travail lui-même.' },
  tester: { emoji: '🧪', phrase: 'Vérifier, mesurer, ajuster.' },
  transmettre: { emoji: '🗣️', phrase: 'Documenter, étiqueter, expliquer, guider.' },
};

function buildList(def, details) {
  return Object.freeze(
    def.values.map((key) => Object.freeze({ key, label: def.labels[key], ...details[key] })),
  );
}

/** Métiers, dans l'ordre d'affichage : `{ key, label, emoji, description }`. */
export const TASK_CATEGORIES = buildList(TASK_CATEGORY_ENUM, CATEGORY_DETAILS);
/** Formats : `{ key, label, emoji, description }`. */
export const TASK_FORMATS = buildList(TASK_FORMAT_ENUM, FORMAT_DETAILS);
/** Types de projet : `{ key, label, description }`. */
export const PROJECT_TYPES = buildList(TASK_PROJECT_TYPE_ENUM, PROJECT_TYPE_DETAILS);
/** Phases de projet, dans l'ordre de la démarche : `{ key, label, emoji, phrase }`. */
export const PROJECT_PHASES = buildList(TASK_PROJECT_PHASE_ENUM, PHASE_DETAILS);

export const TASK_CATEGORY_KEYS = TASK_CATEGORY_ENUM.values;
export const TASK_FORMAT_KEYS = TASK_FORMAT_ENUM.values;
export const PROJECT_TYPE_KEYS = TASK_PROJECT_TYPE_ENUM.values;
export const PROJECT_PHASE_KEYS = TASK_PROJECT_PHASE_ENUM.values;

/** Format imposé à une tâche récurrente. */
export const RECURRING_TASK_FORMAT = 'routine';
/** Format du raccourci « J'ai 15 minutes ». */
export const QUICK_TASK_FORMAT = 'flash';
/** Format d'une tâche d'environ une heure. */
export const SESSION_TASK_FORMAT = 'seance';

/**
 * Garde-fou de format (formulaire) : une Séance avec autant d'élèves requis, ou une
 * description aussi longue, ressemble à un projet à découper en étapes.
 */
export const PROJECT_LIKE_MIN_STUDENTS = 6;
export const PROJECT_LIKE_MIN_DESCRIPTION_CHARS = 1500;

/**
 * Vrai si une tâche Séance ressemble à un projet (suggestion non bloquante de découpage).
 * @param {{ format?: string|null, required_students?: number|string, description?: string }} task
 */
export function taskLooksLikeProject(task) {
  if (task?.format !== SESSION_TASK_FORMAT) return false;
  const students = Number(task?.required_students) || 0;
  const descriptionLength = String(task?.description ?? '').length;
  return (
    students >= PROJECT_LIKE_MIN_STUDENTS || descriptionLength > PROJECT_LIKE_MIN_DESCRIPTION_CHARS
  );
}

const LISTS = {
  category: { list: TASK_CATEGORIES, field: 'Métier' },
  format: { list: TASK_FORMATS, field: 'Format' },
  project_phase: { list: PROJECT_PHASES, field: 'Phase de projet' },
  project_type: { list: PROJECT_TYPES, field: 'Type de projet' },
};

/** Texte replié : minuscules, sans accents, espaces et tirets bas réduits. */
export function foldTaxonomyText(raw) {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
    .trim();
}

function findEntry(kind, raw) {
  const spec = LISTS[kind];
  if (!spec) throw new Error(`Taxonomie inconnue : ${kind}`);
  const folded = foldTaxonomyText(raw);
  if (!folded) return null;
  return (
    spec.list.find(
      (entry) => foldTaxonomyText(entry.key) === folded || foldTaxonomyText(entry.label) === folded,
    ) || null
  );
}

export function isValidCategory(value) {
  return TASK_CATEGORY_KEYS.includes(value);
}
export function isValidFormat(value) {
  return TASK_FORMAT_KEYS.includes(value);
}
export function isValidPhase(value) {
  return PROJECT_PHASE_KEYS.includes(value);
}
export function isValidProjectType(value) {
  return PROJECT_TYPE_KEYS.includes(value);
}

/** Clé reconnue (clé ou libellé, sans casse ni accents), ou null. */
export function normalizeCategory(raw) {
  return findEntry('category', raw)?.key ?? null;
}
export function normalizeFormat(raw) {
  return findEntry('format', raw)?.key ?? null;
}
export function normalizePhase(raw) {
  return findEntry('project_phase', raw)?.key ?? null;
}
export function normalizeProjectType(raw) {
  return findEntry('project_type', raw)?.key ?? null;
}

/**
 * Lecture d'un champ de taxonomie reçu par l'API ou l'import.
 *  - absent (`undefined`) → `{ value: undefined }` (champ non modifié) ;
 *  - vide (`null`, `''`) → `{ value: null }` (champ effacé) ;
 *  - clé ou libellé reconnu → `{ value: clé }` ;
 *  - sinon → `{ error }` (message lisible, à renvoyer en 400).
 * @param {'category'|'format'|'project_phase'|'project_type'} kind
 */
export function parseTaxonomyInput(kind, raw) {
  const spec = LISTS[kind];
  if (!spec) throw new Error(`Taxonomie inconnue : ${kind}`);
  if (raw === undefined) return { value: undefined };
  if (raw === null || foldTaxonomyText(raw) === '') return { value: null };
  const entry = findEntry(kind, raw);
  if (entry) return { value: entry.key };
  const allowed = spec.list.map((e) => e.key).join(', ');
  return { error: `${spec.field} inconnu « ${String(raw).slice(0, 40)} » (valeurs : ${allowed})` };
}

function entryOf(kind, key) {
  return LISTS[kind].list.find((e) => e.key === key) || null;
}

export function categoryInfo(key) {
  return entryOf('category', key);
}
export function formatInfo(key) {
  return entryOf('format', key);
}
export function phaseInfo(key) {
  return entryOf('project_phase', key);
}
export function projectTypeInfo(key) {
  return entryOf('project_type', key);
}

/** Étiquette lisible sans couleur : « 🪴 Jardinage », ou '' si inconnue. */
export function taxonomyTagText(kind, key) {
  const entry = entryOf(kind, key);
  if (!entry) return '';
  return entry.emoji ? `${entry.emoji} ${entry.label}` : entry.label;
}

/**
 * Format effectif d'une tâche : une récurrence impose `routine`, sinon le format reçu.
 * @param {string|null|undefined} recurrence
 * @param {string|null|undefined} format
 */
export function effectiveTaskFormat(recurrence, format) {
  if (recurrence) return RECURRING_TASK_FORMAT;
  return format ?? null;
}

/**
 * Avancement par phase d'un projet, à partir de ses tâches (`{ project_phase, status }`).
 * Phase courante : la première phase, dans l'ordre, qui a des tâches non toutes validées ;
 * `null` si toutes les phases représentées sont terminées (ou aucune n'est représentée).
 * @param {Array<{ project_phase?: string|null, status?: string }>} tasks
 */
export function computePhaseProgress(tasks) {
  const phases = PROJECT_PHASES.map((p) => ({
    key: p.key,
    label: p.label,
    total: 0,
    validated: 0,
  }));
  const byKey = new Map(phases.map((p) => [p.key, p]));
  let unphased = 0;
  for (const task of tasks || []) {
    const bucket = byKey.get(task?.project_phase);
    if (!bucket) {
      unphased += 1;
      continue;
    }
    bucket.total += 1;
    if (task?.status === 'validated') bucket.validated += 1;
  }
  const current = phases.find((p) => p.total > 0 && p.validated < p.total);
  return { phases, currentPhase: current ? current.key : null, unphased };
}
