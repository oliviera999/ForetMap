import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useData } from '../../contexts/DataContext.jsx';
import { IconAdd, IconBiodiv, IconDelete, IconEdit, IconSearch } from '../../shared/icons.jsx';
import { IdKeySchemaView } from './IdKeySchemaView.jsx';

const READER_MODE_KEY = 'foretmap.id-keys.readerMode';

function readStoredReaderMode() {
  try {
    const raw = window.localStorage.getItem(READER_MODE_KEY);
    return raw === 'schema' ? 'schema' : 'questions';
  } catch (_) {
    return 'questions';
  }
}

function storeReaderMode(mode) {
  try {
    window.localStorage.setItem(READER_MODE_KEY, mode);
  } catch (_) {
    /* navigation privée / quota */
  }
}

function ReaderPanel({ keyBundle, onOpenPlant, onBack }) {
  const [history, setHistory] = useState([]);
  const [readerMode, setReaderMode] = useState(readStoredReaderMode);
  const startCouplet = useMemo(
    () =>
      (keyBundle?.couplets || []).find((c) => Number(c.number) === 1) || keyBundle?.couplets?.[0],
    [keyBundle],
  );
  const currentId = history.length ? history[history.length - 1] : startCouplet?.id;
  const current = (keyBundle?.couplets || []).find((c) => Number(c.id) === Number(currentId));
  const [arrivedPlant, setArrivedPlant] = useState(null);

  const setMode = useCallback((mode) => {
    setReaderMode(mode);
    storeReaderMode(mode);
  }, []);

  const chooseLead = useCallback((lead) => {
    if (lead.plant_id) {
      setArrivedPlant({
        id: lead.plant_id,
        name: lead.plant_name,
        emoji: lead.plant_emoji,
      });
    } else if (lead.next_couplet_id) {
      setHistory((h) => [...h, lead.next_couplet_id]);
    }
  }, []);

  if (!keyBundle) return null;
  if (arrivedPlant) {
    return (
      <div className="id-key-reader">
        <p className="form-success">Espèce identifiée</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onOpenPlant?.(arrivedPlant.id)}
        >
          {arrivedPlant.emoji ? `${arrivedPlant.emoji} ` : ''}
          {arrivedPlant.name || `Fiche #${arrivedPlant.id}`}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setArrivedPlant(null);
            setHistory([]);
          }}
        >
          Recommencer
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Retour à la liste
        </button>
      </div>
    );
  }

  if (!current) {
    return <p className="form-error">Cette clé n’a pas encore de couplet de départ.</p>;
  }

  return (
    <div className="id-key-reader">
      <h3>
        {keyBundle.title}
        {keyBundle.scope_label ? ` — ${keyBundle.scope_label}` : ''}
      </h3>
      <div className="id-key-reader__modes" role="group" aria-label="Mode de lecture">
        <button
          type="button"
          className={readerMode === 'questions' ? 'btn btn-primary' : 'btn'}
          aria-pressed={readerMode === 'questions'}
          onClick={() => setMode('questions')}
        >
          Questions
        </button>
        <button
          type="button"
          className={readerMode === 'schema' ? 'btn btn-primary' : 'btn'}
          aria-pressed={readerMode === 'schema'}
          onClick={() => setMode('schema')}
        >
          Schéma
        </button>
      </div>
      {readerMode === 'schema' ? (
        <>
          <p className="muted">
            Couplet {current.number} — schéma de la clé (branche active depuis le nœud mis en
            évidence).
          </p>
          <IdKeySchemaView
            keyBundle={keyBundle}
            currentCoupletId={currentId}
            history={history}
            onChooseLead={chooseLead}
            onOpenPlant={onOpenPlant}
          />
        </>
      ) : (
        <>
          <p className="muted">
            Couplet {current.number} — choisissez le caractère observé (sans manipuler).
          </p>
          <ul className="id-key-leads">
            {(current.leads || []).map((lead) => (
              <li key={lead.id}>
                <button
                  type="button"
                  className="btn id-key-lead-btn"
                  onClick={() => chooseLead(lead)}
                >
                  {lead.image_url ? (
                    <img src={lead.image_url} alt="" className="id-key-lead-img" />
                  ) : null}
                  <span>{lead.statement}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="id-key-reader__nav">
        <button
          type="button"
          className="btn"
          disabled={history.length === 0}
          onClick={() => setHistory((h) => h.slice(0, -1))}
        >
          Retour
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Quitter
        </button>
      </div>
    </div>
  );
}

function EditorPanel({ keyBundle, onReload, plants }) {
  const [meta, setMeta] = useState({
    title: keyBundle.title || '',
    description: keyBundle.description || '',
    scope_label: keyBundle.scope_label || '',
    niveau: keyBundle.niveau || 'college',
    is_published: Boolean(keyBundle.is_published),
  });
  const [selectedCoupletId, setSelectedCoupletId] = useState(keyBundle.couplets?.[0]?.id || null);
  const [leadsDraft, setLeadsDraft] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMeta({
      title: keyBundle.title || '',
      description: keyBundle.description || '',
      scope_label: keyBundle.scope_label || '',
      niveau: keyBundle.niveau || 'college',
      is_published: Boolean(keyBundle.is_published),
    });
  }, [keyBundle]);

  useEffect(() => {
    const couplet = (keyBundle.couplets || []).find(
      (c) => Number(c.id) === Number(selectedCoupletId),
    );
    setLeadsDraft(
      (couplet?.leads || []).map((l) => ({
        statement: l.statement || '',
        image_url: l.image_url || '',
        next_couplet_id: l.next_couplet_id || '',
        plant_id: l.plant_id || '',
      })),
    );
  }, [keyBundle, selectedCoupletId]);

  const saveMeta = async () => {
    setSaving(true);
    setError('');
    try {
      await api(`/api/id-keys/${keyBundle.id}`, 'PUT', meta);
      await onReload();
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const addCouplet = async () => {
    setError('');
    try {
      const created = await api(`/api/id-keys/${keyBundle.id}/couplets`, 'POST', {});
      await onReload();
      setSelectedCoupletId(created.id);
    } catch (err) {
      setError(err?.message || 'Ajout de couplet impossible');
    }
  };

  const saveLeads = async () => {
    setSaving(true);
    setError('');
    try {
      await api(`/api/id-keys/${keyBundle.id}/couplets/${selectedCoupletId}/leads`, 'PUT', {
        leads: leadsDraft.map((l, i) => ({
          statement: l.statement,
          image_url: l.image_url || null,
          next_couplet_id: l.next_couplet_id ? Number(l.next_couplet_id) : null,
          plant_id: l.plant_id ? Number(l.plant_id) : null,
          sort_order: i,
        })),
      });
      await onReload();
    } catch (err) {
      setError(err?.message || 'Enregistrement des propositions impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="id-key-editor">
      <h3>Éditer — {keyBundle.slug}</h3>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="id-key-editor__meta">
        <label>
          Titre
          <input
            value={meta.title}
            onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
          />
        </label>
        <label>
          Périmètre
          <input
            value={meta.scope_label}
            onChange={(e) => setMeta((m) => ({ ...m, scope_label: e.target.value }))}
            placeholder="Ex. Arbres du lycée"
          />
        </label>
        <label>
          Niveau
          <select
            value={meta.niveau}
            onChange={(e) => setMeta((m) => ({ ...m, niveau: e.target.value }))}
          >
            <option value="college">Collège</option>
            <option value="lycee">Lycée</option>
          </select>
        </label>
        <label className="id-key-editor__check">
          <input
            type="checkbox"
            checked={meta.is_published}
            onChange={(e) => setMeta((m) => ({ ...m, is_published: e.target.checked }))}
          />
          Publiée
        </label>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={saveMeta}>
          Enregistrer la clé
        </button>
      </div>

      <div className="id-key-editor__couplets">
        <h4>Couplets</h4>
        <div className="id-key-editor__couplet-tabs">
          {(keyBundle.couplets || []).map((c) => (
            <button
              key={c.id}
              type="button"
              className={Number(c.id) === Number(selectedCoupletId) ? 'btn btn-primary' : 'btn'}
              onClick={() => setSelectedCoupletId(c.id)}
            >
              #{c.number}
            </button>
          ))}
          <button type="button" className="btn" onClick={addCouplet}>
            <IconAdd size={14} /> Couplet
          </button>
        </div>

        <p className="muted">
          Chaque proposition mène soit à un autre couplet, soit à une espèce — pas les deux. Décrire
          un caractère observable, sans invitation à manipuler.
        </p>
        {leadsDraft.map((lead, idx) => (
          <div key={idx} className="id-key-editor__lead">
            <label>
              Énoncé
              <textarea
                value={lead.statement}
                onChange={(e) => {
                  const v = e.target.value;
                  setLeadsDraft((rows) =>
                    rows.map((r, i) => (i === idx ? { ...r, statement: v } : r)),
                  );
                }}
                rows={2}
              />
            </label>
            <label>
              Image (URL)
              <input
                value={lead.image_url}
                onChange={(e) => {
                  const v = e.target.value;
                  setLeadsDraft((rows) =>
                    rows.map((r, i) => (i === idx ? { ...r, image_url: v } : r)),
                  );
                }}
              />
            </label>
            <label>
              Couplet suivant
              <select
                value={lead.next_couplet_id}
                onChange={(e) => {
                  const v = e.target.value;
                  setLeadsDraft((rows) =>
                    rows.map((r, i) =>
                      i === idx ? { ...r, next_couplet_id: v, plant_id: v ? '' : r.plant_id } : r,
                    ),
                  );
                }}
              >
                <option value="">—</option>
                {(keyBundle.couplets || [])
                  .filter((c) => Number(c.id) !== Number(selectedCoupletId))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      Couplet {c.number}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Espèce
              <select
                value={lead.plant_id}
                onChange={(e) => {
                  const v = e.target.value;
                  setLeadsDraft((rows) =>
                    rows.map((r, i) =>
                      i === idx
                        ? { ...r, plant_id: v, next_couplet_id: v ? '' : r.next_couplet_id }
                        : r,
                    ),
                  );
                }}
              >
                <option value="">—</option>
                {(plants || []).slice(0, 400).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setLeadsDraft((rows) => rows.filter((_, i) => i !== idx))}
            >
              <IconDelete size={14} />
            </button>
          </div>
        ))}
        <div className="id-key-editor__lead-actions">
          <button
            type="button"
            className="btn"
            onClick={() =>
              setLeadsDraft((rows) => [
                ...rows,
                { statement: '', image_url: '', next_couplet_id: '', plant_id: '' },
              ])
            }
          >
            <IconAdd size={14} /> Proposition
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={saveLeads}>
            Enregistrer les propositions
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Lecteur élève (une question à la fois) + éditeur pour `id_keys.manage`.
 * @param {object} props
 * @param {boolean} [props.canManage]
 * @param {(plantId: number|string) => void} [props.onOpenPlant]
 * @param {string|number|null} [props.initialKey] — id ou slug à ouvrir au montage / changement
 */
export function IdKeysView({ canManage = false, onOpenPlant = null, initialKey = null }) {
  const { plants = [] } = useData() || {};
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);
  const [mode, setMode] = useState('read'); // read | edit | list
  const [error, setError] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const loadList = useCallback(async () => {
    const data = await api(canManage ? '/api/id-keys?all=1' : '/api/id-keys');
    setItems(Array.isArray(data?.items) ? data.items : []);
  }, [canManage]);

  useEffect(() => {
    loadList().catch(() => setItems([]));
  }, [loadList]);

  const openKey = useCallback(async (idOrSlug, nextMode = 'read') => {
    setError('');
    try {
      const data = await api(`/api/id-keys/${encodeURIComponent(idOrSlug)}`);
      setActive(data);
      setMode(nextMode);
    } catch (err) {
      setError(err?.message || 'Chargement impossible');
    }
  }, []);

  useEffect(() => {
    const raw = initialKey != null ? String(initialKey).trim() : '';
    if (!raw) return;
    openKey(raw, 'read');
  }, [initialKey, openKey]);

  const createKey = async () => {
    setError('');
    try {
      const data = await api('/api/id-keys', 'POST', { slug: newSlug, title: newTitle });
      setNewSlug('');
      setNewTitle('');
      await loadList();
      setActive(data);
      setMode('edit');
    } catch (err) {
      setError(err?.message || 'Création impossible');
    }
  };

  const reloadActive = async () => {
    if (!active?.id) return;
    const data = await api(`/api/id-keys/${active.id}`);
    setActive(data);
    await loadList();
  };

  return (
    <div className="id-keys-view fade-in">
      <header className="id-keys-view__header">
        <h2>
          <IconSearch size={22} /> Clés d’identification
        </h2>
        <p>
          Mode Questions (une fourche à la fois) ou Schéma (arbre de la clé) — caractères
          observables seulement, jusqu’à la fiche espèce.
        </p>
      </header>
      {error ? <p className="form-error">{error}</p> : null}

      {mode === 'list' || !active ? (
        <section>
          <ul className="id-keys-list">
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" className="btn" onClick={() => openKey(item.id, 'read')}>
                  <IconBiodiv size={16} /> {item.title}
                  {!item.is_published ? ' (brouillon)' : ''}
                </button>
                {canManage ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => openKey(item.id, 'edit')}
                  >
                    <IconEdit size={14} /> Éditer
                  </button>
                ) : null}
              </li>
            ))}
            {items.length === 0 ? (
              <li className="muted">Aucune clé publiée pour l’instant.</li>
            ) : null}
          </ul>
          {canManage ? (
            <div className="id-keys-create">
              <h3>Nouvelle clé</h3>
              <input
                placeholder="slug"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
              />
              <input
                placeholder="Titre"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <button type="button" className="btn btn-primary" onClick={createKey}>
                <IconAdd size={14} /> Créer
              </button>
            </div>
          ) : null}
        </section>
      ) : mode === 'edit' && canManage ? (
        <>
          <button type="button" className="btn" onClick={() => setActive(null)}>
            ← Liste
          </button>
          <EditorPanel keyBundle={active} onReload={reloadActive} plants={plants} />
        </>
      ) : (
        <ReaderPanel keyBundle={active} onOpenPlant={onOpenPlant} onBack={() => setActive(null)} />
      )}
    </div>
  );
}
