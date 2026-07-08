import React, { useCallback, useEffect, useState } from 'react';
// Styles admin/MJ : extraits de gl-theme.css, livrés avec le chunk lazy de cette vue.
import '../styles/gl-admin.css';
import { apiGL } from '../services/apiGL.js';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';
import { GLBrandHub } from './GLBrandHub.jsx';
import { GLBrandEditor } from './GLBrandEditor.jsx';
import { GLGameplayTogglesList } from './settings/GLGameplayTogglesList.jsx';
import { GLGameplayPresetsPanel } from './settings/GLGameplayPresetsPanel.jsx';
import { GLSpellCastSettings } from './settings/GLSpellCastSettings.jsx';
import { GLGatingSettings } from './settings/GLGatingSettings.jsx';
import { GLMarkerBackgroundSettings } from './settings/GLMarkerBackgroundSettings.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLInput } from './ui/GLInput.jsx';
import { GLSurface } from './ui/GLSurface.jsx';
import { normalizeBrand } from '../hooks/useGLBrandTheme.js';
import { GAMEPLAY_PRESETS } from '../constants/gameplayPresets.js';
import {
  GAMEPLAY_TOGGLES,
  MAP_DISPLAY_TOGGLES,
  MODULE_TOGGLES,
  MASCOT_MOVE_ACTOR_OPTIONS,
  readGameplayFlag,
  readPlateauMarkersVisibleSetting,
  readSelectSetting,
  settingsToIdentityFields,
  areVitalityValuesValid,
  gameplayPresetChanges,
  FEUILLET_PREVIEW_FIELD_OPTIONS,
  readFeuilletPreviewFields,
  toggleFeuilletPreviewField,
  FEUILLET_ACQUISITION_CHANNEL_OPTIONS,
  readFeuilletAcquisitionChannels,
  toggleFeuilletAcquisitionChannel,
} from '../utils/glSettingsForm.js';
import { useGlMapOverlaySettings } from '../context/GlMapOverlaySettingsContext.jsx';
import { readPlateauMarkerSizePercent } from '../../shared/mapOverlayScale.js';

