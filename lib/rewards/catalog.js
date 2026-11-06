'use strict';

/**
 * Catalogue des badges (ludification) — source unique côté serveur, jamais dans le front.
 *
 * Chaque entrée : `{ key, family, emoji, title, description, tiers?, source, metric? }`.
 *  - `description` est tutoyée et dit comment obtenir le badge ;
 *  - `tiers` : seuils des trois paliers phénologiques (🌸 Bourgeon, 🌼 Fleur, 🍎 Fruit) ;
 *    absent pour un badge unique (seuil 1). Un palier est une ligne `user_rewards` à part,
 *    de clé `<key>.<n>` (ex. `metier.jardinage.2`) : clé primaire respectée, palier daté ;
 *  - `source` : `auto` (calculé par `lib/rewards/evaluator.js` à partir de `metric`),
 *    `event` (attribué au moment d'un événement : séances, fresque) ou `manual` (décerné
 *    par un adulte, clé `manuel.<type>.<n>`, plusieurs fois) ;
 *  - `metric` : nom de la mesure agrégée (`lib/rewards/metrics.js`) qui donne la valeur de
 *    l'élève pour ce badge — une requête agrégée par mesure, jamais une boucle par tâche.
 *
 * Seuils calibrés sur les données du 06/11/2026 : des constantes, pas des réglages admin.
 * Garde-fous : aucun badge ne compte le niveau de danger d'une tâche ; aucun classement entre
 * élèves ; aucun badge ne se perd (jamais retiré, même si une tâche est dévalidée).
 *
 * Les clés historiques (séances, fresque) sont conservées à l'identique.
 */

const { TASK_CATEGORIES, PROJECT_PHASES } = require('../shared/taskTaxonomyCore');

/** Paliers phénologiques (seuils 1, 2, 3 du tableau `tiers`). */
const REWARD_TIERS = Object.freeze([
  Object.freeze({ n: 1, emoji: '🌸', label: 'Bourgeon' }),
  Object.freeze({ n: 2, emoji: '🌼', label: 'Fleur' }),
  Object.freeze({ n: 3, emoji: '🍎', label: 'Fruit' }),
]);

/** Familles, dans l'ordre d'affichage de « Mes badges ». */
const REWARD_FAMILIES = Object.freeze([
  Object.freeze({ key: 'metiers', label: 'Métiers' }),
  Object.freeze({ key: 'engagement', label: 'Formats et engagement' }),
  Object.freeze({ key: 'projet', label: 'Démarche de projet' }),
  Object.freeze({ key: 'polyvalence', label: 'Polyvalence' }),
  Object.freeze({ key: 'nature', label: 'Savoirs naturalistes' }),
  Object.freeze({ key: 'temps', label: 'Temps long' }),
  Object.freeze({ key: 'collectif', label: 'Collectif' }),
  Object.freeze({ key: 'seances', label: 'Séances et ateliers' }),
  Object.freeze({ key: 'manuel', label: 'Badges décernés' }),
]);

/** Unité affichée dans la progression (« encore 3 tâches de jardinage »). */
const METIER_DETAILS = Object.freeze({
  jardinage: { title: 'Main verte', tiers: [2, 6, 15], unit: 'tâche de jardinage' },
  animaux: { title: 'Refuge', tiers: [2, 5, 12], unit: 'tâche de soin aux animaux' },
  entretien: { title: 'Balai d’or', tiers: [2, 5, 12], unit: 'tâche d’entretien' },
  bricolage: { title: 'Établi', tiers: [1, 4, 10], unit: 'tâche de bricolage' },
  terrassement: { title: 'Pelle et pioche', tiers: [1, 3, 8], unit: 'tâche de terrassement' },
  rangement: { title: 'Grand ordre', tiers: [2, 5, 12], unit: 'tâche de rangement' },
  electronique: { title: 'Fer à souder', tiers: [1, 3, 8], unit: 'tâche d’électronique' },
  communication: { title: 'Porte-voix', tiers: [1, 4, 10], unit: 'tâche de communication' },
});

