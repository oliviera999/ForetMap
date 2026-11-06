import { useState } from 'react';
import { readGameplayFlag, readSelectSetting } from '../../utils/glSettingsForm.js';

/**
 * Bloc « Tenir à deux » (mouture v2, spec docs/GL_TENIR_A_DEUX_REGLES.md § 15).
 * Composant feuille prop-driven : chaque changement passe par `onSaveSetting(key, value)` /
 * `onToggle(key, next)` du parent (`GLSettingsView`). Les clés JSON (fouilles, zones, bonus du
 * voile) sont éditées champ par champ ; le serveur valide la forme (clés attendues, bornes).
 */

const TENIR_FLAGS = [
  ['gameplay.tenir_enabled', 'Mouture « Tenir à deux » active (nouvelles parties)'],
  ['gameplay.tenir_questions_de_case', 'Question de case : juste → +1 case et on relance'],
  ['gameplay.tenir_vent', 'Vent de la caravane (dernière équipe +3 à l’ouverture)'],
  ['gameplay.tenir_voile', 'Le voile'],
  ['gameplay.tenir_marche', 'Marché (place, dons, parures)'],
  ['gameplay.tenir_marche_pendant_tour', 'Marché pendant le tour (tablette / hybride)'],
  ['gameplay.tenir_parures', 'Parures au comptoir'],
  ['gameplay.tenir_lumiere', 'Lumière (option : cartes Team Spirit → paliers)'],
  ['gameplay.tenir_cartes_vers_cases', 'Cartes Team Spirit → cases à l’ouverture suivante'],
  ['gameplay.tenir_chapardeur', 'Chapardeur (une fois par chapitre)'],
  ['gameplay.tenir_peripeties', 'Péripéties sur les cases événement sans texte'],
  ['gameplay.tenir_olu_erreur_du_jour', 'Erreur du jour d’Olu'],
  [
    'gameplay.feuillet_zone_traversal_enabled',
    'Ancien déclenchement des zones feuillets à la traversée',
  ],
];

const TENIR_NUMBERS = [
  ['gameplay.tenir_des_count', 'Dés du geste Lancer', 1, 5],
  ['gameplay.tenir_vent_cases', 'Cases du vent', 1, 12],
  ['gameplay.tenir_pistes_par_semaine', 'Pistes de veillée par semaine', 0, 20],
  ['gameplay.tenir_pages_veillee_par_semaine', 'Ouvertures gagnantes en veillée / semaine', 0, 20],
  ['gameplay.tenir_palissement_pct', 'Pâlissement par tour (%)', 0, 100],
  ['gameplay.tenir_palissement_max', 'Pâlissement maximum (%)', 0, 100],
  ['gameplay.tenir_recul_carnet_complet', 'Recul du voile au carnet complet', 0, 20],
  ['gameplay.tenir_recul_lumiere', 'Recul du voile à la Lumière', 0, 20],
  ['gameplay.tenir_lumiere_palier', 'Palier de la Lumière (cartes)', 1, 999],
  ['gameplay.tenir_sablier_secondes', 'Sablier au tableau (secondes)', 10, 3600],
  ['gameplay.max_health_points', 'Cœurs maximum', 0, 99],
  ['gameplay.max_power_points', 'Gemmes maximum', 0, 99],
];

export function readNumberSetting(settings, key, fallback) {
  const raw = settings?.[key];
  const n = Number(typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : raw);
  return Number.isFinite(n) ? n : fallback;
}

export function readJsonSetting(settings, key, fallback) {
  const raw = settings?.[key];
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function NumberRow({ settingsKey, label, min, max, settings, savingKey, onSaveSetting }) {
  const current = readNumberSetting(settings, settingsKey, min);
  const [value, setValue] = useState(String(current));
  const disabled = savingKey === settingsKey;
  return (
    <label className="gl-tenir-settings__row">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          const n = Number(value);
          if (Number.isInteger(n) && n !== current) onSaveSetting(settingsKey, n);
        }}
      />
    </label>
  );
}

function JsonMapRow({ settingsKey, label, keys, settings, savingKey, onSaveSetting, step = 1 }) {
  const current = readJsonSetting(settings, settingsKey, {});
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(keys.map(([k]) => [k, String(current?.[k] ?? '')])),
  );
  const disabled = savingKey === settingsKey;
  return (
    <fieldset className="gl-tenir-settings__map">
      <legend>{label}</legend>
      {keys.map(([k, sub]) => (
        <label key={k}>
          <span>{sub}</span>
          <input
            type="number"
            step={step}
            value={draft[k]}
            disabled={disabled}
            onChange={(event) => setDraft((prev) => ({ ...prev, [k]: event.target.value }))}
            onBlur={() => {
              const next = Object.fromEntries(keys.map(([key]) => [key, Number(draft[key])]));
              if (keys.every(([key]) => Number.isFinite(next[key]))) {
                const changed = keys.some(([key]) => Number(current?.[key]) !== next[key]);
                if (changed) onSaveSetting(settingsKey, next);
              }
            }}
          />
        </label>
      ))}
    </fieldset>
  );
}

