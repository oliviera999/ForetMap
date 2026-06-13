import React, { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLBrandHub } from './GLBrandHub.jsx';
import { GLBrandEditor } from './GLBrandEditor.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLInput } from './ui/GLInput.jsx';
import { GLSurface } from './ui/GLSurface.jsx';
import { normalizeBrand } from '../hooks/useGLBrandTheme.js';
import { GAMEPLAY_PRESETS } from '../constants/gameplayPresets.js';
import {
  GAMEPLAY_TOGGLES,
  MODULE_TOGGLES,
  SPELL_CAST_CONTRIBUTION_OPTIONS,
  SPELL_CAST_TEAM_SCOPE_OPTIONS,
  readGameplayFlag,
  readSelectSetting,
  settingsToIdentityFields,
  areVitalityValuesValid,
  gameplayPresetChanges,
} from '../utils/glSettingsForm.js';

export function GLSettingsView() {
  const [settings, setSettings] = useState({});
  const [title, setTitle] = useState('Gnomes & Licornes');
  const [subtitle, setSubtitle] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [applyingPresetId, setApplyingPresetId] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [defaultHealthPoints, setDefaultHealthPoints] = useState('3');
  const [defaultPowerPoints, setDefaultPowerPoints] = useState('3');
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
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement impossible');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function savePlatformIdentity(event) {
    event.preventDefault();
    const titleTrim = String(title || '').trim();
    const subtitleTrim = String(subtitle || '').trim();
    if (!titleTrim) {
      setError('Le titre plateforme est obligatoire.');
      setSuccessMessage('');
      return;
    }
    setSavingTitle(true);
    setError('');
    setSuccessMessage('');
    try {
      await apiGL('/api/gl/admin/settings/platform.title', 'PUT', { value: titleTrim });
      await apiGL('/api/gl/admin/settings/platform.subtitle', 'PUT', { value: subtitleTrim });
      await load();
      setSuccessMessage('Identité plateforme enregistrée.');
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
    } finally {
      setSavingTitle(false);
    }
  }

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

  async function applyGameplayPreset(preset) {
    if (!preset?.settings) return;
    const changes = gameplayPresetChanges(settings, preset);
    if (changes.length === 0) {
      setSuccessMessage(`Profil « ${preset.label} » déjà actif.`);
      setError('');
      return;
    }
    const ok = window.confirm(
      `Appliquer le profil « ${preset.label} » ?\n${changes.length} réglage(s) gameplay seront modifiés.`
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

  async function saveBrandSettings(event) {
    event.preventDefault();
    setSavingBrand(true);
    setError('');
    setSuccessMessage('');
    try {
      await apiGL('/api/gl/admin/settings/platform.brand', 'PUT', { value: normalizeBrand(brandDraft) });
      await load();
      setSuccessMessage('Charte visuelle enregistree.');
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
    } finally {
      setSavingBrand(false);
    }
  }

  return (
    <GLSurface className="fade-in">
      <h2>Réglages plateforme</h2>
      {error ? <p className="gl-error">{error}</p> : null}
      {successMessage ? <div className="gl-success-banner" role="status">{successMessage}</div> : null}

      <form onSubmit={savePlatformIdentity} className="gl-form">
        <GLField label="Titre plateforme">
          <GLInput value={title} onChange={(event) => setTitle(event.target.value)} />
        </GLField>
        <GLField label="Sous-titre plateforme">
          <GLInput value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
        </GLField>
        <GLButton type="submit" loading={savingTitle} disabled={savingTitle}>
          {savingTitle ? 'Enregistrement…' : 'Enregistrer'}
        </GLButton>
      </form>

      <GLSurface style={{ marginTop: 12 }} variant="inset">
        <h3>Aperçu charte importée</h3>
        <p className="gl-hint">
          Couleurs, images hero/cartes et cadres de la charte plateforme (`platform.brand`).
        </p>
        <form onSubmit={saveBrandSettings} className="gl-form">
          <GLBrandEditor
            value={brandDraft}
            onChange={(updater) => {
              setBrandDraft((prev) => normalizeBrand(typeof updater === 'function' ? updater(prev) : updater));
            }}
            onStatus={(message, isError) => {
              if (isError) setError(message);
              else setSuccessMessage(message);
            }}
            disabled={savingBrand}
          />
          <GLButton type="submit" loading={savingBrand} disabled={savingBrand}>
            {savingBrand ? 'Enregistrement…' : 'Enregistrer la charte visuelle'}
          </GLButton>
        </form>
        <GLBrandHub slots={brandDraft?.slots} compact />
      </GLSurface>

      <h3>Gameplay</h3>
      <p className="gl-hint">
        Tous les toggles sont désactivés par défaut. Le MJ active progressivement les modes
        standard puis complet selon la séance.
      </p>

      <div className="gl-gameplay-presets">
        <h4>Profils de séance</h4>
        <p className="gl-hint">
          Applique en un clic une combinaison de réglages gameplay. Les modules (sortilèges, forum, etc.)
          et le re-déclenchement des questions sur repère ne sont pas modifiés.
        </p>
        <ul className="gl-gameplay-presets-list">
          {GAMEPLAY_PRESETS.map((preset) => (
            <li key={preset.id} className="gl-gameplay-preset-card">
              <div className="gl-gameplay-preset-head">
                <strong>{preset.label}</strong>
                <GLButton
                  type="button"
                  size="sm"
                  disabled={applyingPresetId !== ''}
                  loading={applyingPresetId === preset.id}
                  onClick={() => applyGameplayPreset(preset)}
                >
                  Appliquer
                </GLButton>
              </div>
              <p className="gl-hint">{preset.description}</p>
            </li>
          ))}
        </ul>
      </div>

      <ul className="gl-gameplay-toggles">
        {GAMEPLAY_TOGGLES.map((toggle) => {
          const current = readGameplayFlag(settings, toggle.key);
          const saving = savingKey === toggle.key;
          return (
            <li key={toggle.key} className="gl-gameplay-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={current}
                  disabled={saving}
                  onChange={(event) => toggleGameplayFlag(toggle.key, event.target.checked)}
                />
                <span className="gl-gameplay-toggle-label">{toggle.label}</span>
              </label>
              <span className="gl-gameplay-toggle-hint">{toggle.hint}</span>
            </li>
          );
        })}
      </ul>

      <div className="gl-vitality-defaults gl-form">
        <h4>Valeurs initiales (nouveaux joueurs)</h4>
        <p className="gl-hint">
          S&apos;appliquent uniquement à la création d&apos;un joueur. Les comptes existants ne sont pas réinitialisés.
        </p>
        <div className="gl-inline-actions">
          <GLField label="PV initiaux (❤️)">
            <GLInput
              type="number"
              min={0}
              max={99}
              value={defaultHealthPoints}
              disabled={savingKey === 'gameplay.default_health_points'}
              onChange={(event) => setDefaultHealthPoints(event.target.value)}
            />
          </GLField>
          <GLField label="PP initiaux (💎)">
            <GLInput
              type="number"
              min={0}
              max={99}
              value={defaultPowerPoints}
              disabled={savingKey === 'gameplay.default_power_points'}
              onChange={(event) => setDefaultPowerPoints(event.target.value)}
            />
          </GLField>
          <GLButton
            type="button"
            disabled={savingKey === 'gameplay.default_health_points' || savingKey === 'gameplay.default_power_points'}
            onClick={async () => {
              const health = Number(defaultHealthPoints);
              const power = Number(defaultPowerPoints);
              if (!areVitalityValuesValid(health, power)) {
                setError('Les valeurs initiales doivent être des entiers entre 0 et 99.');
                return;
              }
              setSavingKey('gameplay.default_health_points');
              setError('');
              try {
                await apiGL('/api/gl/admin/settings/gameplay.default_health_points', 'PUT', { value: health });
                await apiGL('/api/gl/admin/settings/gameplay.default_power_points', 'PUT', { value: power });
                await load();
                setSuccessMessage('Valeurs initiales enregistrées.');
              } catch (err) {
                setError(err.message || 'Enregistrement impossible');
              } finally {
                setSavingKey('');
              }
            }}
          >
            Enregistrer les valeurs initiales
          </GLButton>
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
          <span>QCM réservé au MJ</span>
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
            onChange={async (event) => {
              const next = event.target.value;
              setSavingKey('gameplay.marker_question_retrigger');
              try {
                await apiGL('/api/gl/admin/settings/gameplay.marker_question_retrigger', 'PUT', { value: next });
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
                await apiGL('/api/gl/admin/settings/gameplay.zone_content_retrigger', 'PUT', { value: next });
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
          Contrôle l&apos;affichage du popover texte/images quand une équipe entre ou traverse une zone.
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
                await apiGL('/api/gl/admin/settings/gameplay.lore_feuillet_retrigger', 'PUT', { value: event.target.value });
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
                await apiGL('/api/gl/admin/settings/gameplay.lore_spoiler_max_level', 'PUT', { value: event.target.value });
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
                  await apiGL(`/api/gl/admin/settings/${key}`, 'PUT', { value: event.target.checked });
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

      <div className="gl-spell-cast-settings gl-form">
        <h4>Lancement de sortilèges</h4>
        <label>
          Mode de contribution
          <select
            value={readSelectSetting(settings, 'gameplay.spell_cast_contribution_mode', 'both')}
            disabled={savingKey === 'gameplay.spell_cast_contribution_mode'}
            onChange={async (event) => {
              setSavingKey('gameplay.spell_cast_contribution_mode');
              try {
                await apiGL('/api/gl/admin/settings/gameplay.spell_cast_contribution_mode', 'PUT', { value: event.target.value });
                await load();
              } catch (err) {
                setError(err.message || 'Enregistrement impossible');
              } finally {
                setSavingKey('');
              }
            }}
          >
            {SPELL_CAST_CONTRIBUTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Équipes pouvant lancer
          <select
            value={readSelectSetting(settings, 'gameplay.spell_cast_team_scope', 'any_team')}
            disabled={savingKey === 'gameplay.spell_cast_team_scope'}
            onChange={async (event) => {
              setSavingKey('gameplay.spell_cast_team_scope');
              try {
                await apiGL('/api/gl/admin/settings/gameplay.spell_cast_team_scope', 'PUT', { value: event.target.value });
                await load();
              } catch (err) {
                setError(err.message || 'Enregistrement impossible');
              } finally {
                setSavingKey('');
              }
            }}
          >
            {SPELL_CAST_TEAM_SCOPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label className="gl-gameplay-toggle-row">
          <input
            type="checkbox"
            checked={readGameplayFlag(settings, 'gameplay.spell_cast_mj_only')}
            disabled={savingKey === 'gameplay.spell_cast_mj_only'}
            onChange={async (event) => {
              setSavingKey('gameplay.spell_cast_mj_only');
              try {
                await apiGL('/api/gl/admin/settings/gameplay.spell_cast_mj_only', 'PUT', {
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
          <span>Seul le MJ peut lancer les sortilèges</span>
        </label>
        <p className="gl-hint">
          Si activé, les joueurs consultent le catalogue mais ne peuvent pas ouvrir l&apos;assistant de lancement
          (réservé au MJ sur la console / carte).
        </p>
        <p className="gl-hint">
          Activez aussi le module « Lancement de sortilèges » ci-dessous et la vitalité (gemmes / cœurs).
        </p>
      </div>

      <h3>Modules GL</h3>
      <p className="gl-hint">
        Ces drapeaux activent/désactivent les modules GL côté interface.
      </p>
      <ul className="gl-gameplay-toggles">
        {MODULE_TOGGLES.map((toggle) => {
          const current = readGameplayFlag(settings, toggle.key);
          const saving = savingKey === toggle.key;
          return (
            <li key={toggle.key} className="gl-gameplay-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={current}
                  disabled={saving}
                  onChange={(event) => toggleGameplayFlag(toggle.key, event.target.checked)}
                />
                <span className="gl-gameplay-toggle-label">{toggle.label}</span>
              </label>
              <span className="gl-gameplay-toggle-hint">{toggle.hint}</span>
            </li>
          );
        })}
      </ul>

      <details>
        <summary>État brut des réglages</summary>
        <pre>{JSON.stringify(settings, null, 2)}</pre>
      </details>
    </GLSurface>
  );
}