const PHASE_DETAILS = Object.freeze({
  concevoir: { title: 'Architecte', emoji: '📐', tiers: [1, 3, 8] },
  preparer: { title: 'Intendant', emoji: '🧰', tiers: [1, 3, 8] },
  realiser: { title: 'Bâtisseur', emoji: '🏗️', tiers: [1, 4, 10] },
  tester: { title: 'Expérimentateur', emoji: '🧪', tiers: [1, 3, 8] },
  transmettre: { title: 'Passeur', emoji: '🗣️', tiers: [1, 3, 8] },
});

const METIER_ENTRIES = TASK_CATEGORIES.map((c) => ({
  key: `metier.${c.key}`,
  family: 'metiers',
  emoji: c.emoji,
  title: METIER_DETAILS[c.key].title,
  description: `Mène à bien des tâches de ${c.label.toLowerCase()}, validées par un adulte.`,
  tiers: METIER_DETAILS[c.key].tiers,
  unit: METIER_DETAILS[c.key].unit,
  source: 'auto',
  metric: `metier:${c.key}`,
}));

const PHASE_ENTRIES = PROJECT_PHASES.map((p) => ({
  key: `phase.${p.key}`,
  family: 'projet',
  emoji: PHASE_DETAILS[p.key].emoji,
  title: PHASE_DETAILS[p.key].title,
  description: `Participe à la phase « ${p.label} » d’un projet : ${p.phrase.charAt(0).toLowerCase()}${p.phrase.slice(1)}`,
  tiers: PHASE_DETAILS[p.key].tiers,
  unit: `tâche de la phase « ${p.label} »`,
  source: 'auto',
  metric: `phase:${p.key}`,
}));

