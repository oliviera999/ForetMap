/**
 * Helpers d'affichage des badges : ils vivent dans le noyau commun aux produits
 * (`src/shared/rewards/rewardsCore.js`). Ce module garde les noms historiques de la forêt.
 */
export {
  pluralizeUnit,
  earnedOf,
  progressLabel,
  groupCatalogueByFamily,
  countEarnedEntries,
  formatAwardDate,
  rewardShortLabel,
} from '../../shared/rewards/rewardsCore.js';
