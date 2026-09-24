import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useData } from '../../contexts/DataContext.jsx';
import { IconAdd, IconBiodiv, IconDelete, IconEdit } from '../../shared/icons.jsx';
import { useAppDialogs } from '../../shared/components/AppDialogsProvider.jsx';

function NestedBox({ node, depth = 0, showPlants = true }) {
  if (!node) return null;
  return (
    <div className="nested-groups-box" style={{ '--nested-depth': depth }} data-clade-id={node.id}>
      <div className="nested-groups-box__head" title={node.shared_attribute || undefined}>
        <strong>{node.name}</strong>
        {node.shared_attribute ? (
          <span className="nested-groups-box__attr">{node.shared_attribute}</span>
        ) : null}
      </div>
      <div className="nested-groups-box__body">
        {(node.children || []).map((child) => (
          <NestedBox key={child.id} node={child} depth={depth + 1} showPlants={showPlants} />
        ))}
        {showPlants
          ? (node.plants || []).map((p) => (
              <span key={p.id} className="nested-groups-species">
                {p.emoji ? `${p.emoji} ` : ''}
                {p.name}
              </span>
            ))
          : null}
      </div>
    </div>
  );
}

function AdminTreePanel({ items, onReload, canManage }) {
  const { confirm } = useAppDialogs();
  const [form, setForm] = useState({
    id: '',
    name: '',
    shared_attribute: '',
    parent_id: '',
    sort_order: 0,
  });
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!canManage) return null;

  const startEdit = (row) => {
    setEditId(row.id);
    setForm({
      id: row.id,
      name: row.name || '',
      shared_attribute: row.shared_attribute || '',
      parent_id: row.parent_id || '',
      sort_order: row.sort_order || 0,
    });
    setError('');
  };

  const resetForm = () => {
    setEditId(null);
    setForm({ id: '', name: '', shared_attribute: '', parent_id: '', sort_order: 0 });
    setError('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (editId) {
        await api(`/api/clades/${encodeURIComponent(editId)}`, 'PUT', {
          name: form.name,
          shared_attribute: form.shared_attribute,
          parent_id: form.parent_id || null,
          sort_order: Number(form.sort_order) || 0,
        });
      } else {
        await api('/api/clades', 'POST', {
          id: form.id,
          name: form.name,
          shared_attribute: form.shared_attribute,
          parent_id: form.parent_id || null,
          sort_order: Number(form.sort_order) || 0,
        });
      }
      resetForm();
      await onReload();
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!(await confirm({ message: `Supprimer le groupe « ${id} » ?`, danger: true }))) return;
    setError('');
    try {
      await api(`/api/clades/${encodeURIComponent(id)}`, 'DELETE');
      if (editId === id) resetForm();
      await onReload();
    } catch (err) {
      setError(err?.message || 'Suppression impossible');
    }
  };

  return (
    <section className="nested-groups-admin" aria-label="Administration de l’arbre">
      <h3>Administrer les groupes</h3>
      <p className="muted">
        Ajouter, déplacer ou supprimer un groupe. Un déplacement qui créerait un cycle est refusé.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="nested-groups-admin__form">
        {!editId ? (
          <label>
            Identifiant
            <input
              value={form.id}
              onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
              placeholder="ex. lichens"
              autoComplete="off"
            />
          </label>
        ) : (
          <p>
            Modification de <strong>{editId}</strong>
          </p>
        )}
        <label>
          Nom
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label>
          Attribut partagé
          <input
            value={form.shared_attribute}
            onChange={(e) => setForm((f) => ({ ...f, shared_attribute: e.target.value }))}
          />
        </label>
        <label>
          Parent
          <select
            value={form.parent_id}
            onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}
          >
            <option value="">(racine)</option>
            {items
              .filter((c) => c.id !== editId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Ordre
          <input
            type="number"
            value={form.sort_order}
            onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
          />
        </label>
        <div className="nested-groups-admin__actions">
          <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
            <IconAdd size={16} /> {editId ? 'Enregistrer' : 'Ajouter'}
          </button>
          {editId ? (
            <button type="button" className="btn" onClick={resetForm}>
              Annuler
            </button>
          ) : null}
        </div>
      </div>
      <ul className="nested-groups-admin__list">
        {items.map((row) => (
          <li key={row.id}>
            <span>
              <strong>{row.name}</strong>
              {row.parent_id ? ` ← ${row.parent_id}` : ' (racine)'}
              <em title={row.shared_attribute}> — {row.shared_attribute}</em>
            </span>
            <span className="nested-groups-admin__row-actions">
              <button type="button" className="btn btn-sm" onClick={() => startEdit(row)}>
                <IconEdit size={14} /> Modifier
              </button>
              <button type="button" className="btn btn-sm" onClick={() => remove(row.id)}>
                <IconDelete size={14} /> Supprimer
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Activité pédagogique « Groupes emboîtés » + administration de l'arbre (si `canManage`).
 */
export function NestedGroupsView({
  maps = [],
  initialMapId = null,
  canManage = false,
  onOpenPlant = null,
  activityRequest = null,
}) {
  const { plants = [] } = useData() || {};
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState('teacher'); // teacher | student
  const [selectedIds, setSelectedIds] = useState([]);
  const [mapId, setMapId] = useState(initialMapId || '');
  const [count, setCount] = useState(6);
  const [tree, setTree] = useState(null);
  const [activityPlants, setActivityPlants] = useState([]);
  const [cladeOptions, setCladeOptions] = useState([]);
  const [placements, setPlacements] = useState({});
  const [checkResult, setCheckResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadTree = useCallback(async () => {
    const data = await api('/api/clades');
    setItems(Array.isArray(data?.items) ? data.items : []);
  }, []);

  useEffect(() => {
    loadTree().catch(() => setItems([]));
  }, [loadTree]);

  const classifiedPlants = useMemo(
    () =>
      (plants || []).filter((p) => p.clade_id).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [plants],
  );

  const togglePlant = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 30 ? prev : [...prev, id],
    );
  };

  const buildSubtree = useCallback(
    async (payload, { forceStudent = false } = {}) => {
      setLoading(true);
      setError('');
      setCheckResult(null);
      try {
        const data = await api('/api/clades/activity/subtree', 'POST', payload);
        setTree(data.tree || null);
        setActivityPlants(data.plants || []);
        setCladeOptions(data.cladeOptions || []);
        setPlacements({});
        if (!canManage || forceStudent) setMode('student');
      } catch (err) {
        setError(err?.message || 'Impossible de construire l’activité');
        setTree(null);
      } finally {
        setLoading(false);
      }
    },
    [canManage],
  );

  // Séance pédagogique : l'activité est lancée d'emblée avec les espèces choisies par le prof
  // (ou tirées d'une carte), en mode élève.
  const handledActivityNonceRef = useRef(null);
  useEffect(() => {
    if (!activityRequest || handledActivityNonceRef.current === activityRequest.nonce) return;
    handledActivityNonceRef.current = activityRequest.nonce;
    const ids = Array.isArray(activityRequest.plantIds) ? activityRequest.plantIds : [];
    if (ids.length >= 2) {
      setSelectedIds(ids);
      buildSubtree({ plantIds: ids }, { forceStudent: true });
    } else if (activityRequest.mapId) {
      setMapId(activityRequest.mapId);
      buildSubtree({ mapId: activityRequest.mapId, count: 6 }, { forceStudent: true });
    }
  }, [activityRequest, buildSubtree]);

  const startFromSelection = () => buildSubtree({ plantIds: selectedIds });
  const startFromMap = () => buildSubtree({ mapId, count: Number(count) || 6 });

  const runCheck = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/clades/activity/check', 'POST', {
        placements: activityPlants.map((p) => ({
          plantId: p.id,
          cladeId: placements[p.id] || null,
        })),
      });
      setCheckResult(data);
    } catch (err) {
      setError(err?.message || 'Correction impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nested-groups-view fade-in">
      <header className="nested-groups-view__header">
        <h2>
          <IconBiodiv size={22} /> Groupes emboîtés
        </h2>
        <p>
          Classer des espèces dans le plus petit arbre qui les contient — chaque boîte porte le
          caractère partagé du groupe.
        </p>
      </header>

      {canManage ? (
        <div className="nested-groups-view__modes" role="tablist">
          <button
            type="button"
            className={mode === 'teacher' ? 'btn btn-primary' : 'btn'}
            onClick={() => setMode('teacher')}
          >
            Préparer
          </button>
          <button
            type="button"
            className={mode === 'student' ? 'btn btn-primary' : 'btn'}
            onClick={() => setMode('student')}
            disabled={!tree}
          >
            Mode élève
          </button>
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      {mode === 'teacher' || !tree ? (
        <section className="nested-groups-setup">
          <h3>Choisir des espèces</h3>
          <div className="nested-groups-setup__picks">
            {classifiedPlants.slice(0, 80).map((p) => (
              <label key={p.id} className="nested-groups-chip">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(p.id)}
                  onChange={() => togglePlant(p.id)}
                />
                {p.emoji ? `${p.emoji} ` : ''}
                {p.name}
              </label>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || selectedIds.length < 2}
            onClick={startFromSelection}
          >
            Construire avec la sélection ({selectedIds.length})
          </button>

          <h3>Ou tirer N espèces d’une carte</h3>
          <div className="nested-groups-setup__map">
            <select value={mapId} onChange={(e) => setMapId(e.target.value)}>
              <option value="">Choisir une carte…</option>
              {(maps || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.label || m.id}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={2}
              max={20}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              aria-label="Nombre d’espèces"
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading || !mapId}
              onClick={startFromMap}
            >
              Tirer au sort
            </button>
          </div>
        </section>
      ) : null}

      {tree && mode === 'teacher' ? (
        <section className="nested-groups-result">
          <h3>Boîtes emboîtées</h3>
          <NestedBox node={tree} showPlants />
          <button type="button" className="btn" onClick={() => setMode('student')}>
            Passer en mode élève
          </button>
        </section>
      ) : null}

      {tree && mode === 'student' ? (
        <section className="nested-groups-student">
          <h3>Place chaque espèce dans son groupe</h3>
          <NestedBox node={tree} showPlants={false} />
          <ul className="nested-groups-placements">
            {activityPlants.map((p) => (
              <li key={p.id}>
                <button type="button" className="linkish" onClick={() => onOpenPlant?.(p.id)}>
                  {p.emoji ? `${p.emoji} ` : ''}
                  {p.name}
                </button>
                <select
                  value={placements[p.id] || ''}
                  onChange={(e) => setPlacements((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  aria-label={`Groupe pour ${p.name}`}
                >
                  <option value="">Choisir…</option>
                  {cladeOptions.map((c) => (
                    <option key={c.id} value={c.id} title={c.shared_attribute}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" disabled={loading} onClick={runCheck}>
            Corriger
          </button>
          {checkResult ? (
            <p className={checkResult.allCorrect ? 'form-success' : 'form-error'}>
              {checkResult.correctCount}/{checkResult.total} correct
              {checkResult.allCorrect ? ' — bravo !' : ''}
            </p>
          ) : null}
        </section>
      ) : null}

      <AdminTreePanel items={items} onReload={loadTree} canManage={canManage} />
    </div>
  );
}
