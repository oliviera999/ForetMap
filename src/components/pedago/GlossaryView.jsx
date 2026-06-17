import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { MarkdownContent } from '../MarkdownContent.jsx';

const NIVEAU_OPTIONS = [
  { value: '', label: 'Tous niveaux' },
  { value: 'base', label: 'Base' },
  { value: 'approfondissement', label: 'Approfondissement' },
  { value: 'avance', label: 'Avancé' },
];

export function GlossaryView({ onOpenPlant, selectedCode = null, onSelectedCodeChange = null }) {
  const [search, setSearch] = useState('');
  const [niveau, setNiveau] = useState('');
  const [categorie, setCategorie] = useState('');
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeCode, setActiveCode] = useState(selectedCode || '');

  useEffect(() => {
    if (selectedCode) setActiveCode(selectedCode);
  }, [selectedCode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api('/api/glossary/categories');
        if (!cancelled) setCategories(Array.isArray(data?.categories) ? data.categories : []);
      } catch (_) {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadTerms = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      const q = search.trim();
      if (q) params.set('q', q);
      if (niveau) params.set('niveau', niveau);
      if (categorie) params.set('categorie', categorie);
      const qs = params.toString();
      const data = await api(`/api/glossary/terms${qs ? `?${qs}` : ''}`);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err.message || 'Chargement impossible');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search, niveau, categorie]);

  useEffect(() => {
    const timer = setTimeout(loadTerms, search.trim() ? 280 : 0);
    return () => clearTimeout(timer);
  }, [loadTerms, search]);

  const loadDetail = useCallback(async (code) => {
    if (!code) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setError('');
    try {
      const data = await api(`/api/glossary/terms/${encodeURIComponent(code)}`);
      setDetail(data);
    } catch (err) {
      setError(err.message || 'Terme introuvable');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeCode) loadDetail(activeCode);
    else setDetail(null);
  }, [activeCode, loadDetail]);

  const categorieOptions = useMemo(
    () => [{ value: '', label: 'Toutes catégories' }, ...categories.map((c) => ({ value: c, label: c }))],
    [categories],
  );

  function selectTerm(code) {
    setActiveCode(code);
    onSelectedCodeChange?.(code);
  }

  return (
    <div className="pedago-view pedago-glossary">
      <header className="pedago-view__head">
        <h2 className="section-title">📖 Glossaire</h2>
        <p className="section-sub">Termes scientifiques du vivant et du jardinage.</p>
      </header>

      <div className="pedago-filters card">
        <label className="pedago-filter-field">
          <span>Recherche</span>
          <input
            type="search"
            className="form-input"
            placeholder="Mot-clé…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="pedago-filter-field">
          <span>Niveau</span>
          <select className="form-select" value={niveau} onChange={(e) => setNiveau(e.target.value)}>
            {NIVEAU_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Catégorie</span>
          <select
            className="form-select"
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
          >
            {categorieOptions.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="pedago-error">{error}</p> : null}

      <div className="pedago-glossary__layout">
        <aside className="pedago-glossary__list card">
          <h3 className="pedago-panel-title">Termes ({items.length})</h3>
          {loading ? <p className="section-sub">Chargement…</p> : null}
          {!loading && items.length === 0 ? (
            <p className="section-sub">Aucun terme trouvé.</p>
          ) : (
            <ul className="pedago-term-list">
              {items.map((item) => (
                <li key={item.glossary_code}>
                  <button
                    type="button"
                    className={`pedago-term-btn${activeCode === item.glossary_code ? ' active' : ''}`}
                    onClick={() => selectTerm(item.glossary_code)}
                  >
                    <strong>{item.terme}</strong>
                    {item.categorie ? (
                      <span className="task-chip pedago-term-btn__chip">{item.categorie}</span>
                    ) : null}
                    {item.definition_courte ? (
                      <span className="pedago-term-btn__hint">{item.definition_courte}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="pedago-glossary__detail card">
          {!activeCode ? (
            <p className="section-sub">Sélectionne un terme pour afficher sa définition.</p>
          ) : detailLoading ? (
            <p className="section-sub">Chargement de la fiche…</p>
          ) : detail ? (
            <>
              <h3 className="pedago-panel-title">{detail.terme}</h3>
              <div className="task-meta" style={{ marginBottom: 10 }}>
                {detail.categorie ? <span className="task-chip">{detail.categorie}</span> : null}
                {detail.niveau ? <span className="task-chip">{detail.niveau}</span> : null}
              </div>
              {detail.definition_courte ? (
                <p className="plant-row-desc">{detail.definition_courte}</p>
              ) : null}
              {detail.definition_complete ? (
                <MarkdownContent className="plant-row-desc">{detail.definition_complete}</MarkdownContent>
              ) : null}
              {detail.exemple ? (
                <div className="plant-meta-item" style={{ marginTop: 12 }}>
                  <div className="plant-meta-label">Exemple</div>
                  <MarkdownContent className="plant-meta-value">{detail.exemple}</MarkdownContent>
                </div>
              ) : null}
              {detail.etymologie ? (
                <div className="plant-meta-item" style={{ marginTop: 8 }}>
                  <div className="plant-meta-label">Étymologie</div>
                  <MarkdownContent className="plant-meta-value">{detail.etymologie}</MarkdownContent>
                </div>
              ) : null}

              {detail.relatedTerms?.length > 0 ? (
                <div className="pedago-remediation" style={{ marginTop: 16 }}>
                  <strong>Termes liés</strong>
                  <div className="pedago-chip-row">
                    {detail.relatedTerms.map((term) => (
                      <button
                        key={term.glossary_code}
                        type="button"
                        className="pedago-chip-btn"
                        onClick={() => selectTerm(term.glossary_code)}
                      >
                        {term.terme}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail.linkedPlants?.length > 0 ? (
                <div className="pedago-remediation" style={{ marginTop: 16 }}>
                  <strong>Espèces liées</strong>
                  <div className="pedago-chip-row">
                    {detail.linkedPlants.map((plant) => (
                      <button
                        key={plant.id}
                        type="button"
                        className="pedago-chip-btn"
                        onClick={() => onOpenPlant?.(plant.id)}
                      >
                        {plant.emoji ? `${plant.emoji} ` : ''}
                        {plant.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="section-sub">Fiche indisponible.</p>
          )}
        </section>
      </div>
    </div>
  );
}
