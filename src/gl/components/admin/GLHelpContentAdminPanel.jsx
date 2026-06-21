import React, { useCallback, useEffect, useState } from 'react';

import { apiGL } from '../../services/apiGL.js';
import { AutoSaveStatus } from '../../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../../shared/hooks/useDebouncedAutoSave.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLTextarea } from '../ui/GLTextarea.jsx';
import { invalidateGlHelpConfigCache } from '../../hooks/useGlHelpContent.js';

const TAB_LABELS = {
  'tab:discovery': 'Découverte',
  'tab:maps': 'Cartes',
  'tab:ecosystemes': 'Écosystèmes',
  'tab:biodiversite': 'Biodiversité',
  'tab:glossary': 'Glossaire',
  'tab:lore-glossary': 'Lexique lore',
  'tab:selene-carnet': 'Carnet Sélène',
  'tab:history': 'Histoire',
  'tab:world': 'Le monde de G&L',
  'tab:spells': 'Sortilèges',
  'tab:rules': 'Règles du jeu',
  'tab:tutorials': 'Tutoriels',
  'tab:forum': 'Forum',
  'tab:market': 'Marché',
  'tab:journal': 'Journal',
  'tab:my-journal': 'Mon journal',
  'tab:stats': 'Statistiques',
  'tab:users': 'Gestion utilisateurs',
  'tab:contents': 'Contenus',
  'tab:settings': 'Réglages plateforme',
  'tab:mascots': 'Gestion mascottes',
  'tab:mj': 'Console MJ',
};

export function GLHelpContentAdminPanel() {
  const [draft, setDraft] = useState({ entries: {} });
  const [activeKey, setActiveKey] = useState('tab:maps');
  const [loadRevision, setLoadRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load() {
    setError('');
    const data = await apiGL('/api/gl/admin/content/help');
    setDraft(data || { entries: {} });
    setLoadRevision((value) => value + 1);
    const keys = Object.keys(data?.entries || {});
    if (keys.length && !keys.includes(activeKey)) {
      setActiveKey(keys[0]);
    }
  }

  useEffect(() => {
    load().catch((err) => setError(err.message || 'Chargement impossible'));
  }, []);

  function updateEntry(key, patch) {
    setDraft((prev) => ({
      ...prev,
      entries: {
        ...prev.entries,
        [key]: { ...prev.entries[key], ...patch },
      },
    }));
  }

  const persistHelp = useCallback(async () => {
    await apiGL('/api/gl/admin/content/help', 'PUT', draft);
    invalidateGlHelpConfigCache();
    setInfo('Bulles d’aide GL enregistrées.');
    return draft;
  }, [draft]);

  const { status: saveStatus, error: saveError } = useDebouncedAutoSave({
    value: draft,
    resetKey: loadRevision,
    onSave: persistHelp,
  });

  async function resetDefaults() {
    if (!window.confirm('Réinitialiser tous les textes d’aide GL aux valeurs par défaut ?')) return;
    setBusy(true);
    setError('');
    try {
      await apiGL('/api/gl/admin/content/help/reset', 'POST');
      invalidateGlHelpConfigCache();
      setInfo('Textes réinitialisés.');
      await load();
    } catch (err) {
      setError(err.message || 'Réinitialisation impossible');
    } finally {
      setBusy(false);
    }
  }

  const entryKeys = Object.keys(draft.entries || {}).sort((a, b) =>
    (TAB_LABELS[a] || a).localeCompare(TAB_LABELS[b] || b, 'fr'),
  );
  const entry = draft.entries?.[activeKey] || { title: '', body: '' };

  return (
    <div className="gl-panel">
      <p className="gl-hint">
        Textes des encadrés d’aide contextuelle GL (un bloc par onglet). Utilisez des lignes
        commençant par « • » pour une liste.
      </p>
      {error && <div className="auth-error">⚠️ {error}</div>}
      {saveError ? <div className="auth-error">⚠️ {saveError}</div> : null}
      <AutoSaveStatus status={saveStatus} className="gl-hint" />
      {info && <div className="auth-success">{info}</div>}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <nav
          className="gl-subtabs"
          style={{ flexDirection: 'column', alignItems: 'stretch', minWidth: 200 }}
        >
          {entryKeys.map((key) => (
            <button
              key={key}
              type="button"
              className={activeKey === key ? 'is-active' : ''}
              onClick={() => setActiveKey(key)}
              style={{ textAlign: 'left' }}
            >
              {TAB_LABELS[key] || key}
            </button>
          ))}
        </nav>

        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <GLField label="Titre">
            <GLInput
              value={entry.title || ''}
              onChange={(e) => updateEntry(activeKey, { title: e.target.value })}
            />
          </GLField>
          <GLField label="Contenu" hint="Texte ou liste (une ligne par puce).">
            <GLTextarea
              rows={8}
              value={entry.body || ''}
              onChange={(e) => updateEntry(activeKey, { body: e.target.value })}
            />
          </GLField>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <GLButton variant="secondary" disabled={busy} onClick={resetDefaults}>
          Réinitialiser aux défauts
        </GLButton>
      </div>
    </div>
  );
}
