import React from 'react';
import { MASCOT_MOVE_ACTOR_OPTIONS, readSelectSetting } from '../../utils/glSettingsForm.js';

/**
 * Bloc « Déplacement de la mascotte (mode classique) ».
 * Composant feuille prop-driven : aucun état interne ni appel réseau ;
 * tout enregistrement passe par `onSaveSetting(key, value)` (parent).
 *
 * @param {object} settings réglages courants
 * @param {string} savingKey clé en cours d'enregistrement
 * @param {(key:string, value:*)=>void} onSaveSetting
 */
export function GLMascotMoveSettings({ settings, savingKey, onSaveSetting }) {
  return (
    <div className="gl-form gl-mascot-move-actor">
      <label>
        Déplacement de la mascotte (mode classique)
        <select
          value={readSelectSetting(settings, 'gameplay.mascot_move_actor', 'mj')}
          disabled={savingKey === 'gameplay.mascot_move_actor'}
          onChange={(event) => onSaveSetting('gameplay.mascot_move_actor', event.target.value)}
        >
          {MASCOT_MOVE_ACTOR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <p className="gl-hint">
        Détermine qui avance la mascotte sur le plateau : le MJ, ou chaque équipe une fois par tour.
      </p>
    </div>
  );
}
