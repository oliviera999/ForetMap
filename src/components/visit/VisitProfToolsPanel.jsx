import React from 'react';
import { VisitSyncPanel } from './VisitSyncPanel.jsx';

/**
 * Panneau repliable « Outils et synchronisation visite » (prof hors aperçu élève) :
 * bascule navigation / dessin de zone / pose de repère, actions du tracé en cours,
 * import sélectif carte↔visite (`VisitSyncPanel`) et lien vers le studio packs mascotte.
 * L'état (mode, points du tracé, création) reste dans `VisitView`.
 *
 * @param {'view'|'draw-zone'|'add-marker'} mode mode d'interaction courant du plan.
 * @param {Function} onSetMode change de mode (la bascule navigation vide aussi le tracé côté parent).
 * @param {number} drawPointsCount points posés du tracé de zone en cours.
 * @param {Function|null} onOpenMascotPackStudioTab ouvre l'onglet studio (null = bloc masqué).
 */
export function VisitProfToolsPanel({
  isTeacher = false,
  loading = false,
  visitMapImageReady = false,
  mode,
  onSetMode,
  drawPointsCount = 0,
  creating = false,
  onCreateZone,
  onUndoDrawPoint,
  onClearDrawPoints,
  mapId,
  onSynced,
  onForceLogout,
  onOpenMascotPackStudioTab = null,
}) {
  return (
    <details className="visit-prof-tools">
      <summary className="visit-prof-tools__summary">Outils et synchronisation visite</summary>
      <div className="visit-prof-tools__body">
        {!visitMapImageReady && !loading && (
          <p className="section-sub visit-map-image-hint" style={{ margin: '0 0 8px' }}>
            Chargement du plan… Les outils zone et repère sont disponibles une fois l’image affichée
            (coordonnées précises).
          </p>
        )}
        <div className="visit-map-switch">
          <button
            type="button"
            className={`btn btn-sm ${mode === 'view' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => onSetMode('view')}
          >
            🖐️ Navigation
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'draw-zone' ? 'btn-primary' : 'btn-ghost'}`}
            disabled={!visitMapImageReady}
            title={!visitMapImageReady ? 'Disponible dès que le plan est chargé.' : undefined}
            onClick={() => onSetMode('draw-zone')}
          >
            🖊️ Zone visite
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'add-marker' ? 'btn-primary' : 'btn-ghost'}`}
            disabled={!visitMapImageReady}
            title={!visitMapImageReady ? 'Disponible dès que le plan est chargé.' : undefined}
            onClick={() => onSetMode('add-marker')}
          >
            📍 Repère visite
          </button>
          {mode === 'draw-zone' && (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={drawPointsCount < 3 || creating}
                onClick={onCreateZone}
              >
                ✅ Terminer zone ({drawPointsCount})
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onUndoDrawPoint}>
                ↩️ Retirer point
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={onClearDrawPoints}>
                ✕ Annuler
              </button>
            </>
          )}
        </div>
        <VisitSyncPanel
          isTeacher={isTeacher}
          mapId={mapId}
          onSynced={onSynced}
          onForceLogout={onForceLogout}
        />
        {typeof onOpenMascotPackStudioTab === 'function' ? (
          <section className="visit-mascot-preview-card" aria-label="Studio packs mascotte">
            <div>
              <h3>🧩 Studio packs mascotte</h3>
              <p className="section-sub" style={{ marginBottom: 8 }}>
                L’édition complète des mascottes (packs, bibliothèque, comportements) est
                centralisée dans l’onglet dédié.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onOpenMascotPackStudioTab}
              >
                Ouvrir l’onglet Packs mascotte
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </details>
  );
}
