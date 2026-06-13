import React from 'react';

/**
 * Liste de toggles à cocher (gameplay ou modules) de la vue réglages GL.
 * Composant feuille prop-driven : aucun état interne, tout vient du parent.
 *
 * @param {Array<{key:string,label:string,hint:string}>} toggles définitions
 * @param {(settings:object, key:string)=>boolean} isChecked lecture du drapeau
 * @param {object} settings objet de réglages courant
 * @param {string} savingKey clé en cours d'enregistrement (désactive la ligne)
 * @param {(key:string, checked:boolean)=>void} onToggle
 */
export function GLGameplayTogglesList({ toggles, isChecked, settings, savingKey, onToggle }) {
  return (
    <ul className="gl-gameplay-toggles">
      {toggles.map((toggle) => {
        const current = isChecked(settings, toggle.key);
        const saving = savingKey === toggle.key;
        return (
          <li key={toggle.key} className="gl-gameplay-toggle">
            <label>
              <input
                type="checkbox"
                checked={current}
                disabled={saving}
                onChange={(event) => onToggle(toggle.key, event.target.checked)}
              />
              <span className="gl-gameplay-toggle-label">{toggle.label}</span>
            </label>
            <span className="gl-gameplay-toggle-hint">{toggle.hint}</span>
          </li>
        );
      })}
    </ul>
  );
}
