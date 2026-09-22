import { useMemo, useState } from 'react';
import { api } from '../../services/api';
import { listPlantsNeedingHazardReview } from '../../utils/plantHazardReview.js';
import { HEALTH_RISK_LABELS, TOXICITY_LEVEL_LABELS } from '../../constants/plantMetaSections.js';
import { IconWarning } from '../../shared/icons.jsx';

/**
 * Panneau prof « Dangers à valider » de la base biodiversité.
 *
 * Le pré-remplissage bibliographique de la migration 251 a renseigné une centaine de fiches
 * d'un coup, toutes non relues — et une modification ultérieure du danger remet la fiche dans
 * cet état (cf. `lib/plantHazardReview.js`). Sans liste dédiée, savoir ce qu'il reste à
 * relire demandait d'ouvrir le catalogue fiche par fiche.
 *
 * Le panneau ne s'affiche qu'avec la permission `plants.hazards.validate` (admin, prof) et
 * disparaît quand la file est vide : un encadré permanent « 0 à valider » n'apprend rien.
 */
export function PlantHazardReviewPanel({
  canValidate = false,
  onRefresh = null,
  onOpenPlant = null,
  onToast = null,
  plants = [],
}) {
  const [pendingId, setPendingId] = useState(null);
  const toReview = useMemo(() => listPlantsNeedingHazardReview(plants), [plants]);

  if (!canValidate || toReview.length === 0) return null;

  const validate = async (plant) => {
    setPendingId(plant.id);
    try {
      await api(`/api/plants/${plant.id}/validate-hazard`, 'POST', { reviewed: true });
      if (onRefresh) await onRefresh();
      if (onToast) onToast(`Dangers validés pour ${plant.name} ✓`);
    } catch (e) {
      if (onToast) onToast('Erreur : ' + (e.message || String(e)));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <details className="plant-hazard-review">
      <summary>
        <IconWarning size={14} /> Dangers à valider ({toReview.length})
      </summary>
      <p className="section-sub" style={{ margin: '4px 0 8px' }}>
        Fiches dont le danger ou le risque sanitaire est renseigné mais n’a pas encore été relu.
        L’avertissement s’affiche déjà aux élèves, accompagné de la mention « à valider ».
      </p>
      <ul className="plant-hazard-review__list">
        {toReview.map((plant) => {
          const level = String(plant.toxicity_level || '').trim();
          const risks = String(plant.health_risk || '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => HEALTH_RISK_LABELS[entry] || entry);
          return (
            <li key={plant.id} className="plant-hazard-review__item">
              <button
                type="button"
                className="plant-hazard-review__name"
                onClick={() => (onOpenPlant ? onOpenPlant(plant.id) : undefined)}
                disabled={!onOpenPlant}
              >
                {plant.emoji || '🌱'} {plant.name}
              </button>
              <span className="plant-hazard-review__tags">
                {level ? (
                  <span className="task-chip">{TOXICITY_LEVEL_LABELS[level] || level}</span>
                ) : null}
                {risks.map((label) => (
                  <span key={label} className="task-chip">
                    {label}
                  </span>
                ))}
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => validate(plant)}
                disabled={pendingId === plant.id}
              >
                {pendingId === plant.id ? '…' : 'Valider'}
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
