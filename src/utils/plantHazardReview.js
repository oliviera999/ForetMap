/**
 * Fiches dont les dangers attendent une relecture d'enseignant (migration 271).
 *
 * Le critère n'est pas « la fiche est dangereuse » mais « quelque chose est écrit sur le
 * danger, et personne ne l'a relu ». La nuance compte : le pré-remplissage bibliographique
 * de la migration 251 a rempli une centaine de fiches d'un coup, toutes avec
 * `hazard_reviewed = 0`. Sans cette liste, un enseignant devrait ouvrir le catalogue fiche
 * par fiche pour savoir ce qu'il reste à relire.
 *
 * `aucune` compte comme information à relire : affirmer qu'une espèce est sans danger est un
 * engagement au moins aussi fort que l'inverse — c'est le cas du laurier-sauce, sosie
 * comestible du laurier-rose.
 */

import { TOXICITY_LEVEL_OPTIONS } from '../constants/plantMetaSections.js';

const TOXICITY_RANK = Object.fromEntries(
  TOXICITY_LEVEL_OPTIONS.map((entry, index) => [entry.value, index]),
);

function filled(value) {
  if (value == null) return false;
  const raw = String(value).trim();
  return raw.length > 0 && raw !== '-';
}

/** Vrai si la fiche porte une information de danger ou de risque sanitaire. */
export function plantHasHazardInfo(plant) {
  return (
    filled(plant?.toxicity_level) ||
    filled(plant?.hazard_exposure) ||
    filled(plant?.hazard_notes) ||
    filled(plant?.health_risk) ||
    filled(plant?.health_notes)
  );
}

/** Vrai si la fiche est renseignée côté danger sans avoir été relue. */
export function plantNeedsHazardReview(plant) {
  const reviewed = plant?.hazard_reviewed === 1 || plant?.hazard_reviewed === '1';
  return !reviewed && plantHasHazardInfo(plant);
}

/** Fiches à relire, les plus graves d'abord puis par nom. */
export function listPlantsNeedingHazardReview(plants) {
  const list = Array.isArray(plants) ? plants.filter(plantNeedsHazardReview) : [];
  return list.sort((a, b) => {
    const rankA = TOXICITY_RANK[String(a?.toxicity_level || '')] ?? -1;
    const rankB = TOXICITY_RANK[String(b?.toxicity_level || '')] ?? -1;
    if (rankA !== rankB) return rankB - rankA;
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'fr', {
      sensitivity: 'base',
    });
  });
}
