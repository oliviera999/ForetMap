import React from 'react';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { normalizedPlantValue } from '../../utils/plantFormValues.js';
import { isVegetalCatalogEntry } from '../../utils/plantCatalogHelpers.js';

/**
 * Blocs d'affichage de synthèse d'une fiche plante — extraits de `foretmap-views.jsx` (O6).
 * Présentation pure (aucun état, aucun effet) à partir de l'objet `plant`.
 */

/** Pastilles de synthèse (nutrition/nutriments, température, pH) — max 3 ; `null` si aucune. */
export function PlantSummaryBadges({ plant }) {
  const chips = [];
  const nutrition = normalizedPlantValue(plant.nutrition);
  const preferredNutrients = normalizedPlantValue(plant.preferred_nutrients);
  const temp = normalizedPlantValue(plant.ideal_temperature_c);
  const ph = normalizedPlantValue(plant.optimal_ph);
  if (isVegetalCatalogEntry(plant)) {
    if (preferredNutrients) chips.push(`🍽️ ${preferredNutrients}`);
  } else if (nutrition) {
    chips.push(`🍽️ ${nutrition}`);
  }
  if (temp) chips.push(`🌡️ ${temp}°C`);
  if (ph) chips.push(`🧪 pH ${ph}`);
  if (chips.length === 0) return null;
  return (
    <div className="plant-badges">
      {chips.slice(0, 3).map((chip, idx) => (
        <span key={`plant-badge-${idx}-${chip}`} className="plant-badge">{chip}</span>
      ))}
    </div>
  );
}

/** Rôle écologique et utilité humaine, affichés à la suite de la description (hors blocs repliables). */
export function PlantEcosystemHumanLead({ plant }) {
  const role = normalizedPlantValue(plant.ecosystem_role);
  const utility = normalizedPlantValue(plant.human_utility);
  if (!role && !utility) return null;
  return (
    <div className="plant-ecology-lead">
      {role && (
        <div className="plant-meta-item">
          <div className="plant-meta-label">Rôle dans l'écosystème</div>
          <MarkdownContent className="plant-meta-value">{role}</MarkdownContent>
        </div>
      )}
      {utility && (
        <div className="plant-meta-item">
          <div className="plant-meta-label">Utilité pour l'être humain</div>
          <MarkdownContent className="plant-meta-value">{utility}</MarkdownContent>
        </div>
      )}
    </div>
  );
}
