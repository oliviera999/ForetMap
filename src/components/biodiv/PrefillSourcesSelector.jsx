import React from 'react';

/** Sources externes pré-saisie (ids alignés sur `GET /api/plants/autofill?sources=`). */
export const SPECIES_PREFILL_SOURCE_CHECKBOXES = [
  { id: 'wikipedia', label: 'Wikipedia (FR)' },
  { id: 'wikidata', label: 'Wikidata' },
  { id: 'gbif', label: 'GBIF (taxonomie)' },
  { id: 'gbif_traits', label: 'GBIF — descriptions / traits' },
  { id: 'gbif_vernacular', label: 'GBIF — noms vernaculaires' },
  { id: 'inaturalist', label: 'iNaturalist' },
  { id: 'catalogue_of_life', label: 'Catalogue of Life' },
  { id: 'wikipedia_en', label: 'Wikipedia (EN, secours)' },
  { id: 'wikipedia_heuristic', label: 'Heuristiques (extrait FR)' },
  { id: 'trefle', label: 'Trefle' },
  { id: 'openai', label: 'OpenAI' },
];

/**
 * Sélecteur (présentation) des sources externes interrogées par la pré-saisie — extrait de
 * `PlantPrefillPanel` (O6). Affiche un `<details>` repliable listant chaque source avec une
 * case à cocher ; l’état coché et la bascule restent gérés par le parent.
 *
 * @param {object} props
 * @param {Record<string, boolean>} props.sources état coché par id de source
 * @param {(id: string) => void} props.onToggle bascule la source d’id donné
 */
export function PrefillSourcesSelector({ sources, onToggle }) {
  return (
    <details className="plant-more" style={{ marginBottom: 8 }}>
      <summary style={{ cursor: 'pointer', fontSize: '.88rem' }}>Sources à interroger</summary>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 6,
          marginTop: 8,
        }}
      >
        {SPECIES_PREFILL_SOURCE_CHECKBOXES.map((row) => (
          <label
            key={row.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '.8rem',
              color: '#333',
            }}
          >
            <input type="checkbox" checked={!!sources[row.id]} onChange={() => onToggle(row.id)} />
            <span>{row.label}</span>
            <small style={{ color: '#888' }}>({row.id})</small>
          </label>
        ))}
      </div>
    </details>
  );
}
