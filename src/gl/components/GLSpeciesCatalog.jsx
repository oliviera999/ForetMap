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

function GLSpeciesCard({ species }) {
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
      </div>
    </article>
  );
}

export function GLSpeciesCatalog({ biomeSlug, biomeNom }) {
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

  if (!biomeSlug) {
    return (
      <p className="gl-hint">
        Aucun biome du catalogue n’est lié à ce chapitre. Un MJ peut en choisir un dans
        {' '}
        <strong>Contenus → Chapitres → Biome (catalogue espèces)</strong>.
      </p>
    );
  }

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
                    <GLSpeciesCard key={species.species_code || species.id} species={species} />
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
