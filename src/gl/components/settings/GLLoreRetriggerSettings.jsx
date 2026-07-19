import React from 'react';
import {
  readGameplayFlag,
  readSelectSetting,
  FEUILLET_PREVIEW_FIELD_OPTIONS,
  readFeuilletPreviewFields,
  toggleFeuilletPreviewField,
  FEUILLET_ACQUISITION_CHANNEL_OPTIONS,
  readFeuilletAcquisitionChannels,
  toggleFeuilletAcquisitionChannel,
} from '../../utils/glSettingsForm.js';

/**
 * Bloc « Re-déclenchements & Carnet de Sélène (lore) ».
 * Composant feuille prop-driven : aucun état interne ni appel réseau.
 * - `onSaveSetting(key, value)` : enregistre un réglage simple (comme `saveSetting` du parent).
 * - `onToggle(key, nextValue)` : bascule un drapeau gameplay avec MAJ optimiste (comme
 *   `toggleGameplayFlag` du parent) — utilisé uniquement pour le QCM réservé au MJ.
 *
 * @param {object} settings réglages courants
 * @param {string} savingKey clé en cours d'enregistrement
 * @param {(key:string, value:*)=>void} onSaveSetting
 * @param {(key:string, nextValue:*)=>void|Promise<void>} onToggle
 */