const REWARD_CATALOGUE = Object.freeze(
  [
    ...METIER_ENTRIES,
    {
      key: 'format.colibri',
      family: 'engagement',
      emoji: '🐦',
      title: 'Colibri',
      description: 'Fais ta part : termine des tâches Flash (moins de 15 minutes).',
      tiers: [3, 8, 20],
      unit: 'tâche Flash',
      source: 'auto',
      metric: 'format:flash',
    },
    {
      key: 'format.fidele',
      family: 'engagement',
      emoji: '🔁',
      title: 'Fidèle au poste',
      description:
        'Assure plusieurs fois de suite la même tâche régulière, sans sauter une occurrence.',
      tiers: [3, 6, 12],
      unit: 'occurrence de suite',
      source: 'auto',
      metric: 'fidele',
    },
    {
      key: 'engagement.parole',
      family: 'engagement',
      emoji: '🤝',
      title: 'Parole tenue',
      description: 'Va au bout des tâches où tu t’inscris, sans te désinscrire entre-temps.',
      tiers: [5, 10, 20],
      unit: 'tâche tenue de suite',
      source: 'auto',
      metric: 'parole',
    },
    ...PHASE_ENTRIES,
    {
      key: 'projet.cycle_complet',
      family: 'projet',
      emoji: '🔄',
      title: 'Cycle complet',
      description:
        'Participe à chacune des phases d’un projet validé qui en compte au moins trois.',
      unit: 'projet complet',
      source: 'auto',
      metric: 'cycle_complet',
    },
    {
      key: 'ecotone',
      family: 'polyvalence',
      emoji: '🌈',
      title: 'Écotone',
      description:
        'Essaie des métiers différents. L’écotone est la lisière entre deux milieux, là où la vie est la plus diverse.',
      tiers: [3, 5, 7],
      unit: 'métier différent',
      source: 'auto',
      metric: 'ecotone',
    },
    {
      key: 'nature.herbier',
      family: 'nature',
      emoji: '🔎',
      title: 'Herbier vivant',
      description: 'Fais valider des observations d’espèces différentes.',
      tiers: [3, 10, 25],
      unit: 'espèce observée',
      source: 'auto',
      metric: 'herbier',
    },
    {
      key: 'nature.entomo',
      family: 'nature',
      emoji: '🦋',
      title: 'Entomologiste',
      description:
        'Fais valider des observations de petites bêtes sans squelette : insectes, araignées, escargots, vers…',
      tiers: [2, 5, 12],
      unit: 'observation d’invertébré',
      source: 'auto',
      metric: 'entomo',
    },
    {
      key: 'nature.lecteur',
      family: 'nature',
      emoji: '📖',
      title: 'Lecteur de terrain',
      description: 'Lis un tutoriel, puis réponds juste à une question du quiz qui s’y rapporte.',
      tiers: [2, 5, 12],
      unit: 'tutoriel lu et compris',
      source: 'auto',
      metric: 'lecteur',
    },
    {
      key: 'nature.notion',
      family: 'nature',
      emoji: '🎯',
      title: 'Notion maîtrisée',
      description:
        'Réussis au moins 5 questions différentes d’une notion du programme, avec 8 bonnes réponses sur tes 10 dernières.',
      tiers: [1, 3, 8],
      unit: 'notion maîtrisée',
      source: 'auto',
      metric: 'notion',
    },
    {
      key: 'temps.phenologue',
      family: 'temps',
      emoji: '🍂',
      title: 'Phénologue',
      description: 'Mène des tâches à trois saisons différentes d’une même année scolaire.',
      unit: 'année aux trois saisons',
      source: 'auto',
      metric: 'phenologue',
    },
    {
      key: 'temps.racines',
      family: 'temps',
      emoji: '🌳',
      title: 'Racines',
      description: 'Mène des tâches sur deux années scolaires.',
      unit: 'seconde année',
      source: 'auto',
      metric: 'racines',
    },
    {
      key: 'collectif.semeur',
      family: 'collectif',
      emoji: '💡',
      title: 'Semeur d’idées',
      description: 'Propose des tâches qui sont acceptées par les adultes.',
      tiers: [1, 3, 8],
      unit: 'proposition acceptée',
      source: 'auto',
      metric: 'semeur',
    },
    {
      key: 'collectif.tuteur',
      family: 'collectif',
      emoji: '🧭',
      title: 'Tuteur',
      description: 'Sois référent d’une tâche menée à bien par d’autres élèves.',
      tiers: [2, 5, 12],
      unit: 'tâche accompagnée',
      source: 'auto',
      metric: 'tuteur',
    },
    // Séances et ateliers : clés historiques, inchangées.
    {
      key: 'session_first',
      family: 'seances',
      emoji: '🌱',
      title: 'Première séance',
      description: 'Tu as terminé ta première séance.',
      source: 'auto',
      metric: 'session_first',
    },
    {
      key: 'session_three',
      family: 'seances',
      emoji: '🌿',
      title: 'Explorateur',
      description: 'Tu as terminé trois séances différentes.',
      source: 'auto',
      metric: 'session_three',
    },
    {
      key: 'session_replay',
      family: 'seances',
      emoji: '🔁',
      title: 'Encore une fois',
      description: 'Tu as refait une séance déjà terminée.',
      source: 'auto',
      metric: 'session_replay',
    },
    {
      key: 'session_lycee',
      family: 'seances',
      emoji: '🌳',
      title: 'Niveau lycée',
      description: 'Tu as terminé une séance de niveau lycée.',
      source: 'auto',
      metric: 'session_lycee',
    },
    // Fresque du Climat (version Enfant) : attribué à la fin (21 cartes posées + correction
    // ouverte), quel que soit le niveau et le nombre de flèches trouvées (`lib/fresqueBoards.js`).
    {
      key: 'fresque_climat_junior',
      family: 'seances',
      emoji: '🌍',
      title: 'Fresque du Climat',
      description: 'Tu as terminé la Fresque du Climat, version Enfant.',
      source: 'event',
    },
    // Badges décernés par un adulte (`POST /api/rewards/award`), avec un mot.
    {
      key: 'manuel.sauveteur',
      family: 'manuel',
      emoji: '🛟',
      title: 'Sauveteur',
      description: 'Décerné par un adulte quand tu as porté secours à un animal.',
      source: 'manual',
    },
    {
      key: 'manuel.guide',
      family: 'manuel',
      emoji: '🎙️',
      title: 'Guide',
      description: 'Décerné par un adulte quand tu as guidé des visiteurs lors d’un événement.',
      source: 'manual',
    },
    {
      key: 'manuel.coup_de_main',
      family: 'manuel',
      emoji: '🙌',
      title: 'Coup de main',
      description: 'Décerné par un adulte pour une aide remarquable.',
      source: 'manual',
    },
  ].map((entry) =>
    Object.freeze({ ...entry, tiers: entry.tiers ? Object.freeze(entry.tiers) : undefined }),
  ),
);

