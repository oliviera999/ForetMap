import React from 'react';
import { GLMultiCheckDropdown } from './GLMultiCheckDropdown.jsx';

/**
 * Panneau de configuration du pool de questions d'un repère GL.
 * Composant feuille prop-driven : aucun état interne, toute modification du
 * pool remonte via `onPatchPool(patch)`. Selon le catalogue (`isLoreSet`),
 * affiche la sélection de scopes lore ou de biomes, puis les filtres communs
 * (catégories, tier lore, niveaux, difficulté min/max).
 *
 * @param {object}   pool                pool courant du formulaire
 * @param {boolean}  isLoreSet           catalogue lore actif
 * @param {string[]} chapterBiomeSlugs   slugs des biomes du chapitre
 * @param {{value,label}[]} loreScopeOptions
 * @param {{value,label}[]} additionalBiomeOptions
 * @param {{value,label}[]} categoryOptions
 * @param {{value,label}[]} tierLoreOptions
 * @param {{value,label}[]} niveauOptions
 * @param {(patch:object)=>void} onPatchPool
 */
export function GLMarkerQuestionPoolFilters({
  pool,
  isLoreSet,
  chapterBiomeSlugs,
  loreScopeOptions,
  additionalBiomeOptions,
  categoryOptions,
  tierLoreOptions,
  niveauOptions,
  onPatchPool,
}) {
  return (
    <>
      {isLoreSet ? (
        <>
          <label>
            Chapitres lore du pool
            <select
              value={pool.chapitreMode || 'chapter'}
              onChange={(event) => onPatchPool({ chapitreMode: event.target.value })}
            >
              <option value="chapter">Chapitre courant + transversal (tous)</option>
              <option value="custom">Scopes personnalisés</option>
            </select>
          </label>
          {pool.chapitreMode === 'custom' ? (
            <GLMultiCheckDropdown
              label="Scopes chapitre lore"
              options={loreScopeOptions}
              selectedValues={pool.chapitreSlugs || []}
              onChange={(values) => onPatchPool({ chapitreSlugs: values })}
              emptyLabel="Tous + chapitre courant"
              allSelectedLabel="Tous les scopes"
            />
          ) : (
            <p className="gl-hint">
              Inclut automatiquement les questions « tous » et le scope lié au plateau du chapitre (ex. ch3).
            </p>
          )}
        </>
      ) : (
        <>
          <label>
            Biomes du pool
            <select
              value={pool.biomeMode}
              onChange={(event) => onPatchPool({ biomeMode: event.target.value })}
            >
              <option value="chapter">Biomes du chapitre (défaut)</option>
              <option value="custom">Chapitre + biomes additionnels</option>
            </select>
          </label>

          {pool.biomeMode === 'custom' ? (
            <div className="gl-marker-event-biomes">
              <p className="gl-hint">
                Biomes du chapitre :
                {' '}
                {chapterBiomeSlugs.length ? chapterBiomeSlugs.join(', ') : 'aucun'}
              </p>
              <GLMultiCheckDropdown
                label="Biomes additionnels"
                options={additionalBiomeOptions}
                selectedValues={pool.biomeSlugs || []}
                onChange={(values) => onPatchPool({ biomeSlugs: values })}
                emptyLabel="Aucun biome additionnel"
                allSelectedLabel="Tous les biomes additionnels"
              />
            </div>
          ) : null}
        </>
      )}

      <div className="gl-marker-event-filters">
        <GLMultiCheckDropdown
          label={isLoreSet ? 'Catégories lore' : 'Catégories QCM'}
          options={categoryOptions}
          selectedValues={pool.categorieSlugs || []}
          onChange={(values) => onPatchPool({ categorieSlugs: values })}
          emptyLabel="Toutes les catégories"
          allSelectedLabel="Toutes les catégories"
        />
        {isLoreSet ? (
          <GLMultiCheckDropdown
            label="Tier lore"
            options={tierLoreOptions}
            selectedValues={pool.tierLore || []}
            onChange={(values) => onPatchPool({ tierLore: values })}
            emptyLabel="Tous les tiers"
            allSelectedLabel="Tous les tiers"
          />
        ) : null}
        <GLMultiCheckDropdown
          label="Niveaux"
          options={niveauOptions}
          selectedValues={pool.niveaux || []}
          onChange={(values) => onPatchPool({ niveaux: values })}
          emptyLabel="Tous les niveaux"
          allSelectedLabel="Tous les niveaux"
        />
      </div>

      <div className="gl-marker-event-difficulte">
        <label>
          Difficulté min
          <input
            type="number"
            min="1"
            max="5"
            value={pool.difficulteMin ?? ''}
            onChange={(event) => onPatchPool({
              difficulteMin: event.target.value === '' ? null : Number(event.target.value),
            })}
          />
        </label>
        <label>
          Difficulté max
          <input
            type="number"
            min="1"
            max="5"
            value={pool.difficulteMax ?? ''}
            onChange={(event) => onPatchPool({
              difficulteMax: event.target.value === '' ? null : Number(event.target.value),
            })}
          />
        </label>
      </div>

      <label>
        Recherche (libellé, tags, mots-clés)
        <input
          type="search"
          value={pool.searchQuery || ''}
          onChange={(event) => onPatchPool({ searchQuery: event.target.value })}
        />
      </label>
    </>
  );
}
