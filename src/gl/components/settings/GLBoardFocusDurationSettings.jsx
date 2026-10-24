import {
  BOARD_FOCUS_DURATION_OPTIONS,
  readBoardFocusDurationSetting,
} from '../../utils/glSettingsForm.js';

const KEY = 'gameplay.board_focus_duration_ms';

/**
 * Bloc « Durée du zoom sur le plateau ».
 * Composant feuille prop-driven : tout enregistrement passe par `onSaveSetting(key, value)`.
 *
 * @param {object} settings réglages courants
 * @param {string} savingKey clé en cours d'enregistrement
 * @param {(key:string, value:*)=>void} onSaveSetting
 */
export function GLBoardFocusDurationSettings({ settings, savingKey, onSaveSetting }) {
  const current = readBoardFocusDurationSetting(settings);
  const known = BOARD_FOCUS_DURATION_OPTIONS.some((opt) => opt.value === current);
  return (
    <div className="gl-form gl-board-focus-duration">
      <label>
        Durée du zoom sur le repère ou la zone
        <select
          value={current}
          disabled={savingKey === KEY}
          onChange={(event) => onSaveSetting(KEY, Number(event.target.value))}
        >
          {known ? null : <option value={current}>{`${current} ms`}</option>}
          {BOARD_FOCUS_DURATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <p className="gl-hint">
        Vaut pour le zoom avant le popover et pour le retour à la vue d’avant. Sans effet si
        l’appareil demande moins d’animations : la vue change alors d’un coup.
      </p>
    </div>
  );
}
