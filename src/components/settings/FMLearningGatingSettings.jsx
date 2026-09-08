import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api.js';

import { GatingPolicyEditor } from '../../shared/components/GatingPolicyEditor.jsx';
import {
  LOCK_MODE_OPTIONS,
  RETRY_HOUR_OPTIONS,
  readRetryHours,
  retryHoursLabel,
} from '../../shared/utils/learningGatingPolicyText.js';
import { DEFAULT_RETRY_COOLDOWN_HOURS } from '../../shared/utils/cooldownDuration.js';

// Écran « Validation des lectures » (contrôle de compréhension) — ForetMap.
//
// Un professeur ou un administrateur doit pouvoir régler le dispositif SANS lire la doc
// technique : chaque réglage porte une phrase qui dit ce qu'il change pour l'élève, et
// l'écran est découpé dans l'ordre où les questions se posent — activer, exiger quoi, que se
// passe-t-il en cas d'erreur, que voit l'élève. Le délai de verrou se règle en heures
// (6 h par défaut) et sa sévérité en trois niveaux (lot 2 de l'audit validation quiz 2026-09).

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
  { value: 'resource', label: 'Toute la fiche' },
  { value: 'question', label: 'Seulement la question ratée' },
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

function clampInt(value, min, max, fallback) {
  const n = Math.floor(readNumber(value, fallback));
  return Math.max(min, Math.min(max, n));
}

function Section({ step, title, intro, children }) {
  return (
    <section className="gating-settings__section">
      <h4 className="gating-settings__title">
        <span className="gating-settings__step" aria-hidden="true">
          {step}
        </span>{' '}
        {title}
      </h4>
      {intro ? <p className="section-sub">{intro}</p> : null}
      <div className="pedago-links__policy" style={{ display: 'grid', gap: 12 }}>
        {children}
      </div>
    </section>
  );
}

function Help({ children }) {
  return <span className="gating-settings__help">{children}</span>;
}