export function GLSettingsView() {
  const [settings, setSettings] = useState({});
  const [title, setTitle] = useState('Gnomes & Licornes');
  const [subtitle, setSubtitle] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [applyingPresetId, setApplyingPresetId] = useState('');
  const [settingsLoadRevision, setSettingsLoadRevision] = useState(0);
  const [defaultHealthPoints, setDefaultHealthPoints] = useState('3');
  const [defaultPowerPoints, setDefaultPowerPoints] = useState('3');
  const { mapSettings, reload: reloadMapOverlaySettings } = useGlMapOverlaySettings();
  const [plateauMarkerSizePercent, setPlateauMarkerSizePercent] = useState('100');
  const [brandDraft, setBrandDraft] = useState(() => normalizeBrand({}));

  async function load() {
    try {
      const data = await apiGL('/api/gl/admin/settings');
      const next = data?.settings || {};
      setSettings(next);
      const identity = settingsToIdentityFields(next);
      setTitle(identity.title);
      setSubtitle(identity.subtitle);
      setBrandDraft(normalizeBrand(next['platform.brand'] || {}));
      setDefaultHealthPoints(identity.defaultHealthPoints);
      setDefaultPowerPoints(identity.defaultPowerPoints);
      setSettingsLoadRevision((value) => value + 1);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement impossible');
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPlateauMarkerSizePercent(String(readPlateauMarkerSizePercent(mapSettings)));
  }, [mapSettings]);

  const platformIdentity = { title, subtitle };

  const persistPlatformIdentity = useCallback(async () => {
    const titleTrim = String(title || '').trim();
    const subtitleTrim = String(subtitle || '').trim();
    if (!titleTrim) throw new Error('Le titre plateforme est obligatoire.');
    await apiGL('/api/gl/admin/settings/platform.title', 'PUT', { value: titleTrim });
    await apiGL('/api/gl/admin/settings/platform.subtitle', 'PUT', { value: subtitleTrim });
    await load();
    setSuccessMessage('Identité plateforme enregistrée.');
    return { title: titleTrim, subtitle: subtitleTrim };
  }, [title, subtitle]);

  const persistBrand = useCallback(async () => {
    const normalized = normalizeBrand(brandDraft);
    await apiGL('/api/gl/admin/settings/platform.brand', 'PUT', { value: normalized });
    await load();
    setSuccessMessage('Charte visuelle enregistrée.');
    return normalized;
  }, [brandDraft]);

  const persistMarkerSize = useCallback(async () => {
    const n = Number(plateauMarkerSizePercent);
    if (!Number.isInteger(n) || n < 50 || n > 200) {
      throw new Error('La taille des repères doit être un entier entre 50 et 200.');
    }
    await apiGL('/api/gl/admin/settings/ui.map.plateau_marker_size_percent', 'PUT', { value: n });
    await reloadMapOverlaySettings();
    setSuccessMessage('Taille des repères enregistrée.');
    return String(n);
  }, [plateauMarkerSizePercent, reloadMapOverlaySettings]);

  const vitalityDefaults = { defaultHealthPoints, defaultPowerPoints };

  const persistVitalityDefaults = useCallback(async () => {
    const health = Number(defaultHealthPoints);
    const power = Number(defaultPowerPoints);
    if (!areVitalityValuesValid(health, power)) {
      throw new Error('Les valeurs initiales doivent être des entiers entre 0 et 99.');
    }
    await apiGL('/api/gl/admin/settings/gameplay.default_health_points', 'PUT', { value: health });
    await apiGL('/api/gl/admin/settings/gameplay.default_power_points', 'PUT', { value: power });
    await load();
    setSuccessMessage('Valeurs initiales enregistrées.');
    return { defaultHealthPoints: String(health), defaultPowerPoints: String(power) };
  }, [defaultHealthPoints, defaultPowerPoints]);

  const identitySave = useDebouncedAutoSave({
    value: platformIdentity,
    resetKey: settingsLoadRevision,
    canSave: () => String(title || '').trim().length > 0,
    onSave: persistPlatformIdentity,
  });

  const brandSave = useDebouncedAutoSave({
    value: brandDraft,
    resetKey: settingsLoadRevision,
    onSave: persistBrand,
  });

  const markerSizeSave = useDebouncedAutoSave({
    value: plateauMarkerSizePercent,
    resetKey: `${settingsLoadRevision}:${readPlateauMarkerSizePercent(mapSettings)}`,
    onSave: persistMarkerSize,
  });

  const vitalitySave = useDebouncedAutoSave({
    value: vitalityDefaults,
    resetKey: settingsLoadRevision,
    onSave: persistVitalityDefaults,
  });

  async function toggleGameplayFlag(toggleKey, nextValue) {
    setSavingKey(toggleKey);
    const previous = settings;
    setSettings((prev) => ({ ...prev, [toggleKey]: nextValue }));
    try {
      await apiGL(`/api/gl/admin/settings/${toggleKey}`, 'PUT', { value: nextValue });
      await load();
    } catch (err) {
      setSettings(previous);
      setError(err.message || 'Enregistrement impossible');
    } finally {
      setSavingKey('');
    }
  }

  async function saveSetting(key, value) {
    setSavingKey(key);
    try {
      await apiGL(`/api/gl/admin/settings/${key}`, 'PUT', { value });
      await load();
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
    } finally {
      setSavingKey('');
    }
  }

  async function applyGameplayPreset(preset) {
    if (!preset?.settings) return;
    const changes = gameplayPresetChanges(settings, preset);
    if (changes.length === 0) {
      setSuccessMessage(`Profil « ${preset.label} » déjà actif.`);
      setError('');
      return;
    }
    const ok = window.confirm(
      `Appliquer le profil « ${preset.label} » ?\n${changes.length} réglage(s) gameplay seront modifiés.`,
    );
    if (!ok) return;

    setApplyingPresetId(preset.id);
    setError('');
    setSuccessMessage('');
    try {
      for (const [key, value] of Object.entries(preset.settings)) {
        await apiGL(`/api/gl/admin/settings/${key}`, 'PUT', { value });
      }
      await load();
      setSuccessMessage(`Profil « ${preset.label} » appliqué.`);
    } catch (err) {
      setError(err.message || 'Application du profil impossible');
    } finally {
      setApplyingPresetId('');
    }
  }

  return (
    <GLSurface className="fade-in">
      <h2>Réglages plateforme</h2>
      {error ? <p className="gl-error">{error}</p> : null}
      {successMessage ? (
        <div className="gl-success-banner" role="status">
          {successMessage}
        </div>
      ) : null}

      <form className="gl-form" onSubmit={(event) => event.preventDefault()}>
        <GLField label="Titre plateforme">
          <GLInput value={title} onChange={(event) => setTitle(event.target.value)} />
        </GLField>
        <GLField label="Sous-titre plateforme">
          <GLInput value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
        </GLField>
        <AutoSaveStatus
          status={identitySave.status}
          error={identitySave.error}
          className="gl-hint"
        />
      </form>

      <GLSurface style={{ marginTop: 12 }} variant="inset">
        <h3>Aperçu charte importée</h3>
        <p className="gl-hint">
          Couleurs, images hero/cartes et cadres de la charte plateforme (`platform.brand`).
        </p>
        <div className="gl-form">
          <GLBrandEditor
            value={brandDraft}
            onChange={(updater) => {
              setBrandDraft((prev) =>
                normalizeBrand(typeof updater === 'function' ? updater(prev) : updater),
              );
            }}
            onStatus={(message, isError) => {
              if (isError) setError(message);
              else setSuccessMessage(message);
            }}
            disabled={brandSave.status === 'saving'}
          />
          <AutoSaveStatus status={brandSave.status} error={brandSave.error} className="gl-hint" />
        </div>
        <GLBrandHub slots={brandDraft?.slots} compact />
      </GLSurface>

      <h3>Gameplay</h3>
      <p className="gl-hint">
        Tous les toggles sont désactivés par défaut. Le MJ active progressivement les modes standard
        puis complet selon la séance.
      </p>

      <GLGameplayPresetsPanel
        presets={GAMEPLAY_PRESETS}
        applyingPresetId={applyingPresetId}
        onApply={applyGameplayPreset}
      />

      <GLGameplayTogglesList
        toggles={GAMEPLAY_TOGGLES}
        isChecked={readGameplayFlag}
        settings={settings}
        savingKey={savingKey}
        onToggle={toggleGameplayFlag}
      />

      <div className="gl-form gl-mascot-move-actor">
        <label>
          Déplacement de la mascotte (mode classique)
          <select
            value={readSelectSetting(settings, 'gameplay.mascot_move_actor', 'mj')}
            disabled={savingKey === 'gameplay.mascot_move_actor'}
            onChange={(event) => saveSetting('gameplay.mascot_move_actor', event.target.value)}
          >
            {MASCOT_MOVE_ACTOR_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <p className="gl-hint">
          Détermine qui avance la mascotte sur le plateau : le MJ, ou chaque équipe une fois par
          tour.
        </p>
      </div>

      <h4>Affichage carte plateau</h4>
      <p className="gl-hint">
        Contrôle la visibilité des repères et des zones feuillets sur la carte en partie. Chaque
        chapitre peut surcharger ces défauts.
      </p>
      <GLGameplayTogglesList
        toggles={MAP_DISPLAY_TOGGLES}
        isChecked={(currentSettings, key) => {
          const toggle = MAP_DISPLAY_TOGGLES.find((item) => item.key === key);
          return toggle?.readChecked?.(currentSettings) ?? readGameplayFlag(currentSettings, key);
        }}
        settings={settings}
        savingKey={savingKey}
        onToggle={toggleGameplayFlag}
      />

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
              value={plateauMarkerSizePercent}
              disabled={markerSizeSave.status === 'saving'}
              onChange={(event) => setPlateauMarkerSizePercent(event.target.value)}
            />
          </GLField>
          <AutoSaveStatus
            status={markerSizeSave.status}
            error={markerSizeSave.error}
            className="gl-hint"
          />
        </div>
      </div>

      <GLMarkerBackgroundSettings settings={settings} savingKey={savingKey} onSave={saveSetting} />

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
              value={defaultHealthPoints}
              disabled={vitalitySave.status === 'saving'}
              onChange={(event) => setDefaultHealthPoints(event.target.value)}
            />
          </GLField>
          <GLField label="PP initiaux (💎)">
            <GLInput
              type="number"
              min={0}
              max={99}
              value={defaultPowerPoints}
              disabled={vitalitySave.status === 'saving'}
              onChange={(event) => setDefaultPowerPoints(event.target.value)}
            />
          </GLField>
          <AutoSaveStatus
            status={vitalitySave.status}
            error={vitalitySave.error}
            className="gl-hint"
          />
        </div>
      </div>

      <div className="gl-gameplay-retrigger gl-form">
        <label className="gl-gameplay-toggle-row">
          <input
            type="checkbox"
            checked={readGameplayFlag(settings, 'gameplay.qcm_mj_only')}
            disabled={savingKey === 'gameplay.qcm_mj_only'}
            onChange={async (event) => {
              await toggleGameplayFlag('gameplay.qcm_mj_only', event.target.checked);
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
            value={readSelectSetting(
              settings,
              'gameplay.marker_question_retrigger',
              'every_arrival',
            )}
            disabled={savingKey === 'gameplay.marker_question_retrigger'}
            onChange={async (event) => {
              const next = event.target.value;
              setSavingKey('gameplay.marker_question_retrigger');
              try {
                await apiGL('/api/gl/admin/settings/gameplay.marker_question_retrigger', 'PUT', {
                  value: next,
                });
                await load();
              } catch (err) {
                setError(err.message || 'Enregistrement impossible');
              } finally {
                setSavingKey('');
              }
            }}
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
            onChange={async (event) => {
              const next = event.target.value;
              setSavingKey('gameplay.zone_content_retrigger');
              try {
                await apiGL('/api/gl/admin/settings/gameplay.zone_content_retrigger', 'PUT', {
                  value: next,
                });
                await load();
              } catch (err) {
                setError(err.message || 'Enregistrement impossible');
              } finally {
                setSavingKey('');
              }
            }}
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
            onChange={async (event) => {
              setSavingKey('gameplay.lore_feuillet_retrigger');
              try {
                await apiGL('/api/gl/admin/settings/gameplay.lore_feuillet_retrigger', 'PUT', {
                  value: event.target.value,
                });
                await load();
              } catch (err) {
                setError(err.message || 'Enregistrement impossible');
              } finally {
                setSavingKey('');
              }
            }}
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
            onChange={async (event) => {
              setSavingKey('gameplay.lore_spoiler_max_level');
              try {
                await apiGL('/api/gl/admin/settings/gameplay.lore_spoiler_max_level', 'PUT', {
                  value: event.target.value,
                });
                await load();
              } catch (err) {
                setError(err.message || 'Enregistrement impossible');
              } finally {
                setSavingKey('');
              }
            }}
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
                  onChange={async (event) => {
                    setSavingKey(key);
                    try {
                      await apiGL(`/api/gl/admin/settings/${key}`, 'PUT', {
                        value: toggleFeuilletPreviewField(current, value, event.target.checked),
                      });
                      await load();
                    } catch (err) {
                      setError(err.message || 'Enregistrement impossible');
                    } finally {
                      setSavingKey('');
                    }
                  }}
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
            du pool du chapitre pour son équipe (le découvreur est mémorisé). Choisissez les
            éléments consultables qui peuvent en donner.
          </p>
          <label className="gl-checkbox-row">
            <input
              type="checkbox"
              checked={readGameplayFlag(settings, 'gameplay.lore_feuillet_acquisition_enabled')}
              disabled={savingKey === 'gameplay.lore_feuillet_acquisition_enabled'}
              onChange={async (event) => {
                const key = 'gameplay.lore_feuillet_acquisition_enabled';
                setSavingKey(key);
                try {
                  await apiGL(`/api/gl/admin/settings/${key}`, 'PUT', {
                    value: event.target.checked,
                  });
                  await load();
                } catch (err) {
                  setError(err.message || 'Enregistrement impossible');
                } finally {
                  setSavingKey('');
                }
              }}
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
                  onChange={async (event) => {
                    setSavingKey(key);
                    try {
                      await apiGL(`/api/gl/admin/settings/${key}`, 'PUT', {
                        value: toggleFeuilletAcquisitionChannel(
                          current,
                          value,
                          event.target.checked,
                        ),
                      });
                      await load();
                    } catch (err) {
                      setError(err.message || 'Enregistrement impossible');
                    } finally {
                      setSavingKey('');
                    }
                  }}
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
              onChange={async (event) => {
                setSavingKey(key);
                try {
                  await apiGL(`/api/gl/admin/settings/${key}`, 'PUT', {
                    value: event.target.checked,
                  });
                  await load();
                } catch (err) {
                  setError(err.message || 'Enregistrement impossible');
                } finally {
                  setSavingKey('');
                }
              }}
            />
            {label}
          </label>
        ))}
      </div>

      <GLSpellCastSettings settings={settings} savingKey={savingKey} onSaveSetting={saveSetting} />

      <GLGatingSettings />

      <h3>Modules GL</h3>
      <p className="gl-hint">Ces drapeaux activent/désactivent les modules GL côté interface.</p>
      <GLGameplayTogglesList
        toggles={MODULE_TOGGLES}
        isChecked={readGameplayFlag}
        settings={settings}
        savingKey={savingKey}
        onToggle={toggleGameplayFlag}
      />

      <details>
        <summary>État brut des réglages</summary>
        <pre>{JSON.stringify(settings, null, 2)}</pre>
      </details>
    </GLSurface>
  );
}
