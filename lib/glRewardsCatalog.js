'use strict';

/**
 * Gnomes & Licornes — catalogue des badges individuels « Tenir à deux » (spec § 12), servi
 * au client par `GET /api/gl/rewards/me` (jamais recopié dans le front).
 *
 * Même forme que le catalogue de la forêt (`lib/rewards/catalog.js`) : `{ key, family, emoji,
 * title, description, tiers?, unit?, source, metric? }`. Les mesures (`metric`) sont calculées
 * par `lib/glRewardsMetrics.js`, bornées au joueur ; les paliers portent les noms de la Trame
 * (🧵 Fil, 🪢 Nœud, 🧶 Étoffe).
 *
 * Garde-fous (règles § 1) : aucun badge ne donne de ressource ; aucun classement ; l'oiseau
 * n'est jamais nommé ; le Souffle n'est jamais personnifié ; l'erreur ne punit pas (« Pas
 * encore » est un badge de persévérance, jamais une faute). Descriptions tutoyées, niveau 6e.
 *
 * Tisserand et Révélateur (défis de la Trame, hors périmètre) restent **réservés** : ils ne
 * sont pas dans le catalogue actif (`RESERVED_REWARDS`) et ne s'attribuent jamais.
 * L'ancien « Trouveur (Opérateur) » disparaît : Trouveur compte désormais les pages trouvées ou
 * réparées par l'équipe en présence de l'élève.
 */

/** Paliers de la Trame (même forme et même nombre que `REWARD_TIERS` du noyau). */
const GL_REWARD_TIERS = Object.freeze([
  Object.freeze({ n: 1, emoji: '🧵', label: 'Fil' }),
  Object.freeze({ n: 2, emoji: '🪢', label: 'Nœud' }),
  Object.freeze({ n: 3, emoji: '🧶', label: 'Étoffe' }),
]);

/** Familles, dans l'ordre d'affichage. */
const GL_REWARD_FAMILIES = Object.freeze([
  Object.freeze({ key: 'chasse', label: 'La chasse' }),
  Object.freeze({ key: 'lecture', label: 'Lecture et pages tenues' }),
  Object.freeze({ key: 'perseverance', label: 'Persévérance' }),
  Object.freeze({ key: 'cooperation', label: 'Coopération' }),
  Object.freeze({ key: 'nature', label: 'Savoirs' }),
  Object.freeze({ key: 'veillee', label: 'Veillée' }),
  Object.freeze({ key: 'voyage', label: 'Voyage' }),
  Object.freeze({ key: 'manuel', label: 'Badges décernés' }),
]);

