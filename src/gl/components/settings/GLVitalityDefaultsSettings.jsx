import React from 'react';
import { AutoSaveStatus } from '../../../shared/components/AutoSaveStatus.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';

/**
 * Bloc « Valeurs initiales (nouveaux joueurs) ».
 * Composant feuille prop-driven : l'état (valeurs, auto-save) reste dans le parent.
 *
 * @param {string} healthValue PV initiaux
 * @param {string} powerValue PP initiaux
 * @param {(value:string)=>void} onHealthChange
 * @param {(value:string)=>void} onPowerChange
 * @param {string} saveStatus statut de l'auto-save
 * @param {*} saveError erreur d'auto-save éventuelle
 */
export function GLVitalityDefaultsSettings({
  healthValue,
  powerValue,
  onHealthChange,
  onPowerChange,
  saveStatus,
  saveError,
}) {
  return (
    <div className="gl-vitality-defaults gl-form">
      <h4>Valeurs initiales (nouveaux joueurs)</h4>
      <p className="gl-hint">
        S&apos;appliquent uniquement à la création d&apos;un joueur. Les comptes existants ne sont
        pas réinitialisés.
      </p>
      <div className="gl-inline-actions">
        <GLField label="PV initiaux (❤️)">
          <GLInput
            type="number"
            min={0}
            max={99}
            value={healthValue}
            disabled={saveStatus === 'saving'}
            onChange={(event) => onHealthChange(event.target.value)}
          />
        </GLField>
        <GLField label="PP initiaux (💎)">
          <GLInput
            type="number"
            min={0}
            max={99}
            value={powerValue}
            disabled={saveStatus === 'saving'}
            onChange={(event) => onPowerChange(event.target.value)}
          />
        </GLField>
        <AutoSaveStatus status={saveStatus} error={saveError} className="gl-hint" />
      </div>
    </div>
  );
}
