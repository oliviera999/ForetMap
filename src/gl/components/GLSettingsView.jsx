import React, { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

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
];

const MODULE_TOGGLES = [
  { key: 'modules.mascot_packs_enabled', label: 'Studio mascottes', hint: 'Affiche la gestion mascottes/packs.' },
  { key: 'modules.context_comments_enabled', label: 'Commentaires contextuels', hint: 'Prépare le module commentaires GL.' },
  { key: 'modules.forum_enabled', label: 'Forum', hint: 'Prépare le module forum GL.' },
  { key: 'modules.notifications_enabled', label: 'Notifications', hint: 'Prépare le centre de notifications GL.' },
  { key: 'modules.tutorials_enabled', label: 'Tutoriels', hint: 'Prépare le module tutoriels GL.' },
  { key: 'modules.help_enabled', label: 'Aide contextuelle', hint: 'Prépare l’onboarding GL.' },
  { key: 'modules.journal_enabled', label: 'Journal/Histoire', hint: 'Affiche/masque l’onglet Histoire.' },
  { key: 'modules.kingdom_map_enabled', label: 'Carte royaume', hint: 'Prépare la carte royaume GL.' },
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
  const [savingTitle, setSavingTitle] = useState(false);

  async function load() {
    try {
      const data = await apiGL('/api/gl/admin/settings');
      const next = data?.settings || {};
      setSettings(next);
      setTitle(String(next['platform.title'] || 'Gnomes & Licornes'));
      setSubtitle(String(next['platform.subtitle'] || ''));
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

  return (
    <section className="gl-panel">
      <h2>Réglages plateforme</h2>
      {error ? <p className="gl-error">{error}</p> : null}
      {successMessage ? <div className="gl-success-banner" role="status">{successMessage}</div> : null}

      <form onSubmit={savePlatformIdentity} className="gl-form">
        <label>
          Titre plateforme
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Sous-titre plateforme
          <input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
        </label>
        <button type="submit" disabled={savingTitle}>
          {savingTitle ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>

      {settings['platform.brand'] && typeof settings['platform.brand'] === 'object' ? (
        <section className="gl-panel" style={{ marginTop: 12 }}>
          <h3>Aperçu charte importée</h3>
          <p className="gl-hint">
            Cette section est alimentée par la clé `platform.brand` (import WordPress).
          </p>
          <pre>{JSON.stringify(settings['platform.brand'], null, 2)}</pre>
        </section>
      ) : null}

      <h3>Gameplay</h3>
      <p className="gl-hint">
        Tous les toggles sont désactivés par défaut. Le MJ active progressivement les modes
        standard puis complet selon la séance.
      </p>
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
    </section>
  );
}
