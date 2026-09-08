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

/**
 * Poids par défaut de chaque recette (miroir de `RECIPE_WEIGHTS`, lib/gl/teamComposition.js),
 * uniquement pour pré-positionner les curseurs « Poids avancés » ; le serveur reste maître
 * (il borne toute surcharge dans [0, 100]).
 */
export const GL_TEAM_RECIPE_DEFAULT_WEIGHTS = Object.freeze({
  random: Object.freeze({}),
  random_memory: Object.freeze({ repeat: 0.6 }),
  carry_over: Object.freeze({}),
  mixed: Object.freeze({ repeat: 0.2, inter: 60 }),
  roles: Object.freeze({ repeat: 0.2, roles: 1, inter: 10 }),
  homogeneous: Object.freeze({ intra: 60 }),
});

/** Curseurs proposés au MJ : terme, libellé, bornes et recettes concernées. */
export const GL_TEAM_WEIGHT_SLIDERS = Object.freeze([
  Object.freeze({
    key: 'repeat',
    label: 'Éviter les binômes déjà vus',
    hint: 'Pénalise chaque paire de joueurs qui a déjà coéquipé dans les parties passées.',
    min: 0,
    max: 5,
    step: 0.1,
    recipes: ['random_memory', 'mixed', 'roles', 'homogeneous', 'random'],
  }),
  Object.freeze({
    key: 'inter',
    label: 'Équipes comparables entre elles',
    hint: 'Rapproche les moyennes de profil des équipes (recette mixte).',
    min: 0,
    max: 100,
    step: 5,
    recipes: ['mixed', 'roles'],
  }),
  Object.freeze({
    key: 'intra',
    label: 'Profils proches dans une même équipe',
    hint: 'Resserre les profils à l’intérieur de chaque équipe (groupes de besoin).',
    min: 0,
    max: 100,
    step: 5,
    recipes: ['homogeneous'],
  }),
  Object.freeze({
    key: 'roles',
    label: 'Couvrir les quatre rôles',
    hint: 'Pénalise chaque rôle (savant, éclaireur, négociant, gardien) absent d’une équipe.',
    min: 0,
    max: 10,
    step: 0.5,
    recipes: ['roles', 'mixed'],
  }),
]);

/** Curseurs pertinents pour une recette (aucun pour la reconduction). */
export function listWeightSliders(recipeId) {
  if (!recipeId || recipeId === 'carry_over') return [];
  return GL_TEAM_WEIGHT_SLIDERS.filter((slider) => slider.recipes.includes(recipeId)).map(
    (slider) => ({
      ...slider,
      defaultValue: GL_TEAM_RECIPE_DEFAULT_WEIGHTS[recipeId]?.[slider.key] ?? 0,
    }),
  );
}

/** Codes d'avertissement renvoyés par l'aperçu → phrase MJ. */
export const GL_TEAM_COMPOSE_WARNING_LABELS = Object.freeze({
  INACTIVE_EXCLUDED: 'Des joueurs inactifs ont été laissés de côté.',
  PROFILE_DATA_SPARSE:
    'Peu de données de jeu pour cette classe : les profils restent proches de la moyenne, le tirage garde une large part de hasard.',
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
