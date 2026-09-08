/**
 * Recettes de composition automatique des équipes (docs/GL_EQUIPES_AUTO_CONCEPTION.md § 4.2).
 * Libellés et explications factuelles affichés au MJ ; le moteur vit côté serveur.
 *
 * `tier` : 'v1' = disponibles sans profil ; 'v2' = s'appuient sur les six axes de profil
 * (activables par l'admin, cf. `gameplay.team_composition_profile_recipes_enabled`).
 */
export const GL_TEAM_RECIPES = Object.freeze([
  Object.freeze({
    id: 'random',
    tier: 'v1',
    label: 'Aléatoire',
    summary: 'Tirage équilibré, sans mémoire des parties précédentes.',
    detail: 'Effectifs à ±1, peuples alternés. Le plus simple pour une première partie.',
  }),
  Object.freeze({
    id: 'random_memory',
    tier: 'v1',
    label: 'Aléatoire à mémoire',
    summary: 'Évite de réunir les mêmes binômes qu’aux parties précédentes.',
    detail:
      'Le tirage privilégie les paires de joueurs qui n’ont pas encore joué ensemble (12 dernières parties, les plus récentes pèsent davantage).',
  }),
  Object.freeze({
    id: 'carry_over',
    tier: 'v1',
    label: 'Reconduire les équipes',
    summary: 'Reprend les équipes de la partie précédente de la classe.',
    detail:
      'Mêmes noms, peuples et mascottes ; les nouveaux joueurs rejoignent les équipes les moins fournies. Sans partie précédente, repli sur le tirage aléatoire.',
  }),
  Object.freeze({
    id: 'mixed',
    tier: 'v2',
    label: 'Mixte',
    summary: 'Des profils variés dans chaque équipe, des équipes comparables entre elles.',
    detail:
      'S’appuie sur les six axes de profil (savoir, exploration, échange, générosité, initiative, assiduité). Aucun score n’est affiché.',
  }),
  Object.freeze({
    id: 'roles',
    tier: 'v2',
    label: 'Complémentarité',
    summary: 'Chaque équipe réunit si possible un savant, un éclaireur, un négociant, un gardien.',
    detail: 'Le rôle dominant de chaque joueur est déduit de ses actions passées dans le jeu.',
  }),
  Object.freeze({
    id: 'homogeneous',
    tier: 'v2',
    label: 'Groupes de besoin',
    summary: 'Des équipes aux profils proches, pour différencier l’accompagnement.',
    detail: 'Réservée aux séances sans score : elle ne doit jamais servir à classer les élèves.',
    requiresNoScoring: true,
  }),
]);

export const GL_TEAM_RECIPE_BY_ID = Object.freeze(
  Object.fromEntries(GL_TEAM_RECIPES.map((recipe) => [recipe.id, recipe])),
);

/** Codes d'avertissement renvoyés par l'aperçu → phrase MJ. */
export const GL_TEAM_COMPOSE_WARNING_LABELS = Object.freeze({
  INACTIVE_EXCLUDED: 'Des joueurs inactifs ont été laissés de côté.',
  TEAMS_NOT_EMPTY:
    'Cette partie a déjà des équipes avec des joueurs : appliquer les remplacera (à confirmer).',
  TEAMS_EXIST: 'Cette partie a déjà des équipes (vides) : appliquer les remplacera.',
  NO_PREVIOUS_GAME: 'Aucune partie précédente avec équipes : tirage aléatoire utilisé.',
  MASCOT_POOL_TOO_SMALL:
    'Pas assez de mascottes typées disponibles : le nombre d’équipes a été réduit.',
  CARRY_OVER_SOURCE: 'Équipes reprises de la partie précédente.',
  LOCKS_UNSATISFIED: 'Certaines contraintes de la classe n’ont pas pu être toutes respectées.',
});

/** Filtre les recettes affichables selon les réglages (v2 activées ? score actif ?). */
export function listAvailableRecipes({
  profileRecipesEnabled = false,
  scoringEnabled = false,
} = {}) {
  return GL_TEAM_RECIPES.filter((recipe) => recipe.tier === 'v1' || profileRecipesEnabled).map(
    (recipe) => ({
      ...recipe,
      disabled: !!(recipe.requiresNoScoring && scoringEnabled),
      disabledReason:
        recipe.requiresNoScoring && scoringEnabled
          ? 'Indisponible tant que le score est activé pour cette partie.'
          : '',
    }),
  );
}
