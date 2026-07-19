import React from 'react';
import { AutoSaveStatus } from '../../../shared/components/AutoSaveStatus.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';

/**
 * Bloc « Taille des repères sur le plateau ».
 * Composant feuille prop-driven : l'état (valeur, auto-save) reste dans le parent.
 *
 * @param {string} value valeur affichée (pourcentage)
 * @param {(value:string)=>void} onChange
 * @param {string} saveStatus statut de l'auto-save
 * @param {*} saveError erreur d'auto-save éventuelle
 */
export function GLPlateauMarkerScaleSettings({ value, onChange, saveStatus, saveError }) {
  return (
    <div className="gl-form gl-plateau-marker-scale">
      <h4>Taille des repères sur le plateau</h4>
      <p className="gl-hint">
        Ratio repères / plateau en pourcentage (100 = référence à ~480 px de hauteur affichée).
        Réglage partagé avec ForetMap (carte tâches et visite).
      </p>
      <div className="gl-inline-actions">
        <GLField label="Taille des repères (%)">
          <GLInput
            type="number"
            min={50}
            max={200}
            value={value}
            disabled={saveStatus === 'saving'}
            onChange={(event) => onChange(event.target.value)}
          />
        </GLField>
        <AutoSaveStatus status={saveStatus} error={saveError} className="gl-hint" />
      </div>
    </div>
  );
}
