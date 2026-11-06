/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/taskTaxonomyCore.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

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

const {
  TASK_CATEGORY_ENUM,
  TASK_FORMAT_ENUM,
  TASK_PROJECT_PHASE_ENUM,
  TASK_PROJECT_TYPE_ENUM,
} = require('./taskEnums');

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
const TASK_CATEGORIES = buildList(TASK_CATEGORY_ENUM, CATEGORY_DETAILS);
/** Formats : `{ key, label, emoji, description }`. */
const TASK_FORMATS = buildList(TASK_FORMAT_ENUM, FORMAT_DETAILS);
/** Types de projet : `{ key, label, description }`. */
const PROJECT_TYPES = buildList(TASK_PROJECT_TYPE_ENUM, PROJECT_TYPE_DETAILS);
/** Phases de projet, dans l'ordre de la démarche : `{ key, label, emoji, phrase }`. */
const PROJECT_PHASES = buildList(TASK_PROJECT_PHASE_ENUM, PHASE_DETAILS);

const TASK_CATEGORY_KEYS = TASK_CATEGORY_ENUM.values;
const TASK_FORMAT_KEYS = TASK_FORMAT_ENUM.values;
const PROJECT_TYPE_KEYS = TASK_PROJECT_TYPE_ENUM.values;
const PROJECT_PHASE_KEYS = TASK_PROJECT_PHASE_ENUM.values;

/** Format imposé à une tâche récurrente. */
const RECURRING_TASK_FORMAT = 'routine';
/** Format du raccourci « J'ai 15 minutes ». */
const QUICK_TASK_FORMAT = 'flash';

const LISTS = {
  category: { list: TASK_CATEGORIES, field: 'Métier' },
  format: { list: TASK_FORMATS, field: 'Format' },
  project_phase: { list: PROJECT_PHASES, field: 'Phase de projet' },
  project_type: { list: PROJECT_TYPES, field: 'Type de projet' },
};

/** Texte replié : minuscules, sans accents, espaces et tirets bas réduits. */
function foldTaxonomyText(raw) {
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

function isValidCategory(value) {
  return TASK_CATEGORY_KEYS.includes(value);
}
function isValidFormat(value) {
  return TASK_FORMAT_KEYS.includes(value);
}
function isValidPhase(value) {
  return PROJECT_PHASE_KEYS.includes(value);
}
function isValidProjectType(value) {
  return PROJECT_TYPE_KEYS.includes(value);
}

/** Clé reconnue (clé ou libellé, sans casse ni accents), ou null. */
function normalizeCategory(raw) {
  return findEntry('category', raw)?.key ?? null;
}
function normalizeFormat(raw) {
  return findEntry('format', raw)?.key ?? null;
}
function normalizePhase(raw) {
  return findEntry('project_phase', raw)?.key ?? null;
}
function normalizeProjectType(raw) {
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
function parseTaxonomyInput(kind, raw) {
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

function categoryInfo(key) {
  return entryOf('category', key);
}
function formatInfo(key) {
  return entryOf('format', key);
}
function phaseInfo(key) {
  return entryOf('project_phase', key);
}
function projectTypeInfo(key) {
  return entryOf('project_type', key);
}

/** Étiquette lisible sans couleur : « 🪴 Jardinage », ou '' si inconnue. */
function taxonomyTagText(kind, key) {
  const entry = entryOf(kind, key);
  if (!entry) return '';
  return entry.emoji ? `${entry.emoji} ${entry.label}` : entry.label;
}

/**
 * Format effectif d'une tâche : une récurrence impose `routine`, sinon le format reçu.
 * @param {string|null|undefined} recurrence
 * @param {string|null|undefined} format
 */
function effectiveTaskFormat(recurrence, format) {
  if (recurrence) return RECURRING_TASK_FORMAT;
  return format ?? null;
}

/**
 * Avancement par phase d'un projet, à partir de ses tâches (`{ project_phase, status }`).
 * Phase courante : la première phase, dans l'ordre, qui a des tâches non toutes validées ;
 * `null` si toutes les phases représentées sont terminées (ou aucune n'est représentée).
 * @param {Array<{ project_phase?: string|null, status?: string }>} tasks
 */
function computePhaseProgress(tasks) {
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

module.exports = {
  TASK_CATEGORIES,
  TASK_FORMATS,
  PROJECT_TYPES,
  PROJECT_PHASES,
  TASK_CATEGORY_KEYS,
  TASK_FORMAT_KEYS,
  PROJECT_TYPE_KEYS,
  PROJECT_PHASE_KEYS,
  RECURRING_TASK_FORMAT,
  QUICK_TASK_FORMAT,
  foldTaxonomyText,
  isValidCategory,
  isValidFormat,
  isValidPhase,
  isValidProjectType,
  normalizeCategory,
  normalizeFormat,
  normalizePhase,
  normalizeProjectType,
  parseTaxonomyInput,
  categoryInfo,
  formatInfo,
  phaseInfo,
  projectTypeInfo,
  taxonomyTagText,
  effectiveTaskFormat,
  computePhaseProgress,
};