const GL_REWARD_CATALOGUE = Object.freeze(
  [
    {
      key: 'chasse.fouilles',
      family: 'chasse',
      emoji: '🔍',
      title: 'Fouilleur',
      description:
        'Fouille le plateau avec ton équipe : chaque fouille compte, quel que soit le verdict.',
      tiers: [5, 20, 50],
      unit: 'fouille',
      source: 'auto',
      metric: 'fouilles',
    },
    {
      key: 'chasse.pages',
      family: 'chasse',
      emoji: '📜',
      title: 'Trouveur',
      description: 'Trouve ou répare des pages avec ton équipe, quand tu es là.',
      tiers: [1, 4, 10],
      unit: 'page trouvée',
      source: 'auto',
      metric: 'pages_equipe',
    },
    {
      key: 'lecture.pages',
      family: 'lecture',
      emoji: '📖',
      title: 'Lecteur',
      description: 'Lis des pages jusqu’au bout, pendant la séance ou en veillée.',
      tiers: [3, 10, 25],
      unit: 'page lue',
      source: 'auto',
      metric: 'pages_lues',
    },
    {
      key: 'lecture.tenues',
      family: 'lecture',
      emoji: '🤲',
      title: 'Passeur de page',
      description: 'Tiens des pages pour l’autre peuple en répondant à la question de lecture.',
      tiers: [1, 4, 10],
      unit: 'page tenue',
      source: 'auto',
      metric: 'pages_tenues',
    },
    {
      key: 'perseverance.pas_encore',
      family: 'perseverance',
      emoji: '🧗',
      title: 'Pas encore',
      description:
        'Reviens après un « pas encore » et réussis la même zone, la même question ou la même case.',
      tiers: [1, 5, 15],
      unit: 'réussite après un « pas encore »',
      source: 'auto',
      metric: 'pas_encore',
    },
    {
      key: 'cooperation.dons',
      family: 'cooperation',
      emoji: '🤝',
      title: 'Mains tendues',
      description: 'Fais des dons au Marché à d’autres joueurs de ta classe.',
      tiers: [1, 3, 8],
      unit: 'don',
      source: 'auto',
      metric: 'dons',
    },
    {
      key: 'cooperation.aide',
      family: 'cooperation',
      emoji: '🫂',
      title: 'Épaule',
      description:
        'Participe aux sorts d’aide de ton équipe : Abri, Relais, Cordée, Bourrasque offerte.',
      tiers: [1, 3, 8],
      unit: 'sort d’aide',
      source: 'auto',
      metric: 'aide',
    },
    {
      key: 'cooperation.reparation',
      family: 'cooperation',
      emoji: '🪡',
      title: 'Mains de la Trame',
      description: 'Répare des pages pâlies avec ton équipe gnome, quand tu es là.',
      tiers: [1, 3, 6],
      unit: 'page réparée',
      source: 'auto',
      metric: 'reparations',
    },
    {
      key: 'nature.especes',
      family: 'nature',
      emoji: '🐾',
      title: 'Nommeur',
      description: 'Étudie des fiches d’espèces jusqu’au bout.',
      tiers: [3, 10, 25],
      unit: 'espèce étudiée',
      source: 'auto',
      metric: 'especes',
    },
    {
      key: 'nature.biomes',
      family: 'nature',
      emoji: '🗺️',
      title: 'Cartographe',
      description: 'Étudie des pages de biome jusqu’au bout.',
      tiers: [1, 3, 6],
      unit: 'page biome étudiée',
      source: 'auto',
      metric: 'biomes',
    },
    {
      key: 'veillee.semaines',
      family: 'veillee',
      emoji: '🌙',
      title: 'Veilleur',
      description: 'Reviens à la veillée plusieurs semaines de suite.',
      tiers: [2, 4, 8],
      unit: 'semaine de suite',
      source: 'auto',
      metric: 'veillee',
    },
    {
      key: 'voyage.chapitres',
      family: 'voyage',
      emoji: '🚪',
      title: 'Passeur de seuil',
      description: 'Traverse des chapitres jusqu’à leur clôture.',
      tiers: [1, 2, 4],
      unit: 'chapitre traversé',
      source: 'auto',
      metric: 'chapitres',
    },
    {
      key: 'voyage.deux_peuples',
      family: 'voyage',
      emoji: '🔀',
      title: 'Deux peuples',
      description: 'Joue un jour chez les Gnomes et un jour chez les Licornes.',
      unit: 'second peuple',
      source: 'auto',
      metric: 'deux_peuples',
    },
    // Badges décernés par le prof (`POST /api/gl/rewards/games/:id/award`), avec un mot.
    {
      key: 'manuel.chuchoteur',
      family: 'manuel',
      emoji: '🤫',
      title: 'Chuchoteur',
      description: 'Décerné quand ton équipe réussit une mission secrète.',
      source: 'manual',
    },
    {
      key: 'manuel.renard',
      family: 'manuel',
      emoji: '🦊',
      title: 'Correcteur du renard',
      description: 'Décerné quand ton équipe corrige Olu au bon moment.',
      source: 'manual',
    },
    {
      key: 'manuel.esprit_equipe',
      family: 'manuel',
      emoji: '🃏',
      title: 'Esprit d’équipe',
      description: 'Décerné par le prof, avec un mot, pour l’esprit d’équipe (cartes Team Spirit).',
      source: 'manual',
    },
  ].map((entry) =>
    Object.freeze({ ...entry, tiers: entry.tiers ? Object.freeze(entry.tiers) : undefined }),
  ),
);

/** Badges réservés (défis de la Trame, hors périmètre) : jamais attribués, jamais affichés. */
const RESERVED_REWARDS = Object.freeze([
  Object.freeze({ key: 'reserve.tisserand', title: 'Tisserand' }),
  Object.freeze({ key: 'reserve.revelateur', title: 'Révélateur' }),
]);

/** Types de badge décerné (`manuel.<type>`). */
const GL_MANUAL_REWARD_TYPES = Object.freeze(
  GL_REWARD_CATALOGUE.filter((e) => e.source === 'manual').map((e) =>
    e.key.slice('manuel.'.length),
  ),
);

module.exports = {
  GL_REWARD_TIERS,
  GL_REWARD_FAMILIES,
  GL_REWARD_CATALOGUE,
  GL_MANUAL_REWARD_TYPES,
  RESERVED_REWARDS,
};
