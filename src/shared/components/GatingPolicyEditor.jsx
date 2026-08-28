import { useMemo, useState } from 'react';
import {
  COOLDOWN_SCOPE_LABELS,
  describeEffectiveGatingPolicy,
  describeSiteGatingMode,
  formatEffectiveSource,
  GRANULARITY_LABELS,
  INHERIT_VALUE,
  inheritHint,
} from '../utils/learningGatingPolicyText.js';

const MODE_OPTIONS = [
  { value: 'inherit', label: 'Hériter' },
  { value: 'off', label: 'Aucune question exigée' },
  { value: 'any', label: 'Une bonne réponse suffit' },
  { value: 'all', label: 'Toutes les questions' },
  { value: 'threshold', label: 'Un nombre minimum (seuil)' },
];

const SITE_MODE_OPTIONS = MODE_OPTIONS.filter((o) => o.value !== 'inherit');

const GRANULARITY_OPTIONS = [
  { value: INHERIT_VALUE, label: 'Hériter' },
  { value: 'player', label: 'Par joueur' },
  { value: 'team', label: 'Par équipe' },
];

const COOLDOWN_SCOPE_OPTIONS = [
  { value: INHERIT_VALUE, label: 'Hériter' },
  { value: 'resource', label: COOLDOWN_SCOPE_LABELS.resource },
  { value: 'question', label: COOLDOWN_SCOPE_LABELS.question },
];

function readRowField(row, snake, camel) {
  if (!row) return null;
  if (row[snake] != null && row[snake] !== '') return row[snake];
  if (row[camel] != null && row[camel] !== '') return row[camel];
  return null;
}

function isInherited(row, snake) {
  return !row || row[snake] == null || row[snake] === '';
}

function readNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function initialFromPolicy(policy, site, canInherit) {
  const p = policy || {};
  return {
    mode: canInherit ? p.mode || 'inherit' : site?.defaultMode || 'any',
    requiredCorrect: String(
      p.required_correct ?? p.requiredCorrect ?? site?.defaultRequiredCorrect ?? 1,
    ),
    enabledOff: p.enabled === 0 || p.enabled === false,
    allowedWrong: isInherited(p, 'allowed_wrong_attempts')
      ? INHERIT_VALUE
      : String(p.allowed_wrong_attempts),
    maxSession: isInherited(p, 'max_questions_per_session')
      ? INHERIT_VALUE
      : String(p.max_questions_per_session),
    retryDays: isInherited(p, 'retry_cooldown_days')
      ? INHERIT_VALUE
      : String(p.retry_cooldown_days),
    cooldownScope: isInherited(p, 'cooldown_scope')
      ? INHERIT_VALUE
      : String(p.cooldown_scope || 'resource'),
    granularity: isInherited(p, 'granularity') ? INHERIT_VALUE : String(p.granularity || 'player'),
  };
}

/**
 * Éditeur partagé des politiques de conditionnement (site / type / ressource).
 */
