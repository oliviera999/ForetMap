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

export function GLGlossaryView({
  gameState,
  focusCode,
  activeTermCode = null,
  onOpenPopover,
  onFocusHandled,
  learningProgress,
}) {
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

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categorie, setCategorie] = useState('');
  const [niveau, setNiveau] = useState('');
  const [search, setSearch] = useState('');

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

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!focusCode) return;
    onOpenPopover?.(focusCode);
    onFocusHandled?.();
  }, [focusCode, onFocusHandled, onOpenPopover]);

  const grouped = useMemo(() => groupByCategory(items), [items]);

  function selectTerm(code) {
    onOpenPopover?.(code);
  }

  return (
    <article className="gl-panel gl-glossary fade-in">
      <h2>Glossaire</h2>
      {biomeLabel ? (
        <p className="gl-glossary__intro">
          Biomes du chapitre :
          {' '}
          <strong>{biomeLabel}</strong>
          {' '}
          — cliquez sur un terme pour ouvrir sa définition.
        </p>
      ) : (
        <p className="gl-hint">
          Aucun biome catalogue lié au chapitre — tous les termes actifs sont affichés.
          Cliquez sur un terme pour ouvrir sa définition.
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

      <div className="gl-glossary__list">
        {Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'fr')).map((catLabel) => (
          <section key={catLabel} className="gl-glossary__group">
            <h3>{catLabel}</h3>
            <ul className="gl-glossary__terms">
              {grouped[catLabel].map((term) => {
                const code = String(term.glossary_code || '').trim();
                const learned = learningProgress?.isGlossaryLearned?.(code) || !!term.learned;
                return (
                  <li key={term.glossary_code}>
                    <button
                      type="button"
                      className={[
                        activeTermCode === term.glossary_code ? 'is-active' : '',
                        learned ? 'is-learned' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => selectTerm(term.glossary_code)}
                      title={term.definition_courte || term.terme}
                    >
                      <span className="gl-glossary__term-label">{term.terme}</span>
                      <span className="gl-glossary__term-meta">
                        {learned ? '✓ Appris · ' : ''}
                        {term.niveau}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!loading && items.length === 0 ? (
          <p className="gl-hint">Aucun terme pour ces filtres.</p>
        ) : null}
      </div>
    </article>
  );
}