export function GLLoreRetriggerSettings({ settings, savingKey, onSaveSetting, onToggle }) {
  return (
    <div className="gl-gameplay-retrigger gl-form">
      <label className="gl-gameplay-toggle-row">
        <input
          type="checkbox"
          checked={readGameplayFlag(settings, 'gameplay.qcm_mj_only')}
          disabled={savingKey === 'gameplay.qcm_mj_only'}
          onChange={async (event) => {
            await onToggle('gameplay.qcm_mj_only', event.target.checked);
          }}
        />
        <span>QCM (biomes et lore) réservés au MJ</span>
      </label>
      <p className="gl-hint">
        Si activé, les joueurs ne voient plus le popover question à l&apos;arrivée sur un repère ;
        le MJ présente et valide depuis la carte (équipe sélectionnée).
      </p>
      <label>
        Re-déclenchement des questions sur repère
        <select
          value={readSelectSetting(settings, 'gameplay.marker_question_retrigger', 'every_arrival')}
          disabled={savingKey === 'gameplay.marker_question_retrigger'}
          onChange={(event) =>
            onSaveSetting('gameplay.marker_question_retrigger', event.target.value)
          }
        >
          <option value="every_arrival">À chaque arrivée sur le repère</option>
          <option value="once_per_team">Une fois par équipe et repère</option>
          <option value="once_per_game">Une fois par repère (toute la partie)</option>
        </select>
      </label>
      <p className="gl-hint">
        Contrôle l&apos;ouverture du popover question quand une mascotte arrive sur un repère QCM.
      </p>
      <label>
        Re-déclenchement des popovers de zone
        <select
          value={readSelectSetting(settings, 'gameplay.zone_content_retrigger', 'once_per_game')}
          disabled={savingKey === 'gameplay.zone_content_retrigger'}
          onChange={(event) => onSaveSetting('gameplay.zone_content_retrigger', event.target.value)}
        >
          <option value="every_arrival">À chaque entrée ou traversée</option>
          <option value="once_per_team">Une fois par équipe et zone</option>
          <option value="once_per_game">Une fois par zone (toute la partie)</option>
        </select>
      </label>
      <p className="gl-hint">
        Contrôle l&apos;affichage du popover texte/images quand une équipe entre ou traverse une
        zone.
      </p>
      <h4>Carnet de Sélène (lore)</h4>
      <label>
        Re-déclenchement des feuillets
        <select
          value={readSelectSetting(settings, 'gameplay.lore_feuillet_retrigger', 'once_per_team')}
          disabled={savingKey === 'gameplay.lore_feuillet_retrigger'}
          onChange={(event) =>
            onSaveSetting('gameplay.lore_feuillet_retrigger', event.target.value)
          }
        >
          <option value="every_arrival">À chaque entrée ou traversée</option>
          <option value="once_per_team">Une fois par équipe</option>
          <option value="once_per_game">Une fois par partie</option>
        </select>
      </label>
      <label>
        Plafond spoiler glossaire lore
        <select
          value={readSelectSetting(settings, 'gameplay.lore_spoiler_max_level', 'recit')}
          disabled={savingKey === 'gameplay.lore_spoiler_max_level'}
          onChange={(event) => onSaveSetting('gameplay.lore_spoiler_max_level', event.target.value)}
        >
          <option value="cle">Clé uniquement</option>
          <option value="recit">Récit</option>
          <option value="secret">Secret (MJ)</option>
        </select>
      </label>
      <fieldset className="gl-settings__preview-fields">
        <legend>Aperçu d’un feuillet non découvert</legend>
        <p className="gl-hint">
          Par défaut un feuillet n’est pas lisible tant qu’il n’a pas été trouvé sur la carte : le
          joueur n’en voit que le titre. Cochez les champs à révéler en aperçu (titre toujours
          visible).
        </p>
        {FEUILLET_PREVIEW_FIELD_OPTIONS.map(({ value, label }) => {
          const current = readFeuilletPreviewFields(settings);
          const key = 'gameplay.lore_feuillet_preview_fields';
          return (
            <label key={value} className="gl-checkbox-row">
              <input
                type="checkbox"
                checked={current.includes(value)}
                disabled={savingKey === key}
                onChange={(event) =>
                  onSaveSetting(
                    key,
                    toggleFeuilletPreviewField(current, value, event.target.checked),
                  )
                }
              />
              {label}
            </label>
          );
        })}
      </fieldset>
      <fieldset className="gl-settings__acquisition">
        <legend>Acquisition de feuillets par consultation</legend>
        <p className="gl-hint">
          Quand un joueur consulte un élément du site et réussit son QCM lié, il gagne un feuillet
          du pool du chapitre pour son équipe (le découvreur est mémorisé). Choisissez les éléments
          consultables qui peuvent en donner.
        </p>
        <label className="gl-checkbox-row">
          <input
            type="checkbox"
            checked={readGameplayFlag(settings, 'gameplay.lore_feuillet_acquisition_enabled')}
            disabled={savingKey === 'gameplay.lore_feuillet_acquisition_enabled'}
            onChange={(event) =>
              onSaveSetting('gameplay.lore_feuillet_acquisition_enabled', event.target.checked)
            }
          />
          Activer l’acquisition par consultation
        </label>
        {FEUILLET_ACQUISITION_CHANNEL_OPTIONS.map(({ value, label }) => {
          const current = readFeuilletAcquisitionChannels(settings);
          const key = 'gameplay.lore_feuillet_acquisition_channels';
          return (
            <label key={value} className="gl-checkbox-row gl-checkbox-row--indent">
              <input
                type="checkbox"
                checked={current.includes(value)}
                disabled={savingKey === key}
                onChange={(event) =>
                  onSaveSetting(
                    key,
                    toggleFeuilletAcquisitionChannel(current, value, event.target.checked),
                  )
                }
              />
              {label}
            </label>
          );
        })}
      </fieldset>
      {[
        ['gameplay.lore_effacement_enabled', 'Effacement des feuillets'],
        ['gameplay.lore_gemme_costs_enabled', 'Coûts en gemmes (feuillets)'],
        ['gameplay.lore_heart_rewards_enabled', 'Gains de cœurs (feuillets)'],
      ].map(([key, label]) => (
        <label key={key} className="gl-checkbox-row">
          <input
            type="checkbox"
            checked={readGameplayFlag(settings, key)}
            disabled={savingKey === key}
            onChange={(event) => onSaveSetting(key, event.target.checked)}
          />
          {label}
        </label>
      ))}
    </div>
  );
}
