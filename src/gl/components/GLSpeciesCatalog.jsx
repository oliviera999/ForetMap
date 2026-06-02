import React, { useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLSpeciesDetailModal } from './GLSpeciesDetailModal.jsx';

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

function GLSpeciesTile({ species, onSelect, isLearned }) {
  const nomCommun = String(species.nom_commun || '').trim() || 'Espèce';
  const nomScientifique = String(species.nom_scientifique || '').trim();

  return (
    <button
      type="button"
      className={`gl-species-tile${isLearned ? ' gl-species-tile--learned' : ''}`}
      aria-label={`Ouvrir la fiche de ${nomCommun}`}
      onClick={() => onSelect(species)}
    >
      <span className="gl-species-tile__media" aria-hidden="true">
        {species.photo_url ? (
          <img src={species.photo_url} alt="" loading="lazy" />
        ) : (
          <span className="gl-species-tile__placeholder" />
        )}
        <span className="gl-species-tile__hint">{isLearned ? 'Étudiée' : 'Fiche'}</span>
      </span>
      <span className="gl-species-tile__labels">
        <span className="gl-species-tile__name">{nomCommun}</span>
        {isLearned ? <span className="gl-species-tile__learned-badge" aria-hidden>✓</span> : null}
        {nomScientifique ? (
          <span className="gl-species-tile__scientific">
            <em>{nomScientifique}</em>
          </span>
        ) : null}
      </span>
    </button>
  );
}

function GLSpeciesCatalogPanel({ biomeSlug, biomeNom, onOpenGlossaryTerm, learningProgress }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [selectedSpecies, setSelectedSpecies] = useState(null);

  useEffect(() => {
    if (!biomeSlug) {
      setItems([]);
      setError('');
      setSelectedSpecies(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setSelectedSpecies(null);
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
                <div className="gl-species-catalog__grid gl-species-catalog__grid--dense">
                  {groups[groupName].map((species) => {
                    const code = String(species.species_code || '').trim();
                    const learned = learningProgress?.isSpeciesLearned?.(code)
                      || !!species.learned;
                    return (
                      <GLSpeciesTile
                        key={species.species_code || species.id}
                        species={species}
                        onSelect={setSelectedSpecies}
                        isLearned={learned}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        );
      })}
      <GLSpeciesDetailModal
        species={selectedSpecies}
        biomeNom={biomeNom}
        onClose={() => setSelectedSpecies(null)}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
        learningProgress={learningProgress}
      />
    </div>
  );
}

/**
 * @param {{ biomes?: Array<{ slug: string, nom?: string }>, onOpenGlossaryTerm?: (code: string) => void }} props
 */
export function GLSpeciesCatalog({ biomes = [], onOpenGlossaryTerm, learningProgress }) {
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
        learningProgress={learningProgress}
      />
    </div>
  );
}
