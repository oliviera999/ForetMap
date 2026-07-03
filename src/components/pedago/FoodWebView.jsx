import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { FoodWebGraph } from './FoodWebGraph.jsx';
import {
  INTERACTION_TYPES,
  interactionTypeLabel as interactionLabel,
  orientInteraction,
} from '../../shared/foodWebTypes.js';
import { edgeStyleForType } from '../../shared/foodWebEdgeStyle.js';

const EMPTY_FORM = { fromId: '', toId: '', type: INTERACTION_TYPES[0], description: '' };

export function FoodWebView({
  maps = [],
  onOpenPlant,
  onOpenGlossaryTerm,
  highlightPlantId = null,
  canManage = false,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapId, setMapId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [filterZones, setFilterZones] = useState([]);
  const [interactionFilter, setInteractionFilter] = useState('');
  const [viewMode, setViewMode] = useState('graph');
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [edgeGlossary, setEdgeGlossary] = useState([]);
  const [edgeLoading, setEdgeLoading] = useState(false);
  const [speciesOptions, setSpeciesOptions] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [adminError, setAdminError] = useState('');

  const loadFoodWeb = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (zoneId) params.set('zoneId', zoneId);
      else if (mapId) params.set('mapId', mapId);
      const qs = params.toString() ? `?${params}` : '';
      const data = await api(`/api/food-web${qs}`);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err.message || 'Chargement impossible');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [zoneId, mapId]);

  useEffect(() => {
    loadFoodWeb();
  }, [loadFoodWeb]);

  useEffect(() => {
    setZoneId('');
  }, [mapId]);

  useEffect(() => {
    if (!mapId) {
      setFilterZones([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api(`/api/zones?map_id=${encodeURIComponent(mapId)}`);
        if (cancelled) return;
        setFilterZones(Array.isArray(data) ? data : []);
      } catch (_) {
        if (!cancelled) setFilterZones([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapId]);

  useEffect(() => {
    if (!canManage) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await api('/api/plants');
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setSpeciesOptions(
          list
            .map((p) => ({ id: Number(p.id), name: p.name, emoji: p.emoji || '' }))
            .filter((p) => Number.isFinite(p.id) && p.id > 0)
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr')),
        );
      } catch (_) {
        if (!cancelled) setSpeciesOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  const createInteraction = useCallback(
    async (event) => {
      event.preventDefault();
      setAdminError('');
      const fromId = Number(form.fromId);
      if (!Number.isInteger(fromId) || fromId <= 0) {
        setAdminError('Choisis une espèce source.');
        return;
      }
      setSaving(true);
      try {
        await api('/api/food-web/interactions', 'POST', {
          from_id: fromId,
          to_id: form.toId ? Number(form.toId) : null,
          interaction_type: form.type,
          description: form.description.trim() || null,
        });
        setForm((prev) => ({ ...EMPTY_FORM, type: prev.type }));
        await loadFoodWeb();
      } catch (err) {
        setAdminError(err.message || 'Création impossible');
      } finally {
        setSaving(false);
      }
    },
    [form, loadFoodWeb],
  );

  const deleteInteraction = useCallback(
    async (interactionId) => {
      if (!interactionId) return;
      setAdminError('');
      try {
        await api(`/api/food-web/interactions/${interactionId}`, 'DELETE');
        if (selectedEdgeId === interactionId) {
          setSelectedEdgeId(null);
          setEdgeGlossary([]);
        }
        await loadFoodWeb();
      } catch (err) {
        setAdminError(err.message || 'Suppression impossible');
      }
    },
    [loadFoodWeb, selectedEdgeId],
  );

  const filteredItems = useMemo(() => {
    if (!interactionFilter) return items;
    return items.filter((row) => String(row.interaction_type || '') === interactionFilter);
  }, [items, interactionFilter]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const row of filteredItems) {
      const key = row.interaction_type || 'autre';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
  }, [filteredItems]);

  const interactionTypes = useMemo(() => {
    const set = new Set(items.map((row) => String(row.interaction_type || 'autre')));
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [items]);

  async function selectEdge(interactionId) {
    if (selectedEdgeId === interactionId) {
      setSelectedEdgeId(null);
      setEdgeGlossary([]);
      return;
    }
    setSelectedEdgeId(interactionId);
    setEdgeLoading(true);
    setEdgeGlossary([]);
    try {
      const data = await api(`/api/food-web/interactions/${interactionId}/glossary`);
      setEdgeGlossary(Array.isArray(data?.terms) ? data.terms : []);
    } catch (_) {
      setEdgeGlossary([]);
    } finally {
      setEdgeLoading(false);
    }
  }

  function renderNode(id, name, emoji) {
    if (id == null) {
      return (
        <span className="pedago-foodweb__node pedago-foodweb__node--env">
          {name || 'Environnement'}
        </span>
      );
    }
    const highlighted = highlightPlantId != null && Number(id) === Number(highlightPlantId);
    return (
      <button
        type="button"
        className={`pedago-foodweb__node${highlighted ? ' pedago-foodweb__node--highlight' : ''}`}
        onClick={() => onOpenPlant?.(id)}
      >
        {emoji ? `${emoji} ` : ''}
        {name}
      </button>
    );
  }

  const graphLayout = viewMode === 'graph' && !loading && !error && filteredItems.length > 0;
  const listLayout = viewMode === 'list' && !loading && !error && filteredItems.length > 0;
  const compactControls = graphLayout || listLayout;

  const listGroups = (
    <div className="pedago-foodweb__groups">
      {grouped.map(([type, rows]) => (
        <section key={type} className="card pedago-foodweb__group">
          <h3 className="pedago-panel-title">{interactionLabel(type)}</h3>
          <ul className="pedago-foodweb__edges">
            {rows.map((row) => {
              const oriented = orientInteraction(row.from_id, row.to_id, row.interaction_type);
              const endpoint = (id) => {
                if (id == null) return { id: null };
                return Number(id) === Number(row.from_id)
                  ? { id: row.from_id, name: row.from_name, emoji: row.from_emoji }
                  : { id: row.to_id, name: row.to_name, emoji: row.to_emoji };
              };
              const tail = endpoint(oriented.tailId);
              const head = endpoint(oriented.headId);
              return (
                <li key={row.id} className="pedago-foodweb__row">
                  <div className="pedago-foodweb__edge-line">
                    {renderNode(tail.id, tail.name, tail.emoji)}
                    <button
                      type="button"
                      className={`pedago-foodweb__edge pedago-foodweb__edge--${String(type || 'default').toLowerCase()}${selectedEdgeId === row.id ? ' active' : ''}`}
                      onClick={() => selectEdge(row.id)}
                      title={`${interactionLabel(type)}${row.description ? ` — ${row.description}` : ''}`}
                      style={{ '--fw-edge-color': edgeStyleForType(type).color }}
                    >
                      <span className="pedago-foodweb__edge-arrow" aria-hidden="true">
                        {oriented.symmetric ? '↔' : '→'}
                      </span>
                      <span className="pedago-foodweb__edge-label">{oriented.relation}</span>
                    </button>
                    {renderNode(head.id, head.name, head.emoji)}
                    {canManage ? (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm pedago-foodweb__delete"
                        onClick={() => deleteInteraction(row.id)}
                        title="Supprimer cette interaction"
                        aria-label="Supprimer cette interaction"
                      >
                        🗑️
                      </button>
                    ) : null}
                  </div>
                  {row.description ? (
                    <p className="pedago-foodweb__desc">{row.description}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );

  const adminForm = (showTitle = true) => (
    <form
      className={showTitle ? 'card pedago-foodweb__admin' : 'pedago-foodweb__admin'}
      onSubmit={createInteraction}
    >
      {showTitle ? <h3 className="pedago-panel-title">➕ Ajouter une interaction</h3> : null}
      <div className="pedago-foodweb__admin-fields">
        <label className="pedago-filter-field">
          <span>Espèce source</span>
          <select
            className="form-select"
            value={form.fromId}
            onChange={(e) => setForm((p) => ({ ...p, fromId: e.target.value }))}
            required
          >
            <option value="">— choisir —</option>
            {speciesOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.emoji ? `${s.emoji} ` : ''}
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Type d&apos;interaction</span>
          <select
            className="form-select"
            value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
          >
            {INTERACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {interactionLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Espèce cible (optionnel)</span>
          <select
            className="form-select"
            value={form.toId}
            onChange={(e) => setForm((p) => ({ ...p, toId: e.target.value }))}
          >
            <option value="">— environnement / aucune —</option>
            {speciesOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.emoji ? `${s.emoji} ` : ''}
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field pedago-foodweb__admin-desc">
          <span>Description (optionnel)</span>
          <input
            type="text"
            className="form-input"
            maxLength={255}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Ex. Transport du pollen entre fleurs"
          />
        </label>
      </div>
      <p className="section-sub pedago-foodweb__admin-hint">
        Saisis la <strong>source</strong> = l&apos;espèce qui agit (pour la prédation/herbivorie, le{' '}
        <em>consommateur</em>) et la <strong>cible</strong> = l&apos;espèce subissant l&apos;action
        (la proie / ressource). L&apos;affichage inverse automatiquement la flèche dans le sens
        écologique «&nbsp;est mangée par&nbsp;».
      </p>
      {adminError ? <p className="pedago-error">{adminError}</p> : null}
      <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
        {saving ? 'Enregistrement…' : 'Ajouter'}
      </button>
    </form>
  );

  return (
    <div
      className={`pedago-view pedago-foodweb${graphLayout ? ' pedago-foodweb--graph-layout' : ''}${listLayout ? ' pedago-foodweb--list-layout' : ''}`}
    >
      <header className="pedago-view__head pedago-foodweb__head">
        <h2 className="section-title">🕸️ Réseau trophique</h2>
        <p className="section-sub pedago-foodweb__intro">
          Relations entre espèces du site — clique une flèche pour le glossaire, une espèce pour sa
          fiche.
        </p>
      </header>

      <div
        className={`pedago-foodweb__layout${graphLayout ? ' pedago-foodweb__layout--graph' : ''}${listLayout ? ' pedago-foodweb__layout--list' : ''}`}
      >
        <div
          className={`pedago-foodweb__aside${listLayout ? ' pedago-foodweb__aside--controls' : ''}`}
        >
          {canManage ? (
            compactControls ? (
              <details className="card pedago-foodweb__admin-details">
                <summary className="pedago-foodweb__admin-summary">
                  ➕ Ajouter une interaction
                </summary>
                {adminForm(false)}
              </details>
            ) : (
              adminForm(true)
            )
          ) : null}

          <div className="pedago-filters card pedago-foodweb__filters">
            {maps.length > 0 ? (
              <label className="pedago-filter-field">
                <span>Carte</span>
                <select
                  className="form-select"
                  value={mapId}
                  onChange={(e) => setMapId(e.target.value)}
                >
                  <option value="">Toutes les cartes</option>
                  {maps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label || m.id}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {mapId && filterZones.length > 0 ? (
              <label className="pedago-filter-field">
                <span>Zone</span>
                <select
                  className="form-select"
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                >
                  <option value="">Toute la carte</option>
                  {filterZones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name || `Zone ${z.id}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="pedago-filter-field">
              <span>Type d&apos;interaction</span>
              <select
                className="form-select"
                value={interactionFilter}
                onChange={(e) => setInteractionFilter(e.target.value)}
              >
                <option value="">Tous</option>
                {interactionTypes.map((t) => (
                  <option key={t} value={t}>
                    {interactionLabel(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="pedago-filter-field">
              <span>Affichage</span>
              <select
                className="form-select"
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
              >
                <option value="list">Liste</option>
                <option value="graph">Graphe</option>
              </select>
            </label>
          </div>

          {loading ? (
            <p className="section-sub card" style={{ padding: 16 }}>
              Chargement…
            </p>
          ) : null}
          {error ? <p className="pedago-error">{error}</p> : null}

          {!loading && !error && filteredItems.length === 0 ? (
            <p className="section-sub card" style={{ padding: 16 }}>
              Aucune interaction enregistrée.
            </p>
          ) : null}

          {selectedEdgeId ? (
            <div className="card pedago-foodweb__glossary pedago-foodweb__glossary--panel">
              {edgeLoading ? (
                <p className="section-sub">Glossaire…</p>
              ) : edgeGlossary.length === 0 ? (
                <p className="section-sub">Aucun terme glossaire lié.</p>
              ) : (
                <>
                  <strong>Termes liés</strong>
                  <div className="pedago-chip-row">
                    {edgeGlossary.map((term) => (
                      <button
                        key={term.glossary_code}
                        type="button"
                        className="pedago-chip-btn"
                        onClick={() => onOpenGlossaryTerm?.(term.glossary_code)}
                      >
                        {term.terme}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        {listLayout ? <div className="pedago-foodweb__list-stage">{listGroups}</div> : null}

        {graphLayout ? (
          <div className="card pedago-foodweb__stage pedago-foodweb__graph-wrap">
            <FoodWebGraph
              items={filteredItems}
              selectedEdgeId={selectedEdgeId}
              highlightPlantId={highlightPlantId}
              onSelectEdge={selectEdge}
              onOpenPlant={onOpenPlant}
              legendCompact
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
