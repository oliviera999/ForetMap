import React, { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

const TYPE_LABELS = {
  faune: 'Faune',
  flore: 'Flore',
};

function groupSpeciesByTypeAndGroup(items) {
  const byType = { faune: {}, flore: {} };
  for (const item of items) {
    const type = item.type === 'flore' ? 'flore' : 'faune';
    const group = item.groupe || 'Autres';
    if (!byType[type][group]) byType[type][group] = [];
    byType[type][group].push(item);
  }
  return byType;
}

function GLSpeciesCard({ species, onOpenGlossaryTerm }) {
  return (
    <article className="gl-species-card">
      {species.photo_url ? (
        <figure className="gl-species-card__media">
          <img src={species.photo_url} alt={species.nom_commun} loading="lazy" />
          {species.photo_credit ? (
            <figcaption className="gl-species-card__credit">
              {species.photo_credit}
              {species.photo_licence ? ` — ${species.photo_licence}` : ''}
            </figcaption>
          ) : null}
        </figure>
      ) : null}
      <div className="gl-species-card__body">
        <h4 className="gl-species-card__title">{species.nom_commun}</h4>
        {species.nom_scientifique ? (
          <p className="gl-species-card__scientific">
            <em>{species.nom_scientifique}</em>
          </p>
        ) : null}
        {species.description_courte ? (
          <p className="gl-species-card__desc">{species.description_courte}</p>
        ) : null}
        {species.role_ecologique ? (
          <p className="gl-species-card__role">
            <strong>Rôle :</strong> {species.role_ecologique}
          </p>
        ) : null}
        {species.adaptations_cles ? (
          <p className="gl-species-card__adapt">
            <strong>Adaptations :</strong> {species.adaptations_cles}
          </p>
        ) : null}
        {species.anecdote ? (
          <p className="gl-species-card__anecdote">{species.anecdote}</p>
        ) : null}
        {species.wikipedia_url ? (
          <p className="gl-species-card__links">
            <a href={species.wikipedia_url} target="_blank" rel="noopener noreferrer">
              En savoir plus (Wikipedia)
            </a>
          </p>
        ) : null}
        {Array.isArray(species.glossaryTerms) && species.glossaryTerms.length > 0 ? (
          <div className="gl-species-card__glossary">
            <strong>Glossaire :</strong>
            <div className="gl-glossary-chips">
              {species.glossaryTerms.map((term) => (
                <button
                  key={term.glossary_code}
                  type="button"
                  className="gl-glossary-chip"
                  onClick={() => onOpenGlossaryTerm?.(term.glossary_code)}
                >
                  {term.terme}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function GLSpeciesCatalogPanel({ biomeSlug, biomeNom, onOpenGlossaryTerm }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!biomeSlug) {
      setItems([]);
      setError('');
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    apiGL(`/api/gl/species?biomeSlug=${encodeURIComponent(biomeSlug)}`)
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Chargement des espèces impossible');
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [biomeSlug]);

  const grouped = useMemo(() => groupSpeciesByTypeAndGroup(items), [items]);

  if (loading) return <p className="gl-hint">Chargement du catalogue…</p>;
  if (error) return <p className="gl-error">{error}</p>;
  if (items.length === 0) {
    return (
      <p className="gl-hint">
        Aucune espèce importée pour le biome « {biomeNom || biomeSlug} ».
      </p>
    );
  }

  return (
    <div className="gl-species-catalog">
      {biomeNom ? (
        <p className="gl-species-catalog__intro">
          Biome :
          {' '}
          <strong>{biomeNom}</strong>
          {' '}
          —
          {' '}
          {items.length}
          {' '}
          espèce(s)
        </p>
      ) : null}
      {(['faune', 'flore']).map((typeKey) => {
        const groups = grouped[typeKey];
        const groupNames = Object.keys(groups);
        if (groupNames.length === 0) return null;
        return (
          <section key={typeKey} className="gl-species-catalog__section">
            <h3>{TYPE_LABELS[typeKey]}</h3>
            {groupNames.sort((a, b) => a.localeCompare(b, 'fr')).map((groupName) => (
              <div key={`${typeKey}-${groupName}`} className="gl-species-catalog__group">
                <h4>{groupName}</h4>
                <div className="gl-species-catalog__grid">
                  {groups[groupName].map((species) => (
                    <GLSpeciesCard
                      key={species.species_code || species.id}
                      species={species}
                      onOpenGlossaryTerm={onOpenGlossaryTerm}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

/**
 * @param {{ biomes?: Array<{ slug: string, nom?: string }>, onOpenGlossaryTerm?: (code: string) => void }} props
 */
export function GLSpeciesCatalog({ biomes = [], onOpenGlossaryTerm }) {
  const normalizedBiomes = useMemo(
    () => (Array.isArray(biomes) ? biomes : [])
      .filter((b) => b && b.slug)
      .map((b) => ({ slug: String(b.slug), nom: String(b.nom || b.slug) })),
    [biomes]
  );
  const [activeSlug, setActiveSlug] = useState(null);

  useEffect(() => {
    if (normalizedBiomes.length === 0) {
      setActiveSlug(null);
      return;
    }
    setActiveSlug((prev) => {
      if (prev && normalizedBiomes.some((b) => b.slug === prev)) return prev;
      return normalizedBiomes[0].slug;
    });
  }, [normalizedBiomes]);

  if (normalizedBiomes.length === 0) {
    return (
      <p className="gl-hint">
        Aucun biome du catalogue n’est lié à ce chapitre. Un MJ peut en choisir dans
        {' '}
        <strong>Contenus → Chapitres → Biomes (catalogue espèces)</strong>.
      </p>
    );
  }

  const activeBiome = normalizedBiomes.find((b) => b.slug === activeSlug) || normalizedBiomes[0];

  return (
    <div className="gl-species-catalog-multi">
      {normalizedBiomes.length > 1 ? (
        <>
          <p className="gl-species-catalog__intro">
            Biomes de ce chapitre :
            {' '}
            <strong>{normalizedBiomes.map((b) => b.nom).join(', ')}</strong>
          </p>
          <div className="gl-species-catalog__tabs" role="tablist" aria-label="Biomes du chapitre">
            {normalizedBiomes.map((biome) => (
              <button
                key={biome.slug}
                type="button"
                role="tab"
                aria-selected={activeBiome.slug === biome.slug}
                className={activeBiome.slug === biome.slug ? 'is-active' : ''}
                onClick={() => setActiveSlug(biome.slug)}
              >
                {biome.nom}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <GLSpeciesCatalogPanel
        key={activeBiome.slug}
        biomeSlug={activeBiome.slug}
        biomeNom={activeBiome.nom}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
      />
    </div>
  );
}
