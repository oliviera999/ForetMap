import React from 'react';

/**
 * Barre d’actions groupées du panneau Images mascotte (sélection multiple).
 * Présentation pure : état et logique dans le parent.
 */
export default function MascotPackImagesBulkBar({
  busy = false,
  selectedCount = 0,
  visibleCount = 0,
  targetLabel = '',
  canRename = false,
  canReplace = false,
  canRemoveFromState = false,
  canMoveBlock = false,
  onSelectAll,
  onDeselectAll,
  onInvertSelection,
  onSelectDeletable,
  onSelectUnreferenced,
  onSelectInTargetState,
  onSelectSourceFilter,
  onBulkInsert,
  onBulkDelete,
  onBulkRename,
  onBulkReplace,
  onRemoveFromTargetState,
  onMoveBlockUp,
  onMoveBlockDown,
  onOpenInteractionDialog,
}) {
  const hasSelection = selectedCount > 0;

  return (
    <div className="mascot-pack-images-panel__bulk">
      <div className="mascot-pack-images-panel__bulk-select">
        <span className="section-sub" style={{ fontSize: '0.78rem' }}>
          Sélection{hasSelection ? ` (${selectedCount})` : ''}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy || visibleCount === 0}
          onClick={onSelectAll}
        >
          Tout
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy || selectedCount === 0}
          onClick={onDeselectAll}
        >
          Rien
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy || visibleCount === 0}
          onClick={onInvertSelection}
        >
          Inverser
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || visibleCount === 0}
          onClick={onSelectDeletable}
        >
          Supprimables
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || visibleCount === 0}
          onClick={onSelectUnreferenced}
        >
          Non référencés
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || visibleCount === 0}
          onClick={onSelectInTargetState}
        >
          Dans l’état cible
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || visibleCount === 0}
          onClick={onSelectSourceFilter}
        >
          Origine filtre
        </button>
      </div>

      {hasSelection ? (
        <div className="mascot-pack-images-panel__bulk-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={onBulkInsert}
          >
            + {targetLabel} ({selectedCount})
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={onOpenInteractionDialog}
          >
            Comportements visite
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy}
            onClick={onBulkDelete}
          >
            Supprimer ({selectedCount})
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy || !canRename}
            title={
              canRename ? 'Renommer les fichiers pack ou carte' : 'Sélection pack/carte requise'
            }
            onClick={onBulkRename}
          >
            Renommer
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy || !canReplace}
            title={canReplace ? 'Remplacer le PNG sur disque' : 'Sprites site non remplaçables'}
            onClick={onBulkReplace}
          >
            Remplacer
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy || !canRemoveFromState}
            onClick={onRemoveFromTargetState}
          >
            Retirer de l’état
          </button>
          {canMoveBlock ? (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={onMoveBlockUp}
              >
                Monter bloc
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={onMoveBlockDown}
              >
                Descendre bloc
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
