import React from 'react';
import { GLButton } from '../ui/GLButton.jsx';
import { moveBiomeSlug } from '../../utils/glChapterAdminForm.js';

/**
 * Sélecteur multiple de biomes (catalogue espèces) d'un chapitre, avec ordre
 * réglable (↑/↓/Retirer) et liste de cases à cocher.
 * Composant feuille prop-driven : l'ordre et la sélection vivent dans le parent
 * via onChange(nextSlugs).
 *
 * @param {Array} biomes catalogue { slug, nom, species_count }
 * @param {string[]} selectedSlugs slugs sélectionnés (ordonnés)
 * @param {(nextSlugs:string[])=>void} onChange
 */
export function GLChapterBiomesFieldset({ biomes, selectedSlugs, onChange }) {
  return (
    <fieldset className="gl-chapter-biomes-fieldset">
      <legend>Biomes (catalogue espèces)</legend>
      <p className="gl-hint">
        Sélection multiple : alimente la Biodiversité, le glossaire scientifique et les tirages QCM
        du chapitre.
      </p>
      {selectedSlugs.length > 0 ? (
        <ol className="gl-chapter-biomes-selected">
          {selectedSlugs.map((slug) => {
            const biome = biomes.find((b) => b.slug === slug);
            return (
              <li key={slug}>
                <span>
                  {biome?.nom || slug}
                  {biome?.species_count != null ? ` (${biome.species_count} esp.)` : ''}
                </span>
                <span className="gl-inline-actions">
                  <GLButton
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onChange(moveBiomeSlug(selectedSlugs, slug, -1))}
                  >
                    ↑
                  </GLButton>
                  <GLButton
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onChange(moveBiomeSlug(selectedSlugs, slug, 1))}
                  >
                    ↓
                  </GLButton>
                  <GLButton
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onChange(selectedSlugs.filter((s) => s !== slug))}
                  >
                    Retirer
                  </GLButton>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="gl-hint">Aucun biome catalogue sélectionné.</p>
      )}
      <ul className="gl-chapter-biomes-options">
        {biomes.map((biome) => {
          const checked = selectedSlugs.includes(biome.slug);
          return (
            <li key={biome.slug}>
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...selectedSlugs, biome.slug]
                      : selectedSlugs.filter((s) => s !== biome.slug);
                    onChange(next);
                  }}
                />
                {biome.nom} ({biome.species_count || 0} esp.)
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