export function GatingPolicyEditor({
  product = 'fm',
  layer = 'resource',
  site = null,
  typePolicy = null,
  policy = null,
  effective = null,
  effectiveSources = {},
  gatingCount = 0,
  resourceType = '',
  busy = false,
  onSave,
  compact = false,
}) {
  const canInherit = layer !== 'site';
  const parentSession = layer === 'resource' ? typePolicy : null;
  const siteSession = site || {};
  const init = initialFromPolicy(policy, site, canInherit);
  const [mode, setMode] = useState(init.mode);
  const [requiredCorrect, setRequiredCorrect] = useState(init.requiredCorrect);
  const [enabledOff, setEnabledOff] = useState(init.enabledOff);
  const [allowedWrong, setAllowedWrong] = useState(init.allowedWrong);
  const [maxSession, setMaxSession] = useState(init.maxSession);
  const [retryDays, setRetryDays] = useState(init.retryDays);
  const [cooldownScope, setCooldownScope] = useState(init.cooldownScope);
  const [granularity, setGranularity] = useState(init.granularity);

  const appliedText = useMemo(() => {
    if (!effective) return '';
    return describeEffectiveGatingPolicy({
      mode: effective.mode,
      requiredCorrect: effective.requiredCorrect,
      gatingCount,
      allowedWrongAttempts: effective.allowedWrongAttempts,
      maxQuestionsPerSession: effective.maxQuestionsPerSession,
      retryCooldownDays: effective.retryCooldownDays,
      cooldownScope: effective.cooldownScope,
    });
  }, [effective, gatingCount]);

  function nullableNumberField(local) {
    return local === INHERIT_VALUE ? null : readNumber(local, 0);
  }

  function buildPatch() {
    const patch = {};
    if (layer === 'site') {
      patch.defaultMode = mode;
      if (mode === 'threshold') patch.defaultRequiredCorrect = readNumber(requiredCorrect, 1);
      patch.allowedWrongAttempts = readNumber(allowedWrong, 0);
      patch.maxQuestionsPerSession = readNumber(maxSession, 3);
      patch.retryCooldownDays = readNumber(retryDays, 3);
      patch.cooldownScope = cooldownScope === INHERIT_VALUE ? 'resource' : cooldownScope;
      if (product === 'gl') {
        patch.granularity = granularity === INHERIT_VALUE ? 'player' : granularity;
      }
      return patch;
    }

    patch.mode = mode;
    if (mode === 'threshold') {
      patch.required_correct = readNumber(requiredCorrect, 1);
    }
    if (layer === 'resource' && enabledOff) {
      patch.enabled = 0;
    } else if (layer === 'resource') {
      patch.enabled = 1;
    }
    patch.allowed_wrong_attempts = nullableNumberField(allowedWrong, setAllowedWrong);
    patch.max_questions_per_session = nullableNumberField(maxSession, setMaxSession);
    patch.retry_cooldown_days = nullableNumberField(retryDays, setRetryDays);
    patch.cooldown_scope = cooldownScope === INHERIT_VALUE ? null : cooldownScope;
    if (product === 'gl' && layer !== 'site') {
      patch.granularity = granularity === INHERIT_VALUE ? null : granularity;
    }
    return patch;
  }

  function handleSave() {
    if (typeof onSave === 'function') onSave(buildPatch());
  }

  const modeOptions = canInherit ? MODE_OPTIONS : SITE_MODE_OPTIONS;
  const showThreshold = mode === 'threshold';
  const siteModeLabel = describeSiteGatingMode(site);

  function parentVal(snake, camel, fromSite = true) {
    const fromType = readRowField(parentSession, snake, camel);
    if (fromType != null && layer === 'resource') return fromType;
    if (fromSite) return readRowField(siteSession, camel, snake) ?? siteSession[camel];
    return null;
  }

  return (
    <div className={`gating-policy-editor${compact ? ' gating-policy-editor--compact' : ''}`}>
      {appliedText ? (
        <p className="gating-policy-editor__applied">
          <strong>Appliqué :</strong> {appliedText}
        </p>
      ) : null}

      {Object.keys(effectiveSources).length > 0 && layer === 'resource' ? (
        <p className="gating-policy-editor__sources section-sub">
          Sources :{' '}
          {Object.entries(effectiveSources)
            .map(([k, v]) => `${k} ← ${formatEffectiveSource(v, resourceType)}`)
            .join(' · ')}
        </p>
      ) : null}

      <fieldset className="gating-policy-editor__section" disabled={busy}>
        <legend>Exigence</legend>
        <label className="pedago-filter-field">
          <span>Mode</span>
          <select className="form-select" value={mode} onChange={(e) => setMode(e.target.value)}>
            {modeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {canInherit && mode === 'inherit' && site ? (
          <p className="section-sub">Réglage du site : {siteModeLabel}</p>
        ) : null}
        {layer === 'resource' ? (
          <label className="pedago-filter-field">
            <span>
              <input
                type="checkbox"
                checked={enabledOff}
                onChange={(e) => setEnabledOff(e.target.checked)}
              />{' '}
              Dispenser cette fiche (aucune question exigée)
            </span>
          </label>
        ) : null}
        {showThreshold ? (
          <label className="pedago-filter-field">
            <span>Nombre de bonnes réponses (seuil N)</span>
            <input
              type="number"
              className="form-input"
              min={1}
              max={50}
              value={requiredCorrect}
              onChange={(e) => setRequiredCorrect(e.target.value)}
            />
          </label>
        ) : null}
      </fieldset>

      <fieldset className="gating-policy-editor__section" disabled={busy}>
        <legend>Session</legend>
        <label className="pedago-filter-field">
          <span>Erreurs tolérées avant blocage</span>
          {canInherit ? (
            <select
              className="form-select"
              value={allowedWrong}
              onChange={(e) => setAllowedWrong(e.target.value)}
            >
              <option value={INHERIT_VALUE}>
                {inheritHint(
                  'allowedWrongAttempts',
                  parentVal('allowed_wrong_attempts', 'allowedWrongAttempts') ??
                    siteSession.allowedWrongAttempts,
                  layer === 'resource' && parentSession ? 'type' : 'site',
                )}
              </option>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              className="form-input"
              min={0}
              max={10}
              value={allowedWrong === INHERIT_VALUE ? 0 : allowedWrong}
              onChange={(e) => setAllowedWrong(e.target.value)}
            />
          )}
        </label>
        <label className="pedago-filter-field">
          <span>Questions max. par session</span>
          {canInherit ? (
            <select
              className="form-select"
              value={maxSession}
              onChange={(e) => setMaxSession(e.target.value)}
            >
              <option value={INHERIT_VALUE}>
                {inheritHint(
                  'maxQuestionsPerSession',
                  parentVal('max_questions_per_session', 'maxQuestionsPerSession') ??
                    siteSession.maxQuestionsPerSession,
                  layer === 'resource' && parentSession ? 'type' : 'site',
                )}
              </option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              className="form-input"
              min={1}
              max={10}
              value={maxSession === INHERIT_VALUE ? 3 : maxSession}
              onChange={(e) => setMaxSession(e.target.value)}
            />
          )}
        </label>
      </fieldset>

      <fieldset className="gating-policy-editor__section" disabled={busy}>
        <legend>Verrou après erreur</legend>
        <label className="pedago-filter-field">
          <span>Délai (jours, 0 = immédiat)</span>
          {canInherit ? (
            <select
              className="form-select"
              value={retryDays}
              onChange={(e) => setRetryDays(e.target.value)}
            >
              <option value={INHERIT_VALUE}>
                {inheritHint(
                  'retryCooldownDays',
                  parentVal('retry_cooldown_days', 'retryCooldownDays') ??
                    siteSession.retryCooldownDays,
                  layer === 'resource' && parentSession ? 'type' : 'site',
                )}
              </option>
              {[0, 1, 2, 3, 5, 7, 14, 30].map((n) => (
                <option key={n} value={String(n)}>
                  {n} jour{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              className="form-input"
              min={0}
              max={365}
              value={retryDays === INHERIT_VALUE ? 3 : retryDays}
              onChange={(e) => setRetryDays(e.target.value)}
            />
          )}
        </label>
        <label className="pedago-filter-field">
          <span>Portée du verrou</span>
          <select
            className="form-select"
            value={
              canInherit
                ? cooldownScope
                : cooldownScope === INHERIT_VALUE
                  ? 'resource'
                  : cooldownScope
            }
            onChange={(e) => setCooldownScope(e.target.value)}
          >
            {(canInherit
              ? COOLDOWN_SCOPE_OPTIONS
              : COOLDOWN_SCOPE_OPTIONS.filter((o) => o.value !== INHERIT_VALUE)
            ).map((o) => (
              <option key={o.value} value={o.value}>
                {o.value === INHERIT_VALUE
                  ? inheritHint(
                      'cooldownScope',
                      parentVal('cooldown_scope', 'cooldownScope') ?? siteSession.cooldownScope,
                      layer === 'resource' && parentSession ? 'type' : 'site',
                    )
                  : o.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      {product === 'gl' && layer !== 'site' ? (
        <fieldset className="gating-policy-editor__section" disabled={busy}>
          <legend>Qui répond</legend>
          <label className="pedago-filter-field">
            <span>Granularité</span>
            <select
              className="form-select"
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
            >
              {GRANULARITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value === INHERIT_VALUE
                    ? inheritHint(
                        'granularity',
                        parentVal('granularity', 'granularity', layer === 'resource') ??
                          siteSession.granularity,
                        layer === 'resource' ? 'type ou chapitre' : 'site',
                      )
                    : GRANULARITY_LABELS[o.value] || o.label}
                </option>
              ))}
            </select>
          </label>
          <p className="section-sub">
            Une surcharge chapitre ou scope lore peut encore primer sur la fiche (4e couche).
          </p>
        </fieldset>
      ) : null}

      {product === 'fm' && layer === 'resource' ? (
        <p className="section-sub">ForetMap : chaque élève répond pour lui-même.</p>
      ) : null}

      {typeof onSave === 'function' ? (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={handleSave}>
          {busy ? 'Enregistrement…' : 'Enregistrer la politique'}
        </button>
      ) : null}
    </div>
  );
}
