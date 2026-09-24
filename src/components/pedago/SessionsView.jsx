import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../services/api.js';
import { Button } from '../../shared/ui/Button.jsx';

const STORAGE_KEY = 'foretmap.pedagoSession.v1';

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
 * Catalogue + message d’étape + formulaire config prof (templates A/B).
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
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [configTarget, setConfigTarget] = useState(null);
  const [idKeys, setIdKeys] = useState([]);
  const [myRuns, setMyRuns] = useState({});
  const [runStats, setRunStats] = useState({});

  useEffect(() => {
    if (!isAuthenticated) {
      setMyRuns({});
      return;
    }
    let cancelled = false;
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
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, runsVersion]);

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

  const showMessage = activeSession && currentStep && currentStep.action?.type === 'message';

  if (configTarget) {
    return (
      <SessionConfigForm
        session={configTarget}
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

  return (
    <div className="pedago-sessions" data-testid="pedago-sessions">
      <header className="pedago-sessions__header">
        <h1 className="section-title">Séances</h1>
        <p className="section-sub">
          Enchaînements guidés sur les outils déjà présents (clé, fiche, réseau, quiz). Les parcours
          sur la carte restent dans Visite / Carte.
        </p>
      </header>

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

      {!loading && !error && (
        <ul className="pedago-sessions__list">
          {items.map((session) => {
            const myRun = myRuns[session.id];
            const stats = runStats[session.id];
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
                    {session.level === 'college'
                      ? 'Collège'
                      : session.level === 'lycee'
                        ? 'Lycée'
                        : 'Université'}
                    {' · '}
                    {session.steps?.length || 0} étapes
                    {!session.isPublished ? ' · brouillon' : ''}
                  </p>
                  {session.description ? (
                    <p className="pedago-sessions__desc">{session.description}</p>
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
                    disabled={!session.isPublished && !canManage}
                  >
                    {activeSession?.id === session.id ? 'Reprendre' : 'Démarrer'}
                  </Button>
                  {canManage && (
                    <Button type="button" variant="ghost" onClick={() => setConfigTarget(session)}>
                      Configurer
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SessionConfigForm({ session, maps, plants, idKeys, onCancel, onSaved }) {
  const [title, setTitle] = useState(session.title || '');
  const [mapId, setMapId] = useState(session.config?.mapId || session.mapId || '');
  const [keyIdOrSlug, setKeyIdOrSlug] = useState(session.config?.keyIdOrSlug || '');
  const [plantId, setPlantId] = useState(
    session.config?.plantId != null ? String(session.config.plantId) : '',
  );
  const [plantIds, setPlantIds] = useState(() =>
    (session.config?.plantIds || []).map(String).concat(['', '', '']).slice(0, 3),
  );
  const [notionNiveau, setNotionNiveau] = useState(session.config?.notionNiveau || 'cycle4');
  const [notionId, setNotionId] = useState(session.config?.notionId || '');
  const [questionCode, setQuestionCode] = useState(session.config?.questionCode || '');
  const [isPublished, setIsPublished] = useState(!!session.isPublished);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isA = session.templateKey === 'college_reconaitre';
  const isB = session.templateKey === 'college_qui_mange';

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
      };
      if (isA) {
        body.keyIdOrSlug = keyIdOrSlug || null;
        body.plantId = plantId ? Number(plantId) : null;
        body.plantIds = plantId ? [Number(plantId)] : [];
      }
      if (isB) {
        body.plantIds = plantIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
        body.plantId = body.plantIds[0] || null;
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
        La structure des étapes est figée (modèle {session.templateKey}). Choisis carte, contenus et
        publication.
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
              {m.name || m.id}
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

      {isB && (
        <fieldset className="form-field">
          <legend>Trois plantes du site</legend>
          {[0, 1, 2].map((idx) => (
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

      <label className="form-field">
        <span>Quiz · niveau de notion</span>
        <select value={notionNiveau} onChange={(e) => setNotionNiveau(e.target.value)}>
          <option value="">— libre —</option>
          <option value="cycle3">Cycle 3</option>
          <option value="cycle4">Cycle 4</option>
          <option value="lycee">Lycée</option>
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
