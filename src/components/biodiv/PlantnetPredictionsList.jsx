import React from 'react';
import { pickPlantnetVernacularName } from '../../utils/biodivPlantForm.js';

/**
 * Liste des propositions d'espèces Pl@ntNet — extraite de `PlantEditForm` (`foretmap-views.jsx`, O6).
 * Présentation pure : libellé (nom scientifique) + score % + nom usuel, et un bouton « Utiliser pour
 * le formulaire » par proposition. `null` si aucune proposition.
 *
 * @param {object} props
 * @param {Array} props.predictions prédictions Pl@ntNet (`scientificName`, `score`, `commonNames`…)
 * @param {boolean} [props.applying] import des photos en cours (libellé du bouton)
 * @param {boolean} [props.disabled] désactive les boutons
 * @param {(pred: object) => void} props.onApply applique une proposition au formulaire
 */
export function PlantnetPredictionsList({
  predictions = [],
  applying = false,
  disabled = false,
  onApply,
}) {
  if (!predictions || predictions.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <strong>Propositions</strong>
      {predictions.map((p, idx) => {
        const label =
          String(p.scientificName || p.scientificNameWithoutAuthor || '').trim() ||
          `Taxon ${idx + 1}`;
        const scorePct =
          p.score != null && Number.isFinite(Number(p.score))
            ? Math.round(Number(p.score) * 1000) / 10
            : null;
        const vern = pickPlantnetVernacularName(p.commonNames);
        return (
          <div
            key={`pn-id-${idx}-${label}`}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid #e6e6e6',
              background: '#fff',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {label}
                {scorePct != null ? ` — ${scorePct} %` : ''}
              </div>
              {vern && <div style={{ color: '#555', marginTop: 2 }}>{vern}</div>}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={disabled}
              onClick={() => onApply(p)}
            >
              {applying ? 'Import des photos…' : 'Utiliser pour le formulaire'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