export function GLTenirSettings({ settings, savingKey, onSaveSetting, onToggle }) {
  const surface = readSelectSetting(settings, 'gameplay.tenir_surface', 'tableau');
  const desMode = readSelectSetting(settings, 'gameplay.tenir_des_mode', 'physique');
  const validation = readSelectSetting(settings, 'gameplay.tenir_des_physiques_validation', 'prof');
  return (
    <div className="gl-tenir-settings gl-form" data-testid="gl-tenir-settings">
      <h4>Tenir à deux (mouture v2)</h4>
      <p className="gl-hint">
        Deux monnaies par élève (plafond 8/8), chasse aux pages, voile, grimoire exécuté, Marché
        complet. Chaque partie porte un profil (<em>complet</em> ou <em>prologue</em>) et peut
        surcharger la surface, les dés, le voile, le Marché, le chapardeur et les péripéties.
      </p>
      {TENIR_FLAGS.map(([key, label]) => (
        <label key={key} className="gl-gameplay-toggle-row">
          <input
            type="checkbox"
            checked={readGameplayFlag(settings, key)}
            disabled={savingKey === key}
            onChange={async (event) => {
              await onToggle(key, event.target.checked);
            }}
          />
          <span>{label}</span>
        </label>
      ))}
      <label>
        Surface par défaut d’une nouvelle partie
        <select
          value={surface}
          disabled={savingKey === 'gameplay.tenir_surface'}
          onChange={(event) => onSaveSetting('gameplay.tenir_surface', event.target.value)}
        >
          <option value="tableau">Tableau (une équipe active, sablier)</option>
          <option value="hybride">Hybride (tablettes d’équipe + tableau)</option>
          <option value="tablette">Tablette (équipes en parallèle)</option>
        </select>
      </label>
      <label>
        Dés (surface par défaut)
        <select
          value={desMode}
          disabled={savingKey === 'gameplay.tenir_des_mode'}
          onChange={(event) => onSaveSetting('gameplay.tenir_des_mode', event.target.value)}
        >
          <option value="physique">Physiques (faces saisies)</option>
          <option value="serveur">Serveur (tirés par l’application)</option>
        </select>
      </label>
      <label>
        Validation d’une saisie physique sur tablette
        <select
          value={validation}
          disabled={savingKey === 'gameplay.tenir_des_physiques_validation'}
          onChange={(event) =>
            onSaveSetting('gameplay.tenir_des_physiques_validation', event.target.value)
          }
        >
          <option value="prof">Un clic du prof</option>
          <option value="auto">Automatique</option>
        </select>
      </label>
      <div className="gl-tenir-settings__numbers">
        {TENIR_NUMBERS.map(([key, label, min, max]) => (
          <NumberRow
            key={key}
            settingsKey={key}
            label={label}
            min={min}
            max={max}
            settings={settings}
            savingKey={savingKey}
            onSaveSetting={onSaveSetting}
          />
        ))}
      </div>
      <JsonMapRow
        settingsKey="gameplay.tenir_fouilles_par_tour"
        label="Fouilles par tour"
        keys={[
          ['gnome', 'Gnomes'],
          ['unicorn', 'Licornes'],
        ]}
        settings={settings}
        savingKey={savingKey}
        onSaveSetting={onSaveSetting}
      />
      <JsonMapRow
        settingsKey="gameplay.tenir_zones_par_plateau"
        label="Zones de chasse par plateau"
        keys={[
          ['1', 'Plateau 1'],
          ['2', 'Plateau 2'],
          ['3', 'Plateau 3'],
          ['4', 'Plateau 4'],
        ]}
        settings={settings}
        savingKey={savingKey}
        onSaveSetting={onSaveSetting}
      />
      <JsonMapRow
        settingsKey="gameplay.tenir_voile_bonus_par_plateau"
        label="Bonus du dé gris par plateau"
        keys={[
          ['1', 'Plateau 1'],
          ['2', 'Plateau 2'],
          ['3', 'Plateau 3'],
          ['4', 'Plateau 4'],
        ]}
        settings={settings}
        savingKey={savingKey}
        onSaveSetting={onSaveSetting}
      />
      <JsonMapRow
        settingsKey="gameplay.tenir_fouille_seuils"
        label="Seuils des verdicts (distance normalisée au centre)"
        keys={[
          ['chaud', 'Chaud (≤)'],
          ['tiede', 'Tiède (≤)'],
        ]}
        step={0.01}
        settings={settings}
        savingKey={savingKey}
        onSaveSetting={onSaveSetting}
      />
    </div>
  );
}
