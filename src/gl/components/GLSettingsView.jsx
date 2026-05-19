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

function readGameplayFlag(settings, key) {
  const value = settings?.[key];
  return value === true || value === 'true';
}

export function GLSettingsView() {
  const [settings, setSettings] = useState({});
  const [title, setTitle] = useState('Gnomes & Licornes');
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState('');

  async function load() {
    try {
      const data = await apiGL('/api/gl/admin/settings');
      const next = data?.settings || {};
      setSettings(next);
      setTitle(String(next['platform.title'] || 'Gnomes & Licornes'));
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement impossible');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveTitle(event) {
    event.preventDefault();
    try {
      await apiGL('/api/gl/admin/settings/platform.title', 'PUT', { value: title });
      await load();
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
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

      <form onSubmit={saveTitle} className="gl-form">
        <label>
          Titre plateforme
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <button type="submit">Enregistrer</button>
      </form>

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

      <details>
        <summary>État brut des réglages</summary>
        <pre>{JSON.stringify(settings, null, 2)}</pre>
      </details>
    </section>
  );
}
