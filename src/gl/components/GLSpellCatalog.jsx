import React, { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GL_SPELL_CATEGORY_LABELS } from '../utils/glSpellFieldLabels.js';

function GLSpellTile({ spell, onSelect }) {
  const nom = String(spell.nom || '').trim() || 'Sort';
  const cost =
    String(spell.cout_total_eq || '').trim() ||
    [
      Number(spell.cout_gemmes) > 0 ? `${spell.cout_gemmes} 💎` : '',
      Number(spell.cout_coeurs) > 0 ? `${spell.cout_coeurs} ❤️` : '',
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <button
      type="button"
      className="gl-spell-tile"
      aria-label={`Ouvrir le sort ${nom}`}
      onClick={() => onSelect(spell)}
    >
      <span className="gl-spell-tile__emoji" aria-hidden="true">
        {spell.emoji || '✨'}
      </span>
      <span className="gl-spell-tile__labels">
        <span className="gl-spell-tile__name">{nom}</span>
        {cost ? <span className="gl-spell-tile__cost">{cost}</span> : null}
        {spell.effet_court ? (
          <span className="gl-spell-tile__effect">{spell.effet_court}</span>
        ) : null}
      </span>
    </button>
  );
}

function GLSpellCatalogPanel({ categorySlug, categoryNom, spellCodes, onSelectSpell }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!categorySlug || spellCodes.length === 0) {
      setItems([]);
      setError('');
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ spellCodes: spellCodes.join(',') });
    apiGL(`/api/gl/spells?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        const all = Array.isArray(data?.items) ? data.items : [];
        setItems(all.filter((s) => s.category_slug === categorySlug));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Chargement des sorts impossible');
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categorySlug, spellCodes]);

  if (loading) return <p className="gl-hint">Chargement des sorts…</p>;
  if (error) return <p className="gl-error">{error}</p>;
  if (items.length === 0) {
    return (
      <p className="gl-hint">
        Aucun sort de la catégorie « {categoryNom || categorySlug} » pour ce chapitre.
      </p>
    );
  }

  return (
    <div className="gl-spell-catalog">
      <p className="gl-spell-catalog__intro">
        {categoryNom ? (
          <>
            Catégorie : <strong>{categoryNom}</strong> —{' '}
          </>
        ) : null}
        {items.length} sort(s)
      </p>
      <div className="gl-spell-catalog__grid">
        {items.map((spell) => (
          <GLSpellTile key={spell.spell_code} spell={spell} onSelect={onSelectSpell} />
        ))}
      </div>
    </div>
  );
}

/**
 * @param {{ chapterSpells?: Array<{ spell_code: string, category_slug: string, nom?: string }>, onOpenSpell?: (code: string) => void }} props
 */
export function GLSpellCatalog({ chapterSpells = [], onOpenSpell }) {
  const spellCodes = useMemo(
    () =>
      (Array.isArray(chapterSpells) ? chapterSpells : [])
        .map((s) =>
          String(s.spell_code || '')
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    [chapterSpells],
  );

  const categories = useMemo(() => {
    const map = new Map();
    for (const entry of chapterSpells) {
      const slug = String(entry.category_slug || '').trim();
      if (!slug || map.has(slug)) continue;
      map.set(slug, {
        slug,
        nom: GL_SPELL_CATEGORY_LABELS[slug] || slug.replace(/_/g, ' '),
      });
    }
    return [...map.values()];
  }, [chapterSpells]);

  const [activeSlug, setActiveSlug] = useState(null);

  useEffect(() => {
    if (categories.length === 0) {
      setActiveSlug(null);
      return;
    }
    setActiveSlug((prev) => {
      if (prev && categories.some((c) => c.slug === prev)) return prev;
      return categories[0].slug;
    });
  }, [categories]);

  if (spellCodes.length === 0) {
    return (
      <p className="gl-hint">
        Aucun sort n’est lié à ce chapitre. Un MJ peut en choisir dans{' '}
        <strong>Contenus → Chapitres → Sorts du chapitre</strong>.
      </p>
    );
  }

  const activeCategory = categories.find((c) => c.slug === activeSlug) || categories[0];

  function handleSelect(spell) {
    const code = String(spell?.spell_code || '').trim();
    if (code) onOpenSpell?.(code);
  }

  return (
    <div className="gl-spell-catalog-multi">
      {categories.length > 1 ? (
        <div className="gl-spell-catalog__tabs" role="tablist" aria-label="Catégories de sorts">
          {categories.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              role="tab"
              aria-selected={activeCategory.slug === cat.slug}
              className={activeCategory.slug === cat.slug ? 'is-active' : ''}
              onClick={() => setActiveSlug(cat.slug)}
            >
              {cat.nom}
            </button>
          ))}
        </div>
      ) : null}
      <GLSpellCatalogPanel
        key={activeCategory.slug}
        categorySlug={activeCategory.slug}
        categoryNom={activeCategory.nom}
        spellCodes={spellCodes}
        onSelectSpell={handleSelect}
      />
    </div>
  );
}
