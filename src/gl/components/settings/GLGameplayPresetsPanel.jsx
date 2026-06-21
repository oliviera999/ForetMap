import React from 'react';
import { GLButton } from '../ui/GLButton.jsx';

/**
 * Panneau « Profils de séance » : applique en un clic une combinaison de
 * réglages gameplay. Composant feuille prop-driven, état conservé par le parent.
 *
 * @param {Array<{id:string,label:string,description:string}>} presets
 * @param {string} applyingPresetId id du profil en cours d'application ('' sinon)
 * @param {(preset:object)=>void} onApply
 */
export function GLGameplayPresetsPanel({ presets, applyingPresetId, onApply }) {
  return (
    <div className="gl-gameplay-presets">
      <h4>Profils de séance</h4>
      <p className="gl-hint">
        Applique en un clic une combinaison de réglages gameplay. Les modules (sortilèges, forum,
        etc.) et le re-déclenchement des questions sur repère ne sont pas modifiés.
      </p>
      <ul className="gl-gameplay-presets-list">
        {presets.map((preset) => (
          <li key={preset.id} className="gl-gameplay-preset-card">
            <div className="gl-gameplay-preset-head">
              <strong>{preset.label}</strong>
              <GLButton
                type="button"
                size="sm"
                disabled={applyingPresetId !== ''}
                loading={applyingPresetId === preset.id}
                onClick={() => onApply(preset)}
              >
                Appliquer
              </GLButton>
            </div>
            <p className="gl-hint">{preset.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
