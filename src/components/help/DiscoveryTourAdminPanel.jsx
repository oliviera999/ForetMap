import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../services/api';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';
import {
  DISCOVERY_TOURS,
  RELAUNCH_STEP,
  SHARED_TOUR_KEY,
  TOUR_EDITABLE_FIELDS,
  tourOverrideKey,
} from '../../constants/discoveryTour.js';

/**
 * Édition des textes des visites guidées (permission `tours.manage`).
 *
 * Ne présente que du texte. La structure d'un parcours — cible, placement, rôle,
 * expression du narrateur — reste en code : elle n'est pas de l'éditorial, et une
 * cible saisie à la main est le moyen le plus simple de faire disparaître une étape
 * sans aucun message d'erreur.
 *
 * Le champ vide est le geste de retour au défaut : le texte versionné s'affiche en
 * filigrane, et rien n'est stocké tant que personne n'a réécrit.
 */

const FIELD_LABELS = {
  title: 'Titre de l’étape',
  body: 'Texte (élève)',
  bodyTeacher: 'Texte (n3boss)',
};

const MAX_TEXT_LENGTH = 500;

/**
 * Sections d'édition : l'étape de relance d'abord, seule et clairement identifiée
 * comme commune, puis les 13 parcours privés de cette étape.
 *
 * `RELAUNCH_STEP` est partagé par référence : le montrer treize fois laisserait
 * croire qu'on peut l'adapter à un onglet, alors que la réécriture vaut partout.
 */
function buildSections() {
  const sections = [
    {
      key: SHARED_TOUR_KEY,
      label: 'Étape commune',
      hint: 'Dernière étape de chacune des visites guidées : réécrite ici, elle change partout.',
      steps: [RELAUNCH_STEP],
    },
  ];
  for (const [tourKey, tour] of Object.entries(DISCOVERY_TOURS)) {
    const steps = tour.steps.filter((step) => step.key !== RELAUNCH_STEP.key);
    if (steps.length === 0) continue;
    sections.push({ key: tourKey, label: tour.title, hint: '', steps });
  }
  return sections;
}

export function DiscoveryTourAdminPanel() {
  const sections = useMemo(() => buildSections(), []);
  const [registry, setRegistry] = useState(null);
  const [section, setSection] = useState(sections[0]?.key || SHARED_TOUR_KEY);
  const [loadRevision, setLoadRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    setError('');
    const data = await api('/api/settings/admin/tour-content');
    setRegistry(data?.registry && typeof data.registry === 'object' ? data.registry : {});
    setLoadRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err.message || 'Chargement impossible'));
  }, [load]);

  const persist = useCallback(async () => {
    if (!registry) return registry;
    await api('/api/settings/admin/tour-content', 'PUT', { registry });
    setInfo('Textes des visites guidées enregistrés.');
    return registry;
  }, [registry]);

  const { status: saveStatus, error: saveError } = useDebouncedAutoSave({
    value: registry,
    resetKey: loadRevision,
    enabled: registry != null,
    onSave: persist,
  });

  /** Une valeur vide retire la clé : le parcours revient au texte versionné. */
  const setField = useCallback((key, value) => {
    setRegistry((prev) => {
      const next = { ...(prev || {}) };
      if (!value.trim()) delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  async function resetDefaults() {
    if (
      !window.confirm(
        'Effacer toutes les réécritures et revenir aux textes livrés avec l’application ?',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const data = await api('/api/settings/admin/tour-content/reset', 'POST');
      setRegistry(data?.registry || {});
      setLoadRevision((value) => value + 1);
      setInfo('Textes revenus aux valeurs livrées.');
    } catch (err) {
      setError(err.message || 'Réinitialisation impossible');
    } finally {
      setBusy(false);
    }
  }

  if (error && !registry) return <div className="auth-error">⚠️ {error}</div>;
  if (!registry) {
    return (
      <div className="empty">
        <p>Chargement des visites guidées…</p>
      </div>
    );
  }

  const current = sections.find((entry) => entry.key === section) || sections[0];
  const rewrittenCount = Object.keys(registry).length;

  return (
    <div className="fade-in">
      <p className="section-sub">
        Les textes des visites guidées — ces séquences qui présentent un écran à sa première
        ouverture. Laisser un champ vide affiche le texte livré avec l’application, montré en
        filigrane.
      </p>
      {error && <div className="auth-error">⚠️ {error}</div>}
      {saveError && <div className="auth-error">⚠️ {saveError}</div>}
      {info && <div className="auth-success">{info}</div>}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <AutoSaveStatus status={saveStatus} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="muted">
            {rewrittenCount === 0
              ? 'Aucun texte réécrit'
              : `${rewrittenCount} texte${rewrittenCount > 1 ? 's' : ''} réécrit${rewrittenCount > 1 ? 's' : ''}`}
          </span>
          <button
            type="button"
            className="btn-secondary"
            onClick={resetDefaults}
            disabled={busy || rewrittenCount === 0}
          >
            Tout réinitialiser
          </button>
        </div>
      </div>

      <nav className="gl-subtabs" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        {sections.map((entry) => {
          const count = entry.steps.reduce(
            (total, step) =>
              total +
              TOUR_EDITABLE_FIELDS.filter(
                (field) => registry[tourOverrideKey(entry.key, step, field)],
              ).length,
            0,
          );
          return (
            <button
              key={entry.key}
              type="button"
              className={section === entry.key ? 'is-active' : ''}
              onClick={() => setSection(entry.key)}
            >
              {entry.label}
              {count > 0 ? ` (${count})` : ''}
            </button>
          );
        })}
      </nav>

      {current.hint && <p className="section-sub">{current.hint}</p>}

      {current.steps.map((step) => (
        <fieldset
          key={step.key}
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <legend style={{ padding: '0 6px', fontWeight: 600 }}>{step.title}</legend>
          {TOUR_EDITABLE_FIELDS.map((field) => {
            // `bodyTeacher` n'est proposé que là où le parcours en prévoit un : en créer
            // un ailleurs ferait apparaître un texte n3boss que personne n'a décidé.
            if (step[field] === undefined) return null;
            const key = tourOverrideKey(current.key, step, field);
            const value = registry[key] || '';
            return (
              <label key={field} style={{ display: 'block', marginBottom: 10 }}>
                <span style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
                  {FIELD_LABELS[field]}
                  {value ? ' · réécrit' : ''}
                </span>
                <textarea
                  value={value}
                  placeholder={step[field]}
                  rows={field === 'title' ? 1 : 3}
                  maxLength={MAX_TEXT_LENGTH}
                  onChange={(event) => setField(key, event.target.value)}
                  style={{ width: '100%' }}
                />
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

export default DiscoveryTourAdminPanel;
