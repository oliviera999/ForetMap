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
import { GLMascotMoveSettings } from './settings/GLMascotMoveSettings.jsx';
import { GLPlateauMarkerScaleSettings } from './settings/GLPlateauMarkerScaleSettings.jsx';
import { GLVitalityDefaultsSettings } from './settings/GLVitalityDefaultsSettings.jsx';
import { GLLoreRetriggerSettings } from './settings/GLLoreRetriggerSettings.jsx';
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
  readGameplayFlag,
  readPlateauMarkersVisibleSetting,
  settingsToIdentityFields,
  areVitalityValuesValid,
  gameplayPresetChanges,
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

      <GLMascotMoveSettings settings={settings} savingKey={savingKey} onSaveSetting={saveSetting} />

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

      <GLPlateauMarkerScaleSettings
        value={plateauMarkerSizePercent}
        onChange={setPlateauMarkerSizePercent}
        saveStatus={markerSizeSave.status}
        saveError={markerSizeSave.error}
      />

      <GLMarkerBackgroundSettings settings={settings} savingKey={savingKey} onSave={saveSetting} />

      <GLVitalityDefaultsSettings
        healthValue={defaultHealthPoints}
        powerValue={defaultPowerPoints}
        onHealthChange={setDefaultHealthPoints}
        onPowerChange={setDefaultPowerPoints}
        saveStatus={vitalitySave.status}
        saveError={vitalitySave.error}
      />

      <GLLoreRetriggerSettings
        settings={settings}
        savingKey={savingKey}
        onSaveSetting={saveSetting}
        onToggle={toggleGameplayFlag}
      />

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
      {readGameplayFlag(settings, 'modules.market_enabled') &&
      !readGameplayFlag(settings, 'gameplay.vitality_enabled') ? (
        <p className="gl-error" data-testid="gl-market-vitality-warning">
          ⚠️ Le Marché est activé mais la <strong>vitalité</strong> (cœurs/gemmes) ne l'est pas :
          l'onglet Marché n'apparaîtra pas chez les joueurs.{' '}
          <button
            type="button"
            className="gl-btn"
            disabled={savingKey === 'gameplay.vitality_enabled'}
            onClick={() => toggleGameplayFlag('gameplay.vitality_enabled', true)}
          >
            Activer la vitalité
          </button>
        </p>
      ) : null}

      <details>
        <summary>État brut des réglages</summary>
        <pre>{JSON.stringify(settings, null, 2)}</pre>
      </details>
    </GLSurface>
  );
}
