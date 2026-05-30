import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

const CATEGORY_OPTIONS = [
  { value: '', label: 'Toutes catégories' },
  { value: 'ecologie', label: 'Écologie' },
  { value: 'climat', label: 'Climat' },
  { value: 'faune', label: 'Faune' },
  { value: 'flore', label: 'Flore' },
  { value: 'biome', label: 'Biome' },
  { value: 'ecosysteme', label: 'Écosystème' },
  { value: 'conservation', label: 'Conservation' },
  { value: 'geographie', label: 'Géographie' },
  { value: 'geologie', label: 'Géologie' },
  { value: 'interaction', label: 'Interactions' },
  { value: 'methode_svt', label: 'Méthode SVT' },
];

const NIVEAU_OPTIONS = [
  { value: '', label: 'Tous niveaux' },
  { value: 'base', label: 'Base' },
  { value: 'approfondissement', label: 'Approfondissement' },
  { value: 'avance', label: 'Avancé' },
];

function groupByCategory(items) {
  const groups = {};
  for (const item of items) {
    const key = item.categorie_label || item.categorie || 'Autres';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

function useIsMobileGlossaryLayout() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(max-width: 900px)').matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(max-width: 900px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

export function GLGlossaryView({ gameState, focusCode, onOpenTerm, onOpenPopover, onFocusHandled }) {
  const chapterBiomes = Array.isArray(gameState?.game?.chapter_biomes)
    ? gameState.game.chapter_biomes
    : [];
  const biomeSlugs = useMemo(
    () => chapterBiomes.map((b) => b.slug).filter(Boolean),
    [chapterBiomes]
  );
  const biomeLabel = useMemo(
    () => chapterBiomes.map((b) => b.nom || b.slug).join(', '),
    [chapterBiomes]
  );
  const isMobileLayout = useIsMobileGlossaryLayout();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categorie, setCategorie] = useState('');
  const [niveau, setNiveau] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCode, setSelectedCode] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (biomeSlugs.length > 0) params.set('biomeSlugs', biomeSlugs.join(','));
      if (categorie) params.set('categorie', categorie);
      if (niveau) params.set('niveau', niveau);
      if (search.trim()) params.set('q', search.trim());
      const data = await apiGL(`/api/gl/glossary?${params.toString()}`);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err.message || 'Chargement glossaire impossible');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [biomeSlugs, categorie, niveau, search]);

  const loadDetail = useCallback(async (code) => {
    if (!code) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const params = biomeSlugs.length > 0
        ? `?biomeSlugs=${encodeURIComponent(biomeSlugs.join(','))}`
        : '';
      const data = await apiGL(`/api/gl/glossary/${encodeURIComponent(code)}${params}`);
      setDetail(data);
    } catch (err) {
      setDetail({ error: err.message || 'Détail introuvable' });
    } finally {
      setDetailLoading(false);
    }
  }, [biomeSlugs]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (focusCode) {
      if (isMobileLayout && onOpenPopover) {
        onOpenPopover(focusCode);
      } else {
        setSelectedCode(focusCode);
        loadDetail(focusCode);
      }
      onFocusHandled?.();
    }
  }, [focusCode, isMobileLayout, loadDetail, onFocusHandled, onOpenPopover]);

  useEffect(() => {
    if (selectedCode && !isMobileLayout) loadDetail(selectedCode);
  }, [selectedCode, loadDetail, isMobileLayout]);

  const grouped = useMemo(() => groupByCategory(items), [items]);

  function selectTerm(code) {
    if (isMobileLayout && onOpenPopover) {
      onOpenPopover(code);
      return;
    }
    setSelectedCode(code);
    onOpenTerm?.(code);
  }

  return (
    <article className="gl-panel gl-glossary gl-animate-in">
      <h2>Glossaire</h2>
      {biomeLabel ? (
        <p className="gl-glossary__intro">
          Biomes du chapitre :
          {' '}
          <strong>{biomeLabel}</strong>
        </p>
      ) : (
        <p className="gl-hint">
          Aucun biome catalogue lié au chapitre — tous les termes actifs sont affichés.
        </p>
      )}

      <div className="gl-glossary__filters">
        <label>
          Recherche
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Terme, variante…"
          />
        </label>
        <label>
          Catégorie
          <select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Niveau
          <select value={niveau} onChange={(e) => setNiveau(e.target.value)}>
            {NIVEAU_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <p className="gl-hint">Chargement…</p> : null}
      {error ? <p className="gl-error">{error}</p> : null}

      <div className="gl-glossary__layout">
        <div className="gl-glossary__list">
          {Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'fr')).map((catLabel) => (
            <section key={catLabel} className="gl-glossary__group">
              <h3>{catLabel}</h3>
              <ul className="gl-glossary__terms">
                {grouped[catLabel].map((term) => (
                  <li key={term.glossary_code}>
                    <button
                      type="button"
                      className={selectedCode === term.glossary_code ? 'is-active' : ''}
                      onClick={() => selectTerm(term.glossary_code)}
                    >
                      <span className="gl-glossary__term-label">{term.terme}</span>
                      <span className="gl-glossary__term-meta">{term.niveau}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!loading && items.length === 0 ? (
            <p className="gl-hint">Aucun terme pour ces filtres.</p>
          ) : null}
        </div>

        <aside className="gl-glossary__detail gl-glossary__detail--desktop-only">
          {!selectedCode ? (
            <p className="gl-hint">Sélectionnez un terme pour afficher la fiche.</p>
          ) : detailLoading ? (
            <p className="gl-hint">Chargement de la fiche…</p>
          ) : detail?.error ? (
            <p className="gl-error">{detail.error}</p>
          ) : detail?.term ? (
            <>
              <h3>{detail.term.terme}</h3>
              <p className="gl-glossary__detail-meta">
                {detail.term.categorie_label || detail.term.categorie}
                {' · '}
                {detail.term.niveau}
              </p>
              {detail.term.definition_courte ? (
                <p className="gl-glossary__detail-lead">{detail.term.definition_courte}</p>
              ) : null}
              {detail.term.definition_complete ? (
                <p>{detail.term.definition_complete}</p>
              ) : null}
              {detail.term.exemple ? (
                <p><strong>Exemple :</strong> {detail.term.exemple}</p>
              ) : null}
              {detail.term.etymologie ? (
                <p><strong>Étymologie :</strong> {detail.term.etymologie}</p>
              ) : null}
              {Array.isArray(detail.relatedTerms) && detail.relatedTerms.length > 0 ? (
                <div className="gl-glossary__related">
                  <h4>Termes liés</h4>
                  <div className="gl-glossary-chips">
                    {detail.relatedTerms.map((t) => (
                      <button
                        key={t.glossary_code}
                        type="button"
                        className="gl-glossary-chip"
                        onClick={() => selectTerm(t.glossary_code)}
                      >
                        {t.terme}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {Array.isArray(detail.relatedSpecies) && detail.relatedSpecies.length > 0 ? (
                <div className="gl-glossary__related">
                  <h4>Espèces liées (biomes du chapitre)</h4>
                  <ul>
                    {detail.relatedSpecies.map((sp) => (
                      <li key={sp.species_code}>
                        {sp.nom_commun}
                        {' '}
                        <span className="gl-glossary__term-meta">({sp.type})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </aside>
      </div>
    </article>
  );
}
