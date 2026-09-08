import { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLSpeciesCatalog } from './GLSpeciesCatalog.jsx';
import { GLSpeciesDetailModal } from './GLSpeciesDetailModal.jsx';
import { GLFoodWebPanel } from './GLFoodWebPanel.jsx';

export function GLBiodiversityView({
  gameState,
  onOpenGlossaryTerm,
  glossaryLinkItems = [],
  learningProgress,
  loreCarnetEnabled = false,
  speciesFocusCode = null,
  onSpeciesFocusHandled,
  canManageContent = false,
}) {
  const biomes = Array.isArray(gameState?.game?.chapter_biomes)
    ? gameState.game.chapter_biomes
    : [];

  // Deep-link « Voir » depuis le carnet : ouvre la fiche de l'espèce ciblée en la
  // récupérant par code (indépendant de l'onglet biome courant du catalogue).
  const [panel, setPanel] = useState('catalogue');
  const [focusSpecies, setFocusSpecies] = useState(null);
  useEffect(() => {
    if (!speciesFocusCode) return undefined;
    let cancelled = false;
    apiGL(`/api/gl/species/${encodeURIComponent(speciesFocusCode)}`)
      .then((res) => {
        if (!cancelled && res?.species) setFocusSpecies(res.species);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) onSpeciesFocusHandled?.();
      });
    return () => {
      cancelled = true;
    };
  }, [speciesFocusCode, onSpeciesFocusHandled]);

  return (
    <article className="gl-panel fade-in">
      <h2>Biodiversité</h2>
      <nav className="gl-subtabs" role="tablist" aria-label="Biodiversité">
        <button
          type="button"
          role="tab"
          aria-selected={panel === 'catalogue'}
          className={panel === 'catalogue' ? 'is-active' : ''}
          onClick={() => setPanel('catalogue')}
        >
          Catalogue
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={panel === 'reseau'}
          className={panel === 'reseau' ? 'is-active' : ''}
          onClick={() => setPanel('reseau')}
        >
          Réseau
        </button>
      </nav>
      {panel === 'catalogue' ? (
        <GLSpeciesCatalog
          biomes={biomes}
          gameId={gameState?.game?.id ?? null}
          loreCarnetEnabled={loreCarnetEnabled}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
          glossaryLinkItems={glossaryLinkItems}
          learningProgress={learningProgress}
        />
      ) : (
        <GLFoodWebPanel
          biomes={biomes}
          canManage={canManageContent}
          onOpenSpecies={async (speciesId) => {
            const id = Number(speciesId);
            if (!Number.isInteger(id) || id <= 0) return;
            try {
              const list = await apiGL(
                `/api/gl/food-web${biomes[0]?.slug ? `?biomeSlug=${encodeURIComponent(biomes[0].slug)}` : ''}`,
              );
              const hit = (list?.items || []).find(
                (row) => Number(row.from_id) === id || Number(row.to_id) === id,
              );
              const codeGuess = hit?.from_id === id ? hit.from_name : hit?.to_name;
              if (!codeGuess) return;
            } catch {
              /* ouverture best-effort via catalogue déjà ouvert */
            }
          }}
        />
      )}
      {focusSpecies ? (
        <GLSpeciesDetailModal
          species={focusSpecies}
          onClose={() => setFocusSpecies(null)}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
          learningProgress={learningProgress}
          gameId={gameState?.game?.id ?? null}
          loreCarnetEnabled={loreCarnetEnabled}
        />
      ) : null}
    </article>
  );
}
