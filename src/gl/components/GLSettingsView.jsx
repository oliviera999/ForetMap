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

const GAMEPLAY_TOGGLES = [
  {
    key: 'gameplay.turns_enabled',
    camel: 'turnsEnabled',
    label: 'Tours de jeu',
    hint: 'Active la rotation des équipes (mode standard).',
  },
  {
    key: 'gameplay.narration_enabled',
    camel: 'narrationEnabled',
    label: 'Narration MJ',
    hint: 'Le MJ peut envoyer un message narratif aux joueurs (mode standard).',
  },
  {
    key: 'gameplay.player_actions_enabled',
    camel: 'playerActionsEnabled',
    label: 'Actions joueurs',
    hint: 'Les joueurs peuvent proposer une action que le MJ valide (mode complet).',
  },
  {
    key: 'gameplay.scoring_enabled',
    camel: 'scoringEnabled',
    label: 'Score par équipe',
    hint: 'Tableau de score et bonus à la validation des actions (mode complet).',
  },
  {
    key: 'gameplay.vitality_enabled',
    camel: 'vitalityEnabled',
    label: 'Points de vie et de pouvoir',
    hint: 'PV (❤️) et points de pouvoir (💎) persistants par joueur, gérés par le MJ.',
  },
];

const MODULE_TOGGLES = [
  { key: 'modules.mascot_packs_enabled', label: 'Studio mascottes', hint: 'Affiche la gestion mascottes/packs.' },
  { key: 'modules.context_comments_enabled', label: 'Commentaires contextuels', hint: 'Prépare le module commentaires GL.' },
  { key: 'modules.forum_enabled', label: 'Forum', hint: 'Prépare le module forum GL.' },
  { key: 'modules.notifications_enabled', label: 'Notifications', hint: 'Prépare le centre de notifications GL.' },
  { key: 'modules.tutorials_enabled', label: 'Tutoriels', hint: 'Prépare le module tutoriels GL.' },
  { key: 'modules.help_enabled', label: 'Aide contextuelle', hint: 'Prépare l’onboarding GL.' },
  { key: 'modules.journal_enabled', label: 'Journal/Histoire', hint: 'Affiche l’onglet Histoire et la timeline évènements de partie.' },
  { key: 'modules.player_journal_enabled', label: 'Mon journal (carnet personnel)', hint: 'Carnet éditable par chaque joueur (texte, images, encarts).' },
  { key: 'modules.zone_music_enabled', label: 'Musique des zones', hint: 'Ambiance sonore par zone sur la carte de jeu (fondus en transition). Les zones se définissent dans Contenus → Chapitres.' },
  { key: 'modules.market_enabled', label: 'Marché', hint: 'Échanges de cœurs et gemmes entre joueurs de la classe (nécessite la vitalité).' },
  { key: 'modules.spell_cast_enabled', label: 'Lancement de sortilèges', hint: 'Assistant MJ : pool multi-équipes (gemmes/cœurs). Activer aussi la vitalité et « MJ only » pour réserver le lancement au staff.' },
  { key: 'modules.virtual_dice_enabled', label: 'Dés virtuels', hint: 'Bouton et lanceur de dés D6 sur la carte de jeu (jusqu’à 5 dés).' },
];

const SPELL_CAST_CONTRIBUTION_OPTIONS = [
  { value: 'both', label: 'Les deux (soi + répartition équipe avec confirmation)' },
  { value: 'coordinator', label: 'Coordinateur (une personne répartit pour toute l’équipe)' },
  { value: 'self_only', label: 'Chaque joueur saisit uniquement sa contribution' },
];

const SPELL_CAST_TEAM_SCOPE_OPTIONS = [
  { value: 'any_team', label: 'Toutes les équipes de la partie' },
  { value: 'own_team', label: 'Uniquement son équipe' },
  { value: 'mj_any', label: 'Joueur : son équipe · MJ : toutes les équipes' },
];

function readGameplayFlag(settings, key) {
  const value = settings?.[key];
  return value === true || value === 'true';
}

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
      setTitle(String(next['platform.title'] || 'Gnomes & Licornes'));
      setSubtitle(String(next['platform.subtitle'] || ''));
      setBrandDraft(normalizeBrand(next['platform.brand'] || {}));
      const rawHealth = next['gameplay.default_health_points'];
      const rawPower = next['gameplay.default_power_points'];
      setDefaultHealthPoints(String(
        typeof rawHealth === 'number' ? rawHealth : (Number(rawHealth) || 3)
      ));
      setDefaultPowerPoints(String(
        typeof rawPower === 'number' ? rawPower : (Number(rawPower) || 3)
      ));
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
    const changes = Object.entries(preset.settings).filter(([key, value]) => {
      const current = readGameplayFlag(settings, key);
      return current !== value;
    });
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
              if (!Number.isInteger(health) || health < 0 || health > 99
                || !Number.isInteger(power) || power < 0 || power > 99) {
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
            value={String(settings['gameplay.marker_question_retrigger'] || 'every_arrival').replace(/^"|"$/g, '')}
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
            value={String(settings['gameplay.zone_content_retrigger'] || 'once_per_game').replace(/^"|"$/g, '')}
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
      </div>

      <div className="gl-spell-cast-settings gl-form">
        <h4>Lancement de sortilèges</h4>
        <label>
          Mode de contribution
          <select
            value={String(settings['gameplay.spell_cast_contribution_mode'] || 'both').replace(/^"|"$/g, '')}
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
            value={String(settings['gameplay.spell_cast_team_scope'] || 'any_team').replace(/^"|"$/g, '')}
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
