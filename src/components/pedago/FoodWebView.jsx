import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { FoodWebGraph } from './FoodWebGraph.jsx';

const INTERACTION_LABELS = {
  pollinisation: 'Pollinisation',
  herbivorie: 'Herbivorie',
  predation: 'Prédation',
  plante_hote: 'Plante hôte',
  decomposition: 'Décomposition',
  nitrification: 'Nitrification',
  symbiose: 'Symbiose',
  competition: 'Compétition',
};

function interactionLabel(type) {
  const key = String(type || '').trim().toLowerCase();
  return INTERACTION_LABELS[key] || type || 'Interaction';
}

export function FoodWebView({
  mapZones = [],
  onOpenPlant,
  onOpenGlossaryTerm,
  highlightPlantId = null,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [interactionFilter, setInteractionFilter] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [edgeGlossary, setEdgeGlossary] = useState([]);
  const [edgeLoading, setEdgeLoading] = useState(false);

  const loadFoodWeb = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = zoneId ? `?zoneId=${encodeURIComponent(zoneId)}` : '';
      const data = await api(`/api/food-web${qs}`);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err.message || 'Chargement impossible');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [zoneId]);

  useEffect(() => {
    loadFoodWeb();
  }, [loadFoodWeb]);

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

  const nodeIds = useMemo(() => {
    const ids = new Set();
    if (highlightPlantId != null) ids.add(Number(highlightPlantId));
    return ids;
  }, [highlightPlantId]);

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
    const highlighted = nodeIds.has(Number(id));
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

  return (
    <div className="pedago-view pedago-foodweb">
      <header className="pedago-view__head">
        <h2 className="section-title">🕸️ Réseau trophique</h2>
        <p className="section-sub">
          Relations entre espèces du site — clique une flèche pour le glossaire, une espèce pour sa fiche.
        </p>
      </header>

      <div className="pedago-filters card pedago-foodweb__filters">
        {mapZones.length > 0 ? (
          <label className="pedago-filter-field">
            <span>Zone</span>
            <select className="form-select" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              <option value="">Tout le site</option>
              {mapZones.map((z) => (
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
          <select className="form-select" value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
            <option value="list">Liste</option>
            <option value="graph">Graphe</option>
          </select>
        </label>
      </div>

      {loading ? <p className="section-sub card" style={{ padding: 16 }}>Chargement…</p> : null}
      {error ? <p className="pedago-error">{error}</p> : null}

      {!loading && !error && filteredItems.length === 0 ? (
        <p className="section-sub card" style={{ padding: 16 }}>Aucune interaction enregistrée.</p>
      ) : null}

      {!loading && !error && viewMode === 'graph' && filteredItems.length > 0 ? (
        <div className="card pedago-foodweb__graph-wrap">
          <FoodWebGraph
            items={filteredItems}
            selectedEdgeId={selectedEdgeId}
            highlightPlantId={highlightPlantId}
            onSelectEdge={selectEdge}
            onOpenPlant={onOpenPlant}
          />
        </div>
      ) : null}

      {viewMode === 'list' ? (
        <div className="pedago-foodweb__groups">
          {grouped.map(([type, rows]) => (
            <section key={type} className="card pedago-foodweb__group">
              <h3 className="pedago-panel-title">{interactionLabel(type)}</h3>
              <ul className="pedago-foodweb__edges">
                {rows.map((row) => (
                  <li key={row.id} className="pedago-foodweb__row">
                    <div className="pedago-foodweb__edge-line">
                      {renderNode(row.from_id, row.from_name, row.from_emoji)}
                      <button
                        type="button"
                        className={`pedago-foodweb__edge${selectedEdgeId === row.id ? ' active' : ''}`}
                        onClick={() => selectEdge(row.id)}
                        title={row.description || interactionLabel(type)}
                      >
                        <span className="pedago-foodweb__edge-arrow" aria-hidden="true">
                          →
                        </span>
                        <span className="pedago-foodweb__edge-label">{interactionLabel(type)}</span>
                      </button>
                      {renderNode(row.to_id, row.to_name, row.to_emoji)}
                    </div>
                    {row.description ? (
                      <p className="pedago-foodweb__desc">{row.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
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
  );
}
