import React, { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';

// G3 — réglages du conditionnement par QCM (gating.*). Écrit via l'endpoint dédié
// PUT /api/gl/learning-links/settings (validation + invalidation du cache gating),
// jamais via /api/gl/admin/settings/:key qui ne connaît pas ces clés.

const MODE_OPTIONS = [
  { value: 'any', label: 'Une question réussie suffit (any)' },
  { value: 'all', label: 'Toutes les questions liées (all)' },
  { value: 'threshold', label: 'Un nombre minimum de réussites (threshold)' },
  { value: 'off', label: 'Désactivé par défaut (off)' },
];
const GRANULARITY_OPTIONS = [
  { value: 'player', label: 'Par joueur' },
  { value: 'team', label: 'Par équipe' },
  { value: 'per_resource', label: 'Par ressource' },
];

export function GLGatingSettings() {
  const [gating, setGating] = useState(null);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiGL('/api/gl/learning-links/settings');
      setGating(res?.gating || null);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement des réglages de conditionnement impossible');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(key, value) {
    setSavingKey(key);
    setError('');
    try {
      const res = await apiGL('/api/gl/learning-links/settings', 'PUT', { key, value });
      if (res?.gating) setGating(res.gating);
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
    } finally {
      setSavingKey('');
    }
  }

  if (!gating) {
    return (
      <>
        <h3>Conditionnement par QCM</h3>
        {error ? <p className="gl-error">{error}</p> : <p className="gl-hint">Chargement…</p>}
      </>
    );
  }

  return (
    <>
      <h3>Conditionnement par QCM</h3>
      <p className="gl-hint">
        Quand il est actif, un élève doit réussir la ou les questions liées à une ressource avant de
        pouvoir la marquer « apprise ». Les liens ressource ↔ question se gèrent dans
        <strong> Contenus → Conditionnement QCM</strong>.
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      <div className="gl-form">
        <label className="gl-gameplay-toggle-row">
          <input
            type="checkbox"
            checked={!!gating.enabled}
            disabled={savingKey === 'gating.enabled'}
            onChange={(event) => save('gating.enabled', event.target.checked)}
          />
          <span>Activer le conditionnement (interrupteur global)</span>
        </label>
        <label className="gl-gameplay-toggle-row">
          <input
            type="checkbox"
            checked={!!gating.autoMarkOnCorrect}
            disabled={savingKey === 'gating.auto_mark_on_correct'}
            onChange={(event) => save('gating.auto_mark_on_correct', event.target.checked)}
          />
          <span>Marquer automatiquement « appris » après une bonne réponse</span>
        </label>
        <label>
          Mode par défaut
          <select
            value={gating.defaultMode}
            disabled={savingKey === 'gating.default_mode'}
            onChange={(event) => save('gating.default_mode', event.target.value)}
          >
            {MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Granularité du suivi
          <select
            value={gating.granularity}
            disabled={savingKey === 'gating.granularity'}
            onChange={(event) => save('gating.granularity', event.target.value)}
          >
            {GRANULARITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Réussites requises (mode « threshold »)
          <input
            type="number"
            min={1}
            max={50}
            defaultValue={gating.defaultRequiredCorrect}
            disabled={savingKey === 'gating.default_required_correct'}
            onBlur={(event) => {
              const n = Number(event.target.value);
              if (Number.isFinite(n) && n !== gating.defaultRequiredCorrect) {
                save('gating.default_required_correct', n);
              }
            }}
          />
        </label>
        <label>
          Délai avant nouvelle tentative (jours, 0 = aucun)
          <input
            type="number"
            min={0}
            max={365}
            defaultValue={gating.retryCooldownDays}
            disabled={savingKey === 'gating.retry_cooldown_days'}
            onBlur={(event) => {
              const n = Number(event.target.value);
              if (Number.isFinite(n) && n !== gating.retryCooldownDays) {
                save('gating.retry_cooldown_days', n);
              }
            }}
          />
        </label>
      </div>
    </>
  );
}
