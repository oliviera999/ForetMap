import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GatingPolicyEditor } from '../../../shared/components/GatingPolicyEditor.jsx';
import {
  LOCK_MODE_OPTIONS,
  RETRY_HOUR_OPTIONS,
  readRetryHours,
  retryHoursLabel,
} from '../../../shared/utils/learningGatingPolicyText.js';
import { DEFAULT_RETRY_COOLDOWN_HOURS } from '../../../shared/utils/cooldownDuration.js';

const TYPE_TABS = [
  { type: 'species', label: 'Fiches espèces' },
  { type: 'glossary', label: 'Glossaire scientifique' },
  { type: 'lore_glossary', label: 'Lexique lore' },
  { type: 'tutorial', label: 'Tutoriels' },
  { type: 'feuillet', label: 'Feuillets' },
  { type: 'content_page', label: 'Pages de contenu' },
  { type: 'ecosystem', label: 'Écosystèmes' },
];

// G3 — réglages du conditionnement par QCM (gating.*). Écrit via l'endpoint dédié
// PUT /api/gl/learning-links/settings (validation + invalidation du cache gating),
// jamais via /api/gl/admin/settings/:key qui ne connaît pas ces clés.
//
// Même découpage et mêmes phrases d'aide que l'écran ForetMap : un MJ ou un admin règle le
// dispositif sans lire la doc technique. Le délai de verrou se règle en heures (6 h par
// défaut) et sa sévérité en trois niveaux (lot 2 de l'audit validation quiz 2026-09).

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
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
      {intro ? <p className="gl-hint">{intro}</p> : null}
      <div className="gl-form">{children}</div>
    </section>
  );
}

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

  const retryHours = readRetryHours(gating, DEFAULT_RETRY_COOLDOWN_HOURS);
  const lockMode = String(gating.lockMode || 'flow');
  const allowedWrong = clampInt(gating.allowedWrongAttempts, 0, 10, 0);
  const maxSession = clampInt(gating.maxQuestionsPerSession, 1, 10, 3);

  return (
    <div className="gating-settings">
      <h3>Conditionnement par QCM</h3>
      <p className="gl-hint">
        Quand il est actif, un élève doit réussir la ou les questions liées à une ressource avant de
        pouvoir la marquer « apprise » ou « étudiée ». Les liens ressource ↔ question se gèrent dans{' '}
        <strong>Contenus → Conditionnement QCM</strong> ; les réglages ci-dessous valent pour toute
        la plateforme, puis peuvent être adaptés par type de ressource (en bas de page), par fiche,
        et par chapitre ou scope lore.
      </p>
      {error ? <p className="gl-error">{error}</p> : null}

      <Section
        step="1"
        title="Activer"
        intro="Interrupteur général : éteint, aucune question n’est jamais posée, quels que soient les autres réglages."
      >
        <label className="gl-gameplay-toggle-row">
          <input
            type="checkbox"
            checked={!!gating.enabled}
            disabled={savingKey === 'gating.enabled'}
            onChange={(event) => save('gating.enabled', event.target.checked)}
          />
          <span>Activer le conditionnement (interrupteur global)</span>
        </label>
      </Section>

      <Section
        step="2"
        title="Ce qu’il faut réussir"
        intro="Combien de bonnes réponses ouvrent la validation, combien de questions sont posées d’affilée, et qui répond."
      >
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
                const n = clampInt(event.target.value, 1, 50, gating.defaultRequiredCorrect);
                if (n !== gating.defaultRequiredCorrect) save('gating.default_required_correct', n);
              }}
            />
          </label>
        ) : null}
        <div className="gating-settings__field">
          <label>
            Questions max. par session
            <input
              type="number"
              min={1}
              max={10}
              defaultValue={maxSession}
              disabled={savingKey === 'gating.max_questions_per_session'}
              onBlur={(event) => {
                const n = clampInt(event.target.value, 1, 10, maxSession);
                if (n !== maxSession) save('gating.max_questions_per_session', n);
              }}
            />
          </label>
          <span className="gl-hint">
            Au-delà, l’élève reprend plus tard : ses bonnes réponses restent acquises.
          </span>
        </div>
        <div className="gating-settings__field">
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
          <span className="gl-hint">
            « Par équipe » : la bonne réponse d’un coéquipier, ou du MJ qui anime, compte pour
            chaque joueur de l’équipe.
          </span>
        </div>
      </Section>

      <Section
        step="3"
        title="En cas d’erreur"
        intro="Ce qu’une mauvaise réponse coûte : combien d’erreurs sont permises, combien de temps la validation attend ensuite, et à quel point le verrou est contraignant."
      >
        <div className="gating-settings__field">
          <label>
            Erreurs tolérées avant blocage
            <input
              type="number"
              min={0}
              max={10}
              defaultValue={allowedWrong}
              disabled={savingKey === 'gating.allowed_wrong_attempts'}
              onBlur={(event) => {
                const n = clampInt(event.target.value, 0, 10, allowedWrong);
                if (n !== allowedWrong) save('gating.allowed_wrong_attempts', n);
              }}
            />
          </label>
          <span className="gl-hint">0 = la première erreur bloque.</span>
        </div>
        <div className="gating-settings__field">
          <label>
            Délai avant nouvelle tentative après une erreur
            <select
              value={String(RETRY_HOUR_OPTIONS.includes(retryHours) ? retryHours : 'custom')}
              disabled={savingKey === 'gating.retry_cooldown_hours'}
              onChange={(event) => {
                if (event.target.value === 'custom') return;
                save(
                  'gating.retry_cooldown_hours',
                  clampInt(event.target.value, 0, 8760, DEFAULT_RETRY_COOLDOWN_HOURS),
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
          <span className="gl-hint">
            En heures ; 6 h par défaut. Valeur libre (0 à 8760 h) :{' '}
            <input
              type="number"
              min={0}
              max={8760}
              aria-label="Délai en heures (valeur libre)"
              defaultValue={retryHours}
              disabled={savingKey === 'gating.retry_cooldown_hours'}
              onBlur={(event) => {
                const n = clampInt(event.target.value, 0, 8760, retryHours);
                if (n !== retryHours) save('gating.retry_cooldown_hours', n);
              }}
            />
          </span>
        </div>
        <label>
          Portée du blocage après erreur
          <select
            value={gating.cooldownScope || 'resource'}
            disabled={savingKey === 'gating.cooldown_scope'}
            onChange={(event) => save('gating.cooldown_scope', event.target.value)}
          >
            <option value="resource">Toute la fiche</option>
            <option value="question">Seulement la question ratée</option>
          </select>
        </label>
        <div className="gating-settings__field">
          <label>
            Sévérité du verrou
            <select
              value={lockMode}
              disabled={savingKey === 'gating.lock_mode'}
              onChange={(event) => save('gating.lock_mode', event.target.value)}
            >
              {LOCK_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <span className="gl-hint">
            {LOCK_MODE_OPTIONS.find((o) => o.value === lockMode)?.help}
          </span>
        </div>
      </Section>

      <Section
        step="4"
        title="Ce que le joueur voit"
        intro="Ces réglages ne changent pas la règle, seulement son affichage avant le clic."
      >
        <label className="gl-gameplay-toggle-row">
          <input
            type="checkbox"
            checked={gating.announceOnButton !== false}
            disabled={savingKey === 'gating.announce_on_button'}
            onChange={(event) => save('gating.announce_on_button', event.target.checked)}
          />
          <span>Annoncer le contrôle sur le bouton (« 1 question », cadenas)</span>
        </label>
        <label className="gl-gameplay-toggle-row">
          <input
            type="checkbox"
            checked={gating.stateIcons !== false}
            disabled={savingKey === 'gating.state_icons'}
            onChange={(event) => save('gating.state_icons', event.target.checked)}
          />
          <span>Afficher les pastilles d’état (acquis ✓ · en attente ? · bloqué 🔒)</span>
        </label>
      </Section>

      <h4>Préréglages par type de ressource</h4>
      <p className="gl-hint">
        Pour adapter la règle à une famille de ressources sans toucher à la plateforme : par exemple
        des feuillets en sévérité stricte et un lexique souple. Une surcharge par fiche, chapitre ou
        scope lore peut encore primer.
      </p>
      {TYPE_TABS.map((tab) => {
        const bundle = typeBundle[tab.type] || {};
        return (
          <div key={tab.type} style={{ marginBottom: 16 }}>
            <h5>{tab.label}</h5>
            <GatingPolicyEditor
              // Remonté quand la politique chargée change (audit validation quiz 2026-09, D2).
              key={`${tab.type}:${JSON.stringify(bundle.policy || null)}`}
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
    </div>
  );
}
