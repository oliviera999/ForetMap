import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GatingPolicyEditor } from '../../../shared/components/GatingPolicyEditor.jsx';

const TYPE_TABS = [
  { type: 'species', label: 'Fiches espèces' },
  { type: 'glossary', label: 'Glossaire scientifique' },
  { type: 'lore_glossary', label: 'Lexique lore' },
  { type: 'tutorial', label: 'Tutoriels' },
  { type: 'feuillet', label: 'Feuillets' },
];

// G3 — réglages du conditionnement par QCM (gating.*). Écrit via l'endpoint dédié
// PUT /api/gl/learning-links/settings (validation + invalidation du cache gating),
// jamais via /api/gl/admin/settings/:key qui ne connaît pas ces clés.

export function GLGatingSettings() {
  const [gating, setGating] = useState(null);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [typeBundle, setTypeBundle] = useState({});
  const [typeBusy, setTypeBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiGL('/api/gl/learning-links/settings');
      setGating(res?.gating || null);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement des réglages de conditionnement impossible');
    }
  }, []);

  const loadTypePolicies = useCallback(async () => {
    try {
      const entries = await Promise.all(
        TYPE_TABS.map(async (t) => {
          const res = await apiGL(
            `/api/gl/learning-links/type-policy?resourceType=${encodeURIComponent(t.type)}`,
          );
          return [t.type, res || null];
        }),
      );
      setTypeBundle(Object.fromEntries(entries));
    } catch (_) {
      /* non bloquant */
    }
  }, []);

  useEffect(() => {
    load();
    loadTypePolicies();
  }, [load, loadTypePolicies]);

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

  async function saveTypePolicy(resourceType, patch) {
    setTypeBusy(resourceType);
    setError('');
    try {
      await apiGL('/api/gl/learning-links/type-policy', 'PUT', {
        resource_type: resourceType,
        ...patch,
      });
      await loadTypePolicies();
    } catch (err) {
      setError(err.message || 'Enregistrement du préréglage impossible');
    } finally {
      setTypeBusy('');
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
        <label>
          Mode par défaut
          <select
            value={gating.defaultMode}
            disabled={savingKey === 'gating.default_mode'}
            onChange={(event) => save('gating.default_mode', event.target.value)}
          >
            <option value="any">Une question réussie suffit</option>
            <option value="all">Toutes les questions liées</option>
            <option value="threshold">Un nombre minimum (seuil)</option>
            <option value="off">Désactivé par défaut</option>
          </select>
        </label>
        {gating.defaultMode === 'threshold' ? (
          <label>
            Réussites requises (mode seuil)
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
        ) : null}
        <label>
          Erreurs tolérées avant blocage
          <input
            type="number"
            min={0}
            max={10}
            defaultValue={gating.allowedWrongAttempts}
            disabled={savingKey === 'gating.allowed_wrong_attempts'}
            onBlur={(event) => {
              const n = Number(event.target.value);
              if (Number.isFinite(n) && n !== gating.allowedWrongAttempts) {
                save('gating.allowed_wrong_attempts', n);
              }
            }}
          />
        </label>
        <label>
          Questions max. par session
          <input
            type="number"
            min={1}
            max={10}
            defaultValue={gating.maxQuestionsPerSession}
            disabled={savingKey === 'gating.max_questions_per_session'}
            onBlur={(event) => {
              const n = Number(event.target.value);
              if (Number.isFinite(n) && n !== gating.maxQuestionsPerSession) {
                save('gating.max_questions_per_session', n);
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
        <label>
          Portée du blocage après erreur
          <select
            value={gating.cooldownScope || 'resource'}
            disabled={savingKey === 'gating.cooldown_scope'}
            onChange={(event) => save('gating.cooldown_scope', event.target.value)}
          >
            <option value="resource">Fiche entière</option>
            <option value="question">Question seule ratée</option>
          </select>
        </label>
        <label>
          Granularité du suivi (site)
          <select
            value={gating.granularity}
            disabled={savingKey === 'gating.granularity'}
            onChange={(event) => save('gating.granularity', event.target.value)}
          >
            <option value="player">Par joueur</option>
            <option value="team">Par équipe</option>
            {gating.granularity === 'per_resource' ? (
              <option value="per_resource">Par ressource (ancien réglage)</option>
            ) : null}
          </select>
        </label>
      </div>

      <h4>Préréglages par type de ressource</h4>
      <p className="gl-hint">
        S&apos;appliquent aux fiches sans exigence propre. Une surcharge chapitre ou scope lore peut
        encore primer (4e couche).
      </p>
      {TYPE_TABS.map((tab) => {
        const bundle = typeBundle[tab.type] || {};
        return (
          <div key={tab.type} style={{ marginBottom: 16 }}>
            <h5>{tab.label}</h5>
            <GatingPolicyEditor
              product="gl"
              layer="type"
              site={bundle.site || gating}
              policy={bundle.policy}
              effective={bundle.effective}
              effectiveSources={bundle.effectiveSources}
              resourceType={tab.type}
              busy={typeBusy === tab.type}
              onSave={(patch) => saveTypePolicy(tab.type, patch)}
              compact
            />
          </div>
        );
      })}
    </>
  );
}