export function FMLearningGatingSettings({ get, saveSetting, savingKey = '' }) {
  const [typeBundle, setTypeBundle] = useState({});
  const [typeBusy, setTypeBusy] = useState('');
  const [typeError, setTypeError] = useState('');

  const enabled = readBool(get('learning.gating.enabled', false));
  const defaultMode = String(get('learning.gating.default_mode', 'any') || 'any');
  const defaultRequired = readNumber(get('learning.gating.default_required_correct', 1), 1);
  const allowedWrong = readNumber(get('learning.gating.allowed_wrong_attempts', 0), 0);
  const retryHours = readRetryHours(
    {
      retryCooldownHours: get('learning.gating.retry_cooldown_hours', null),
      retryCooldownDays: get('learning.gating.retry_cooldown_days', null),
    },
    6,
  );
  const lockMode = String(get('learning.gating.lock_mode', 'flow') || 'flow');
  const cooldownScope = String(get('learning.gating.cooldown_scope', 'resource') || 'resource');
  const maxSession = readNumber(get('learning.gating.max_questions_per_session', 3), 3);

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

  /** Enregistre un nombre borné : l'écran ne montre jamais une valeur que le serveur refuserait. */
  function saveBounded(key, raw, min, max, fallback) {
    saveSetting(key, clampInt(raw, min, max, fallback));
  }

  const siteForEditor = {
    defaultMode,
    defaultRequiredCorrect: defaultRequired,
    enabled,
    allowedWrongAttempts: allowedWrong,
    maxQuestionsPerSession: maxSession,
    retryCooldownHours: retryHours,
    cooldownScope,
    lockMode,
  };

  return (
    <div
      className="card gating-settings"
      style={{ marginBottom: 16, padding: 16 }}
      id="settings-learning-gating"
    >
      <h3 style={{ marginTop: 0 }}>Validation des lectures (contrôle de compréhension)</h3>
      <p className="section-sub">
        Quand il est actif, un élève doit réussir la ou les questions rattachées à un contenu avant
        de pouvoir le marquer comme lu, observé ou appris. Les rattachements se font dans{' '}
        <strong>Quiz → Rattacher des questions aux contenus</strong> ; les réglages ci-dessous
        valent pour tout le site, puis peuvent être adaptés par type de contenu (en bas de page) et
        par fiche.
      </p>
      {typeError ? <p className="pedago-qcm-admin__error">{typeError}</p> : null}

      <Section
        step="1"
        title="Activer"
        intro="Interrupteur général : éteint, aucune question n’est jamais posée, quels que soient les autres réglages."
      >
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
      </Section>

      <Section
        step="2"
        title="Ce qu’il faut réussir"
        intro="Combien de bonnes réponses ouvrent la validation, et combien de questions sont posées d’affilée."
      >
        <div className="gating-settings__field">
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
          <Help>
            « Une suffit » est le réglage conseillé pour commencer ; « toutes » demande plusieurs
            passages si plusieurs questions sont rattachées.
          </Help>
        </div>

        {defaultMode === 'threshold' ? (
          <div className="gating-settings__field">
            <label className="pedago-filter-field">
              <span>Nombre de bonnes réponses attendues (mode seuil)</span>
              <input
                type="number"
                className="form-input"
                min={1}
                max={50}
                value={defaultRequired}
                disabled={savingKey === 'learning.gating.default_required_correct'}
                onChange={(e) =>
                  saveBounded('learning.gating.default_required_correct', e.target.value, 1, 50, 1)
                }
              />
            </label>
            <Help>Borné automatiquement au nombre de questions rattachées à la fiche.</Help>
          </div>
        ) : null}

        <div className="gating-settings__field">
          <label className="pedago-filter-field">
            <span>Questions posées d&apos;affilée au maximum</span>
            <input
              type="number"
              className="form-input"
              min={1}
              max={10}
              value={maxSession}
              disabled={savingKey === 'learning.gating.max_questions_per_session'}
              onChange={(e) =>
                saveBounded('learning.gating.max_questions_per_session', e.target.value, 1, 10, 3)
              }
            />
          </label>
          <Help>
            Au-delà, l’élève reprend plus tard : ses bonnes réponses restent acquises d’une fois sur
            l’autre.
          </Help>
        </div>
      </Section>

      <Section
        step="3"
        title="En cas d’erreur"
        intro="Ce qu’une mauvaise réponse coûte : combien d’erreurs sont permises, combien de temps la validation attend ensuite, et à quel point le verrou est contraignant."
      >
        <div className="gating-settings__field">
          <label className="pedago-filter-field">
            <span>Erreurs tolérées avant blocage</span>
            <input
              type="number"
              className="form-input"
              min={0}
              max={10}
              value={allowedWrong}
              disabled={savingKey === 'learning.gating.allowed_wrong_attempts'}
              onChange={(e) =>
                saveBounded('learning.gating.allowed_wrong_attempts', e.target.value, 0, 10, 0)
              }
            />
          </label>
          <Help>0 = la première erreur bloque. 2 = l’élève peut se tromper deux fois.</Help>
        </div>

        <div className="gating-settings__field">
          <label className="pedago-filter-field">
            <span>Délai avant nouvelle tentative après une erreur</span>
            <select
              className="form-select"
              value={String(RETRY_HOUR_OPTIONS.includes(retryHours) ? retryHours : 'custom')}
              disabled={savingKey === 'learning.gating.retry_cooldown_hours'}
              onChange={(e) => {
                if (e.target.value === 'custom') return;
                saveBounded(
                  'learning.gating.retry_cooldown_hours',
                  e.target.value,
                  0,
                  8760,
                  DEFAULT_RETRY_COOLDOWN_HOURS,
                );
              }}
            >
              {RETRY_HOUR_OPTIONS.map((h) => (
                <option key={h} value={String(h)}>
                  {retryHoursLabel(h)}
                </option>
              ))}
              {!RETRY_HOUR_OPTIONS.includes(retryHours) ? (
                <option value="custom">{retryHoursLabel(retryHours)} (valeur personnalisée)</option>
              ) : null}
            </select>
          </label>
          <Help>
            En heures ; 6 h par défaut. « Aucun délai » laisse réessayer tout de suite. Valeur libre
            (0 à 8760 h) :{' '}
            <input
              type="number"
              className="form-input form-input--inline"
              min={0}
              max={8760}
              aria-label="Délai en heures (valeur libre)"
              defaultValue={retryHours}
              disabled={savingKey === 'learning.gating.retry_cooldown_hours'}
              onBlur={(e) => {
                const n = clampInt(e.target.value, 0, 8760, retryHours);
                if (n !== retryHours) saveSetting('learning.gating.retry_cooldown_hours', n);
              }}
            />
          </Help>
        </div>

        <div className="gating-settings__field">
          <label className="pedago-filter-field">
            <span>Portée du blocage après erreur</span>
            <select
              className="form-select"
              value={cooldownScope}
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
          <Help>
            « Seulement la question ratée » laisse l’élève continuer sur les autres questions de la
            fiche ; utile surtout avec l’exigence « toutes ».
          </Help>
        </div>

        <div className="gating-settings__field">
          <label className="pedago-filter-field">
            <span>Sévérité du verrou</span>
            <select
              className="form-select"
              value={lockMode}
              disabled={savingKey === 'learning.gating.lock_mode'}
              onChange={(e) => saveSetting('learning.gating.lock_mode', e.target.value)}
            >
              {LOCK_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Help>{LOCK_MODE_OPTIONS.find((o) => o.value === lockMode)?.help}</Help>
        </div>
      </Section>

      <Section
        step="4"
        title="Ce que l’élève voit"
        intro="Ces réglages ne changent pas la règle, seulement son affichage avant le clic."
      >
        <label className="pedago-filter-field">
          <span>
            <input
              type="checkbox"
              checked={readBool(get('learning.gating.announce_on_button', true))}
              disabled={savingKey === 'learning.gating.announce_on_button'}
              onChange={(e) => saveSetting('learning.gating.announce_on_button', e.target.checked)}
            />{' '}
            Annoncer le contrôle sur le bouton « Marquer comme lu » (« 1 question », cadenas)
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
            Afficher les pastilles d&apos;état (acquis ✓ · en attente ? · bloqué 🔒)
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
      </Section>

      <h4>Préréglages par type de contenu</h4>
      <p className="section-sub">
        Pour adapter la règle à une famille de contenus sans toucher au site : par exemple des
        tutoriels de sécurité en sévérité stricte et un glossaire souple. Une fiche peut encore
        avoir sa propre exception (dans Quiz → Rattacher des questions).
      </p>
      {TYPE_TABS.map((tab) => {
        const bundle = typeBundle[tab.type] || {};
        return (
          <div key={tab.type} style={{ marginBottom: 16 }}>
            <h5 style={{ margin: '0 0 8px' }}>{tab.label}</h5>
            <GatingPolicyEditor
              // Remonté quand la politique chargée change : l'éditeur fige son état au
              // montage, et il était monté AVANT le chargement — il affichait les valeurs de
              // repli, qu'« Enregistrer » aurait écrites (audit validation quiz 2026-09, D2).
              key={`${tab.type}:${JSON.stringify(bundle.policy || null)}`}
              product="fm"
              layer="type"
              site={bundle.site || siteForEditor}
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
