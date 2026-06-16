import React from 'react';

/**
 * Barre d'actions groupées (présentation) de la bibliothèque média en mode
 * galerie — extraite de `MediaLibraryMenu` (O6). Affiche les quatre boutons
 * « Tout sélectionner / désélectionner », « Supprimer la sélection » (avec
 * compteur) et « Vider la bibliothèque ». DOM/classes/textes inchangés ; toute
 * la logique (état, suppression) reste dans le parent qui passe les valeurs et
 * les callbacks.
 *
 * @param {object} props
 * @param {boolean} props.busy désactive les boutons pendant un chargement
 * @param {number} props.visibleCount nombre de médias visibles (filtre actif)
 * @param {number} props.selectedCount nombre de médias sélectionnés
 * @param {number} props.totalCount nombre total de médias dans la bibliothèque
 * @param {() => void} props.onSelectAll sélectionne tous les médias visibles
 * @param {() => void} props.onDeselectAll vide la sélection
 * @param {() => void} props.onDeleteSelected supprime les médias sélectionnés
 * @param {() => void} props.onClearLibrary vide toute la bibliothèque
 */
export function MediaLibraryBulkActions({
  busy = false,
  visibleCount = 0,
  selectedCount = 0,
  totalCount = 0,
  onSelectAll,
  onDeselectAll,
  onDeleteSelected,
  onClearLibrary,
}) {
  return (
    <div className="media-library-menu__bulk">
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy || visibleCount === 0} onClick={onSelectAll}>
        Tout sélectionner
      </button>
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy || selectedCount === 0} onClick={onDeselectAll}>
        Tout désélectionner
      </button>
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy || selectedCount === 0} onClick={onDeleteSelected}>
        Supprimer la sélection{selectedCount > 0 ? ` (${selectedCount})` : ''}
      </button>
      <button type="button" className="btn btn-secondary btn-sm gl-danger" disabled={busy || totalCount === 0} onClick={onClearLibrary}>
        Vider la bibliothèque
      </button>
    </div>
  );
}
