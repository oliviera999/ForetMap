import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';

const INTERACTION_LABELS = {
  predation: 'Prédation',
  parasitisme: 'Parasitisme',
  mutualisme: 'Mutualisme',
  commensalisme: 'Commensalisme',
  competition: 'Compétition',
  decomposition: 'Décomposition',
  pollination: 'Pollinisation',
  herbivory: 'Herbivorie',
};

function interactionLabel(type) {
  const key = String(type || '').trim().toLowerCase();
  return INTERACTION_LABELS[key] || type || 'Interaction';
}

export function FoodWebView({
  onOpenPlant,
  onOpenGlossaryTerm,
  highlightPlantId = null,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [edgeGlossary, setEdgeGlossary] = useState([]);
  const [edgeLoading, setEdgeLoading] = useState(false);

  const loadFoodWeb = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/food-web');
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err.message || 'Chargement impossible');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFoodWeb();
  }, [loadFoodWeb]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const row of items) {
      const key = row.interaction_type || 'autre';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
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

      {loading ? <p className="section-sub card" style={{ padding: 16 }}>Chargement…</p> : null}
      {error ? <p className="pedago-error">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <p className="section-sub card" style={{ padding: 16 }}>Aucune interaction enregistrée.</p>
      ) : null}

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
                  {selectedEdgeId === row.id ? (
                    <div className="pedago-foodweb__glossary">
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
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
