import React from 'react';
import {
  SPELL_CAST_CONTRIBUTION_OPTIONS,
  SPELL_CAST_TEAM_SCOPE_OPTIONS,
  SPELL_CAST_APPROVAL_MODE_OPTIONS,
  readGameplayFlag,
  readSelectSetting,
} from '../../utils/glSettingsForm.js';

/**
 * Bloc de réglages « Lancement de sortilèges ».
 * Composant feuille prop-driven : aucun état interne ni appel réseau ;
 * tout enregistrement passe par `onSaveSetting(key, value)` (parent).
 *
 * @param {object} settings réglages courants
 * @param {string} savingKey clé en cours d'enregistrement
 * @param {(key:string, value:*)=>void} onSaveSetting
 */
export function GLSpellCastSettings({ settings, savingKey, onSaveSetting }) {
  return (
    <div className="gl-spell-cast-settings gl-form">
      <h4>Lancement de sortilèges</h4>
      <label>
        Mode de contribution
        <select
          value={readSelectSetting(settings, 'gameplay.spell_cast_contribution_mode', 'both')}
          disabled={savingKey === 'gameplay.spell_cast_contribution_mode'}
          onChange={(event) =>
            onSaveSetting('gameplay.spell_cast_contribution_mode', event.target.value)
          }
        >
          {SPELL_CAST_CONTRIBUTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Équipes pouvant lancer
        <select
          value={readSelectSetting(settings, 'gameplay.spell_cast_team_scope', 'any_team')}
          disabled={savingKey === 'gameplay.spell_cast_team_scope'}
          onChange={(event) => onSaveSetting('gameplay.spell_cast_team_scope', event.target.value)}
        >
          {SPELL_CAST_TEAM_SCOPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Validation des sortilèges (mode classique)
        <select
          value={readSelectSetting(settings, 'gameplay.spell_cast_approval_mode', 'per_spell')}
          disabled={savingKey === 'gameplay.spell_cast_approval_mode'}
          onChange={(event) =>
            onSaveSetting('gameplay.spell_cast_approval_mode', event.target.value)
          }
        >
          {SPELL_CAST_APPROVAL_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <p className="gl-hint">
        En mode « validation MJ », un sort soumis par un joueur attend l&apos;accord du MJ avant
        tout débit de gemmes / cœurs.
      </p>
      <label className="gl-gameplay-toggle-row">
        <input
          type="checkbox"
          checked={readGameplayFlag(settings, 'gameplay.spell_cast_mj_only')}
          disabled={savingKey === 'gameplay.spell_cast_mj_only'}
          onChange={(event) => onSaveSetting('gameplay.spell_cast_mj_only', event.target.checked)}
        />
        <span>Seul le MJ peut lancer les sortilèges</span>
      </label>
      <p className="gl-hint">
        Si activé, les joueurs consultent le catalogue mais ne peuvent pas ouvrir l&apos;assistant
        de lancement (réservé au MJ sur la console / carte).
      </p>
      <p className="gl-hint">
        Activez aussi le module « Lancement de sortilèges » ci-dessous et la vitalité (gemmes /
        cœurs).
      </p>
    </div>
  );
}
