import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../services/api.js';
import { Button } from '../../shared/ui/Button.jsx';
import { SessionRunsPanel, SessionSharePanel } from './SessionTeacherPanels.jsx';
import { SessionStepEditor, newStep } from './SessionStepEditor.jsx';
import { NOTION_NIVEAU_FILTER_OPTIONS } from '../../utils/curriculumNotions.js';

const STORAGE_KEY = 'foretmap.pedagoSession.v1';

export const CREATABLE_TEMPLATES = Object.freeze([
  { key: 'lycee_arbre', label: 'Lycée · Un arbre qui grandit' },
  { key: 'lycee_classer', label: 'Lycée · Classer pour de vrai' },
  { key: 'college_reconaitre', label: 'Collège · Reconnaître sans toucher' },
  { key: 'college_qui_mange', label: 'Collège · Qui mange qui' },
  { key: 'custom', label: 'Séance libre (étapes à composer)' },
]);

const LEVEL_LABELS = { college: 'Collège', lycee: 'Lycée', universite: 'Université' };

export function readStoredPedagoSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !Array.isArray(parsed.steps)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredPedagoSession(state) {
  try {
    if (!state) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Séance verrouillée pour cet utilisateur : prérequis défini et pas encore terminé.
 * Les gestionnaires ne sont jamais bloqués.
 */
export function sessionLockFor(session, myRuns, canManage) {
  const requiredId = session?.config?.requiresSessionId;
  if (!requiredId || canManage) return null;
  if (myRuns?.[requiredId]?.completed) return null;
  return requiredId;
}

function uniqueSlug(templateKey) {
  const base = templateKey.replace(/_/g, '-');
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Catalogue + message d’étape + création / configuration prof (modèles et séances libres).
 */
export function SessionsView({
  canManage = false,
  maps = [],
  plants = [],
  activeSession = null,
  currentStep = null,
  onStartSession,
  onOpenConfig = null,
  isAuthenticated = false,
  runsVersion = 0,
  /** Interrupteur `ui.modules.rewards_enabled` : éteint → ni appel `/api/rewards`, ni « Mes badges ». */
  rewardsEnabled = true,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [configTarget, setConfigTarget] = useState(null);
  const [idKeys, setIdKeys] = useState([]);
  const [myRuns, setMyRuns] = useState({});
  const [runStats, setRunStats] = useState({});
  const [rewards, setRewards] = useState({ rewards: [], catalogue: [] });
  const [panel, setPanel] = useState(null);
  const [newTemplate, setNewTemplate] = useState('custom');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setMyRuns({});
      setRewards({ rewards: [], catalogue: [] });
      return;
    }
    let cancelled = false;
    if (!rewardsEnabled) setRewards({ rewards: [], catalogue: [] });
    api('/api/pedago-sessions/me/runs')
      .then((data) => {
        if (cancelled) return;
        const map = {};
        for (const run of Array.isArray(data?.runs) ? data.runs : []) map[run.sessionId] = run;
        setMyRuns(map);
      })
      .catch(() => {
        if (!cancelled) setMyRuns({});
      });
    if (rewardsEnabled) {
      api('/api/rewards/me')
        .then((data) => {
          if (cancelled) return;
          setRewards({
            rewards: Array.isArray(data?.rewards) ? data.rewards : [],
            catalogue: Array.isArray(data?.catalogue) ? data.catalogue : [],
          });
        })
        .catch(() => {
          if (!cancelled) setRewards({ rewards: [], catalogue: [] });
        });
    }
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, runsVersion, rewardsEnabled]);

  useEffect(() => {
    if (!canManage) {
      setRunStats({});
      return;
    }
    let cancelled = false;
    api('/api/pedago-sessions/stats')
      .then((data) => {
        if (cancelled) return;
        const map = {};
        for (const s of Array.isArray(data?.stats) ? data.stats : []) map[s.sessionId] = s;
        setRunStats(map);
      })
      .catch(() => {
        if (!cancelled) setRunStats({});
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, runsVersion]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api(canManage ? '/api/pedago-sessions?all=1' : '/api/pedago-sessions');
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err?.message || 'Chargement impossible');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    api('/api/id-keys')
      .then((data) => setIdKeys(Array.isArray(data?.items) ? data.items : []))
      .catch(() => setIdKeys([]));
  }, [canManage]);

  const titleById = useMemo(() => {
    const map = {};
    for (const it of items) map[it.id] = it.title;
    return map;
  }, [items]);

  async function createSession() {
    setCreating(true);
    setError('');
    try {
      const created = await api('/api/pedago-sessions', 'POST', {
        templateKey: newTemplate,
        slug: uniqueSlug(newTemplate),
      });
      setItems((prev) => [...prev, created]);
      setConfigTarget(created);
    } catch (err) {
      setError(err?.message || 'Création impossible');
    } finally {
      setCreating(false);
    }
  }

  const showMessage = activeSession && currentStep && currentStep.action?.type === 'message';

  if (configTarget) {
    return (
      <SessionConfigForm
        session={configTarget}
        sessions={items}
        maps={maps}
        plants={plants}
        idKeys={idKeys}
        onCancel={() => setConfigTarget(null)}
        onSaved={(updated) => {
          setConfigTarget(null);
          setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
          if (onOpenConfig) onOpenConfig(updated);
        }}
      />
    );
  }

  const earnedKeys = new Set(rewards.rewards.map((r) => r.key));

  return (
    <div className="pedago-sessions" data-testid="pedago-sessions">
      <header className="pedago-sessions__header">
        <h1 className="section-title">Séances</h1>
        <p className="section-sub">
          Enchaînements guidés sur les outils déjà présents (clé, fiche, réseau, quiz, arbres
          suivis, boîtes emboîtées, parcours).
        </p>
      </header>

      {rewardsEnabled && isAuthenticated && rewards.catalogue.length > 0 && (
        <section className="pedago-rewards" aria-label="Mes badges" data-testid="pedago-rewards">
          <h2 className="pedago-sessions__panel-title">
            Mes badges ({earnedKeys.size}/{rewards.catalogue.length})
          </h2>
          <ul className="pedago-rewards__list">
            {rewards.catalogue.map((r) => (
              <li
                key={r.key}
                className={`pedago-rewards__item${earnedKeys.has(r.key) ? '' : ' pedago-rewards__item--locked'}`}
                title={r.description}
                data-earned={earnedKeys.has(r.key) ? 'true' : 'false'}
              >
                <span aria-hidden="true">{earnedKeys.has(r.key) ? r.emoji : '🔒'}</span> {r.title}
                {earnedKeys.has(r.key) ? '' : ' (à obtenir)'}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canManage && (
        <div className="pedago-sessions__create" data-testid="pedago-session-create">
          <label className="form-field">
            <span>Nouvelle séance</span>
            <select value={newTemplate} onChange={(e) => setNewTemplate(e.target.value)}>
              {CREATABLE_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="secondary" onClick={createSession} disabled={creating}>
            {creating ? 'Création…' : 'Créer (brouillon)'}
          </Button>
        </div>
      )}

      {showMessage && (
        <article className="pedago-sessions__message card" data-testid="pedago-session-message">
          <h2 className="section-title">{currentStep.title}</h2>
          <p className="pedago-sessions__body">{currentStep.body}</p>
          <p className="section-sub">Utilise le bandeau pour passer à l’étape suivante.</p>
        </article>
      )}

      {loading && <p className="section-sub">Chargement…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!loading && (
        <ul className="pedago-sessions__list">
          {items.map((session) => {
            const myRun = myRuns[session.id];
            const stats = runStats[session.id];
            const lockedBy = sessionLockFor(session, myRuns, canManage);
            const requiredTitle = session.config?.requiresSessionId
              ? titleById[session.config.requiresSessionId] || 'une autre séance'
              : null;
            return (
              <li key={session.id} className="pedago-sessions__card card">
                <div className="pedago-sessions__card-main">
                  <h2 className="pedago-sessions__card-title">
                    {session.title}
                    {myRun?.completed ? (
                      <span
                        className="pedago-sessions__done-badge"
                        data-testid="pedago-session-done-badge"
                      >
                        Terminée{myRun.completionCount > 1 ? ` ×${myRun.completionCount}` : ''}
                      </span>
                    ) : null}
                  </h2>
                  <p className="section-sub">
                    {LEVEL_LABELS[session.level] || 'Collège'}
                    {' · '}
                    {session.steps?.length || 0} étapes
                    {session.templateKey === 'custom' ? ' · séance libre' : ''}
                    {!session.isPublished ? ' · brouillon' : ''}
                  </p>
                  {session.description ? (
                    <p className="pedago-sessions__desc">{session.description}</p>
                  ) : null}
                  {requiredTitle ? (
                    <p
                      className={`pedago-sessions__prereq${lockedBy ? ' pedago-sessions__prereq--locked' : ''}`}
                      data-testid="pedago-session-prereq"
                    >
                      {lockedBy
                        ? `🔒 Termine d’abord « ${requiredTitle} »`
                        : `Après « ${requiredTitle} »`}
                    </p>
                  ) : null}
                  {canManage ? (
                    <p className="pedago-sessions__stats" data-testid="pedago-session-stats">
                      {`Démarrée par ${stats?.startedUsers || 0} · terminée par ${stats?.completedUsers || 0}`}
                    </p>
                  ) : null}
                </div>
                <div className="pedago-sessions__card-actions">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => onStartSession?.(session)}
                    disabled={(!session.isPublished && !canManage) || !!lockedBy}
                  >
                    {activeSession?.id === session.id ? 'Reprendre' : 'Démarrer'}
                  </Button>
                  {canManage && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setConfigTarget(session)}
                      >
                        Configurer
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setPanel({ kind: 'share', sessionId: session.id })}
                      >
                        Partager
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setPanel({ kind: 'runs', sessionId: session.id })}
                      >
                        Suivi
                      </Button>
                    </>
                  )}
                </div>
                {canManage && panel?.sessionId === session.id && panel.kind === 'share' && (
                  <SessionSharePanel session={session} onClose={() => setPanel(null)} />
                )}
                {canManage && panel?.sessionId === session.id && panel.kind === 'runs' && (
                  <SessionRunsPanel session={session} onClose={() => setPanel(null)} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function useIndividuals(enabled) {
  const [individuals, setIndividuals] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api('/api/individuals')
      .then((data) => {
        if (!cancelled) setIndividuals(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => {
        if (!cancelled) setIndividuals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return individuals;
}

function useMapRoutes(mapId, enabled) {
  const [routes, setRoutes] = useState([]);
  useEffect(() => {
    if (!enabled || !mapId) {
      setRoutes([]);
      return;
    }
    let cancelled = false;
    api(`/api/map-routes?map_id=${encodeURIComponent(mapId)}&surface=map`)
      .then((rows) => {
        if (!cancelled) setRoutes(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setRoutes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mapId, enabled]);
  return routes;
}

function stripResolvedStep(step) {
  return {
    id: step.id,
    title: step.title || '',
    body: step.body || '',
    action: { type: step.action?.type || 'message', payload: { ...(step.action?.payload || {}) } },
    completeWhen: 'manual',
  };
}

function SessionConfigForm({ session, sessions = [], maps, plants, idKeys, onCancel, onSaved }) {
  const tpl = session.templateKey;
  const isA = tpl === 'college_reconaitre';
  const isB = tpl === 'college_qui_mange';
  const isC = tpl === 'lycee_arbre';
  const isD = tpl === 'lycee_classer';
  const isCustom = tpl === 'custom';
  const plantSlots = isD ? 6 : 3;

  const [title, setTitle] = useState(session.title || '');
  const [mapId, setMapId] = useState(session.config?.mapId || session.mapId || '');
  const [keyIdOrSlug, setKeyIdOrSlug] = useState(session.config?.keyIdOrSlug || '');
  const [plantId, setPlantId] = useState(
    session.config?.plantId != null ? String(session.config.plantId) : '',
  );
  const [plantIds, setPlantIds] = useState(() =>
    (session.config?.plantIds || []).map(String).concat(Array(6).fill('')).slice(0, plantSlots),
  );
  const [individualId, setIndividualId] = useState(
    session.config?.individualId != null ? String(session.config.individualId) : '',
  );
  const [requiresSessionId, setRequiresSessionId] = useState(
    session.config?.requiresSessionId || '',
  );
  const [steps, setSteps] = useState(() =>
    isCustom && session.steps?.length ? session.steps.map(stripResolvedStep) : [newStep(0)],
  );
  const [notionNiveau, setNotionNiveau] = useState(
    session.config?.notionNiveau || (session.level === 'lycee' ? 'lycee' : 'cycle4'),
  );
  const [notionId, setNotionId] = useState(session.config?.notionId || '');
  const [questionCode, setQuestionCode] = useState(session.config?.questionCode || '');
  const [isPublished, setIsPublished] = useState(!!session.isPublished);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const individuals = useIndividuals(isC || isCustom);
  const mapRoutes = useMapRoutes(mapId, isCustom);

  const plantOptions = useMemo(
    () =>
      (plants || [])
        .map((p) => ({ id: String(p.id), label: `${p.emoji || ''} ${p.name || p.id}`.trim() }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    [plants],
  );

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        title: title.trim() || session.title,
        isPublished,
        notionNiveau: notionNiveau || null,
        notionId: notionId.trim() || null,
        questionCode: questionCode.trim() || null,
        mapId: mapId || null,
        requiresSessionId: requiresSessionId || null,
      };
      if (isA) {
        body.keyIdOrSlug = keyIdOrSlug || null;
        body.plantId = plantId ? Number(plantId) : null;
        body.plantIds = plantId ? [Number(plantId)] : [];
      }
      if (isB || isD) {
        body.plantIds = plantIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
        body.plantId = body.plantIds[0] || null;
      }
      if (isC) {
        body.individualId = individualId ? Number(individualId) : null;
      }
      if (isCustom) {
        body.steps = steps.map((s, i) => ({ ...s, title: s.title.trim() || `Étape ${i + 1}` }));
      }
      const updated = await api(
        `/api/pedago-sessions/${encodeURIComponent(session.id)}`,
        'PUT',
        body,
      );
      onSaved?.(updated);
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="pedago-sessions-config card"
      onSubmit={handleSave}
      data-testid="pedago-session-config"
    >
      <h1 className="section-title">Configurer · {session.title}</h1>
      <p className="section-sub">
        {isCustom
          ? 'Séance libre : compose les étapes. À la publication, chaque cible est vérifiée.'
          : `La structure des étapes est figée (modèle ${tpl}). Choisis carte, contenus et publication.`}
      </p>

      <label className="form-field">
        <span>Titre</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} />
      </label>

      <label className="form-field">
        <span>Carte</span>
        <select value={mapId} onChange={(e) => setMapId(e.target.value)}>
          <option value="">— aucune —</option>
          {(maps || []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name || m.label || m.id}
            </option>
          ))}
        </select>
      </label>

      {isA && (
        <>
          <label className="form-field">
            <span>Clé d’identification</span>
            <select value={keyIdOrSlug} onChange={(e) => setKeyIdOrSlug(e.target.value)}>
              <option value="">— à choisir en séance —</option>
              {idKeys.map((k) => (
                <option key={k.id} value={k.slug || String(k.id)}>
                  {k.title}
                  {!k.is_published ? ' (brouillon)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Plante (fiche)</span>
            <select value={plantId} onChange={(e) => setPlantId(e.target.value)}>
              <option value="">— à choisir en séance —</option>
              {plantOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {(isB || isD) && (
        <fieldset className="form-field">
          <legend>{isD ? 'Six espèces à classer' : 'Trois plantes du site'}</legend>
          {Array.from({ length: plantSlots }, (_, idx) => (
            <select
              key={idx}
              value={plantIds[idx] || ''}
              onChange={(e) => {
                const next = [...plantIds];
                next[idx] = e.target.value;
                setPlantIds(next);
              }}
              aria-label={`Plante ${idx + 1}`}
            >
              <option value="">— plante {idx + 1} —</option>
              {plantOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          ))}
        </fieldset>
      )}

      {isC && (
        <label className="form-field">
          <span>Arbre suivi</span>
          <select value={individualId} onChange={(e) => setIndividualId(e.target.value)}>
            <option value="">— à choisir en séance —</option>
            {individuals.map((it) => (
              <option key={it.id} value={String(it.id)}>
                {it.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {isCustom && (
        <SessionStepEditor
          steps={steps}
          onChange={setSteps}
          plantOptions={plantOptions}
          idKeys={idKeys}
          individuals={individuals}
          mapRoutes={mapRoutes}
        />
      )}

      {!isCustom && (
        <>
          <label className="form-field">
            <span>Quiz · niveau de notion</span>
            <select value={notionNiveau} onChange={(e) => setNotionNiveau(e.target.value)}>
              <option value="">— libre —</option>
              {NOTION_NIVEAU_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Quiz · id de notion (optionnel)</span>
            <input
              value={notionId}
              onChange={(e) => setNotionId(e.target.value)}
              placeholder="ex. notion uuid"
            />
          </label>

          <label className="form-field">
            <span>Quiz · code question fixe (optionnel)</span>
            <input
              value={questionCode}
              onChange={(e) => setQuestionCode(e.target.value)}
              placeholder="QF0001"
            />
          </label>
        </>
      )}

      <label className="form-field">
        <span>Prérequis (séance à terminer avant)</span>
        <select value={requiresSessionId} onChange={(e) => setRequiresSessionId(e.target.value)}>
          <option value="">— aucun —</option>
          {sessions
            .filter((s) => s.id !== session.id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
        </select>
      </label>

      <label className="form-field form-field--checkbox">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(e) => setIsPublished(e.target.checked)}
        />
        <span>Publiée (visible des élèves)</span>
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="pedago-sessions__card-actions">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