const CATALOGUE_BY_KEY = new Map(REWARD_CATALOGUE.map((r) => [r.key, r]));

/** Types de badge manuel (`manuel.<type>`). */
const MANUAL_REWARD_TYPES = Object.freeze(
  REWARD_CATALOGUE.filter((r) => r.source === 'manual').map((r) => r.key.slice('manuel.'.length)),
);

/** Clé enregistrée d'un palier (`metier.jardinage.2`) ou d'un badge unique (`ecotone`). */
function tierRewardKey(entry, n) {
  return entry.tiers ? `${entry.key}.${n}` : entry.key;
}

/** Toutes les clés enregistrables d'un badge automatique (une par palier). */
function storedKeysOf(entry) {
  if (entry.source !== 'auto' && entry.source !== 'event') return [];
  if (!entry.tiers) return [entry.key];
  return entry.tiers.map((_, i) => tierRewardKey(entry, i + 1));
}

/**
 * Décompose une clé enregistrée : `{ entry, tier, occurrence }` ou null si inconnue.
 *  - `metier.jardinage.2` → palier 2 ; `ecotone` → badge unique ;
 *  - `manuel.guide.3` → troisième badge « Guide » décerné.
 */
function parseRewardKey(key) {
  const raw = String(key || '');
  if (CATALOGUE_BY_KEY.has(raw)) {
    const entry = CATALOGUE_BY_KEY.get(raw);
    return entry.tiers || entry.source === 'manual'
      ? null
      : { entry, tier: null, occurrence: null };
  }
  const m = /^(.+)\.(\d+)$/.exec(raw);
  if (!m) return null;
  const entry = CATALOGUE_BY_KEY.get(m[1]);
  if (!entry) return null;
  const n = Number(m[2]);
  if (entry.source === 'manual') return n >= 1 ? { entry, tier: null, occurrence: n } : null;
  if (!entry.tiers || n < 1 || n > entry.tiers.length) return null;
  return { entry, tier: n, occurrence: null };
}

/** Plus haut palier atteint pour une valeur (0 = aucun). */
function tierReached(entry, value) {
  const v = Number(value) || 0;
  const thresholds = entry.tiers || [1];
  let reached = 0;
  thresholds.forEach((t, i) => {
    if (v >= t) reached = i + 1;
  });
  return reached;
}

/** Entrée publique du catalogue (envoyée au front) : sans détail interne de calcul. */
function publicCatalogueEntry(entry) {
  const { metric: _metric, ...rest } = entry;
  return {
    ...rest,
    tiers: entry.tiers
      ? entry.tiers.map((threshold, i) => ({ ...REWARD_TIERS[i], threshold }))
      : null,
  };
}

module.exports = {
  REWARD_TIERS,
  REWARD_FAMILIES,
  REWARD_CATALOGUE,
  CATALOGUE_BY_KEY,
  MANUAL_REWARD_TYPES,
  tierRewardKey,
  storedKeysOf,
  parseRewardKey,
  tierReached,
  publicCatalogueEntry,
};
