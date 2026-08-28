import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api.js';

import { GatingPolicyEditor } from '../../shared/components/GatingPolicyEditor.jsx';

const MODE_OPTIONS = [
  { value: 'any', label: 'Une question réussie suffit' },
  { value: 'all', label: 'Toutes les questions liées' },
  { value: 'threshold', label: 'Un nombre minimum (seuil)' },
  { value: 'off', label: 'Désactivé par défaut' },
];

const TYPE_TABS = [
  { type: 'tutorial', label: 'Tutoriels' },
  { type: 'plant', label: 'Fiches espèces' },
  { type: 'glossary', label: 'Glossaire' },
];

const COOLDOWN_SCOPE_OPTIONS = [
  { value: 'resource', label: 'Fiche entière' },
  { value: 'question', label: 'Question seule ratée' },
];

function readBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function readNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function FMLearningGatingSettings({ get, saveSetting, savingKey = '' }) {
  const [typeBundle, setTypeBundle] = useState({});
  const [typeBusy, setTypeBusy] = useState('');
  const [typeError, setTypeError] = useState('');

  const enabled = readBool(get('learning.gating.enabled', false));
  const defaultMode = String(get('learning.gating.default_mode', 'any') || 'any');
  const defaultRequired = readNumber(get('learning.gating.default_required_correct', 1), 1);

  const loadTypePolicies = useCallback(async () => {
    try {
      const entries = await Promise.all(
        TYPE_TABS.map(async (t) => {
          const res = await api(
            `/api/learning-links/type-policy?resourceType=${encodeURIComponent(t.type)}`,
          );
          return [t.type, res || null];
        }),
      );
      setTypeBundle(Object.fromEntries(entries));
      setTypeError('');
    } catch (err) {
      setTypeError(err.message || 'Chargement des préréglages par type impossible');
    }
  }, []);

  useEffect(() => {
    loadTypePolicies();
  }, [loadTypePolicies]);

  async function saveTypePolicy(resourceType, patch) {
    setTypeBusy(resourceType);
    setTypeError('');
    try {
      await api('/api/learning-links/type-policy', 'PUT', {
        resource_type: resourceType,
        ...patch,
      });
      await loadTypePolicies();
    } catch (err) {
      setTypeError(err.message || 'Enregistrement impossible');
    } finally {
      setTypeBusy('');
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16, padding: 16 }} id="settings-learning-gating">
      <h3 style={{ marginTop: 0 }}>Validation des lectures (contrôle de compréhension)</h3>
      <p className="section-sub">
        Quand il est actif, un élève doit réussir la ou les questions liées à un contenu avant de
        pouvoir confirmer sa lecture. Les rattachements se gèrent dans{' '}
        <strong>Quiz → Rattacher des questions aux contenus</strong>.
      </p>
      {typeError ? <p className="pedago-qcm-admin__error">{typeError}</p> : null}

      <div className="pedago-links__policy" style={{ display: 'grid', gap: 12 }}>
        <label className="pedago-filter-field">
          <span>
            <input
              type="checkbox"
              checked={enabled}
              disabled={savingKey === 'learning.gating.enabled'}
              onChange={(e) => saveSetting('learning.gating.enabled', e.target.checked)}
            />{' '}
            Exiger des questions avant de valider une lecture
          </span>
        </label>

        <label className="pedago-filter-field">
          <span>Exigence par défaut (site)</span>
          <select
            className="form-select"
            value={defaultMode}
            disabled={savingKey === 'learning.gating.default_mode'}
            onChange={(e) => saveSetting('learning.gating.default_mode', e.target.value)}
          >
            {MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {defaultMode === 'threshold' ? (
          <label className="pedago-filter-field">
            <span>Nombre de bonnes réponses attendues (mode seuil)</span>
            <input
              type="number"
              className="form-input"
              min={1}
              max={50}
              value={defaultRequired}
              disabled={savingKey === 'learning.gating.default_required_correct'}
              onChange={(e) => {
                const n = readNumber(e.target.value, defaultRequired);
                if (Number.isFinite(n)) saveSetting('learning.gating.default_required_correct', n);
              }}
            />
          </label>
        ) : null}

        <label className="pedago-filter-field">
          <span>Erreurs tolérées avant blocage</span>
          <input
            type="number"
            className="form-input"
            min={0}
            max={10}
            value={readNumber(get('learning.gating.allowed_wrong_attempts', 0), 0)}
            disabled={savingKey === 'learning.gating.allowed_wrong_attempts'}
            onChange={(e) =>
              saveSetting('learning.gating.allowed_wrong_attempts', readNumber(e.target.value, 0))
            }
          />
        </label>

        <label className="pedago-filter-field">
          <span>Délai avant nouvelle tentative (jours, 0 = aucun)</span>
          <input
            type="number"
            className="form-input"
            min={0}
            max={365}
            value={readNumber(get('learning.gating.retry_cooldown_days', 3), 3)}
            disabled={savingKey === 'learning.gating.retry_cooldown_days'}
            onChange={(e) =>
              saveSetting('learning.gating.retry_cooldown_days', readNumber(e.target.value, 3))
            }
          />
        </label>

        <label className="pedago-filter-field">
          <span>Portée du blocage après erreur</span>
          <select
            className="form-select"
            value={String(get('learning.gating.cooldown_scope', 'resource') || 'resource')}
            disabled={savingKey === 'learning.gating.cooldown_scope'}
            onChange={(e) => saveSetting('learning.gating.cooldown_scope', e.target.value)}
          >
            {COOLDOWN_SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="pedago-filter-field">
          <span>Questions posées d&apos;affilée au maximum</span>
          <input
            type="number"
            className="form-input"
            min={1}
            max={10}
            value={readNumber(get('learning.gating.max_questions_per_session', 3), 3)}
            disabled={savingKey === 'learning.gating.max_questions_per_session'}
            onChange={(e) =>
              saveSetting(
                'learning.gating.max_questions_per_session',
                readNumber(e.target.value, 3),
              )
            }
          />
        </label>

        <label className="pedago-filter-field">
          <span>
            <input
              type="checkbox"
              checked={readBool(get('learning.gating.announce_on_button', true))}
              disabled={savingKey === 'learning.gating.announce_on_button'}
              onChange={(e) => saveSetting('learning.gating.announce_on_button', e.target.checked)}
            />{' '}
            Annoncer le contrôle sur le bouton « Marquer comme lu »
          </span>
        </label>

        <label className="pedago-filter-field">
          <span>
            <input
              type="checkbox"
              checked={readBool(get('learning.gating.state_icons', true))}
              disabled={savingKey === 'learning.gating.state_icons'}
              onChange={(e) => saveSetting('learning.gating.state_icons', e.target.checked)}
            />{' '}
            Afficher les pastilles d&apos;état
          </span>
        </label>

        <label className="pedago-filter-field">
          <span>
            <input
              type="checkbox"
              checked={readBool(
                get('learning.gating.require_linked_tutorials_before_task_done', false),
              )}
              disabled={savingKey === 'learning.gating.require_linked_tutorials_before_task_done'}
              onChange={(e) =>
                saveSetting(
                  'learning.gating.require_linked_tutorials_before_task_done',
                  e.target.checked,
                )
              }
            />{' '}
            Exiger la lecture des tutoriels liés avant de marquer une tâche « faite »
          </span>
        </label>
      </div>

      <h4>Préréglages par type de contenu</h4>
      <p className="section-sub">
        S&apos;appliquent aux fiches en « Réglage du site » sans exigence propre.
      </p>
      {TYPE_TABS.map((tab) => {
        const bundle = typeBundle[tab.type] || {};
        return (
          <div key={tab.type} style={{ marginBottom: 16 }}>
            <h5 style={{ margin: '0 0 8px' }}>{tab.label}</h5>
            <GatingPolicyEditor
              product="fm"
              layer="type"
              site={
                bundle.site || {
                  defaultMode,
                  defaultRequiredCorrect: defaultRequired,
                  enabled,
                  allowedWrongAttempts: readNumber(
                    get('learning.gating.allowed_wrong_attempts', 0),
                    0,
                  ),
                  maxQuestionsPerSession: readNumber(
                    get('learning.gating.max_questions_per_session', 3),
                    3,
                  ),
                  retryCooldownDays: readNumber(get('learning.gating.retry_cooldown_days', 3), 3),
                  cooldownScope: String(
                    get('learning.gating.cooldown_scope', 'resource') || 'resource',
                  ),
                }
              }
              typePolicy={bundle.policy}
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
    </div>
  );
}
