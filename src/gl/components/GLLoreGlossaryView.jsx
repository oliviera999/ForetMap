import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

const CATEGORY_OPTIONS = [
  { value: '', label: 'Toutes catégories' },
  { value: 'cosmologie', label: 'Cosmologie' },
  { value: 'menace', label: 'Menace' },
  { value: 'peuple', label: 'Peuple' },
  { value: 'personnage', label: 'Personnage' },
  { value: 'creature', label: 'Créature' },
  { value: 'objet', label: 'Objet' },
  { value: 'lieu', label: 'Lieu' },
  { value: 'rituel', label: 'Rituel' },
  { value: 'concept', label: 'Concept' },
  { value: 'epoque', label: 'Époque' },
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

export function GLLoreGlossaryView({
  focusCode,
  activeTermCode = null,
  onOpenPopover,
  onFocusHandled,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categorie, setCategorie] = useState('');
  const [search, setSearch] = useState('');

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (categorie) params.set('categorie', categorie);
      if (search.trim()) params.set('q', search.trim());
      const data = await apiGL(`/api/gl/lore/glossary?${params.toString()}`);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err.message || 'Chargement lexique impossible');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [categorie, search]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!focusCode) return;
    onOpenPopover?.(focusCode);
    onFocusHandled?.();
  }, [focusCode, onFocusHandled, onOpenPopover]);

  const grouped = useMemo(() => groupByCategory(items), [items]);

  return (
    <article className="gl-panel gl-lore-glossary fade-in">
      <h2>Lexique du lore</h2>
      <p className="gl-hint">
        Vocabulaire narratif de Gnomes &amp; Licornes (distinct du glossaire SVT).
      </p>
      <div className="gl-glossary-filters">
        <label>
          Catégorie
          <select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Recherche
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Terme…"
          />
        </label>
      </div>
      {error ? <p className="gl-error">{error}</p> : null}
      {loading ? <p className="gl-hint">Chargement…</p> : null}
      {Object.entries(grouped).map(([cat, rows]) => (
        <section key={cat} className="gl-glossary-group">
          <h3>{cat}</h3>
          <ul className="gl-glossary-term-list">
            {rows.map((item) => (
              <li key={item.lore_code}>
                <button
                  type="button"
                  className={activeTermCode === item.lore_code ? 'is-active' : ''}
                  onClick={() => onOpenPopover?.(item.lore_code)}
                >
                  <strong>{item.terme}</strong>
                  {item.definition_courte ? <span>{item.definition_courte}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
